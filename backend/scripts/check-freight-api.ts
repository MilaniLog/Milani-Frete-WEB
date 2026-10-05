import 'dotenv/config';
import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ValidationPipe } from '@nestjs/common';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Teste opt-in com banco real. Todos os registros ficam numa transação
// externa revertida obrigatoriamente. IDs AUTO_INCREMENT podem ter lacunas.
// Não testa login nem concorrência; JWT usa segredo efêmero exclusivo do teste.
async function main() {
  const prisma = new PrismaService();
  const rollback = new Error('ROLLBACK_TEST_FIXTURES');
  const marker = `T${randomBytes(4).toString('hex')}`;
  const secret = randomBytes(32).toString('hex');
  let app;
  let checks = 0;
  let fixtureId: number | undefined;
  const expenseIds: number[] = [];
  let createdWeekCode: string | undefined;
  let closureId: number | undefined;
  let invoiceTypeId: number | undefined;
  let invoiceId: number | undefined;
  try {
    await prisma.$connect();
    try {
      await prisma.$transaction(
        async (tx) => {
          const template = await tx.frete_carregamento_manifestos.findFirst();
          assert(
            template,
            'É necessário um manifesto existente como referência de unidade/veículo.',
          );
          const employee = await tx.employees.findFirst({
            where: { unit: template.unit },
            select: { id: true, cod: true },
          });
          assert(
            employee,
            'É necessário funcionário na unidade do manifesto de referência.',
          );
          const vehicle = await tx.vehicle.findFirst({
            where: { canceled: false },
            select: { plate: true },
          });
          assert(
            vehicle,
            'É necessário um veículo ativo para o vínculo do lançamento.',
          );
          // Registro isolado; nenhum manifesto operacional é modificado.
          const fixture = await tx.frete_carregamento_manifestos.create({
            data: {
              unit: template.unit,
              origem: 'SP',
              semana: new Date('2026-09-22T00:00:00Z'),
              manifestos: marker,
              hora: '10:00',
              placa: vehicle.plate,
              motorista: 'TESTE API',
              tipo_veiculo: template.tipo_veiculo,
              destino: 'TESTE API',
              qtd_nf: 1,
              usuario: String(employee.cod),
              cod_777_00: 1000,
              frete_veiculo: 100,
              ctrb_total: 200,
              valor_liquido: 180,
            },
          });
          fixtureId = fixture.id;
          let savepoint = 0;
          const scoped = new Proxy(tx, {
            get(target, key) {
              if (key === '$transaction')
                return async (action) => {
                  const name = `api_check_${++savepoint}`;
                  await tx.$executeRawUnsafe(`SAVEPOINT ${name}`);
                  try {
                    const value = await action(tx);
                    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`);
                    return value;
                  } catch (error) {
                    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`);
                    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`);
                    throw error;
                  }
                };
              if (['onModuleInit', 'onModuleDestroy'].includes(String(key)))
                return undefined;
              return Reflect.get(target, key);
            },
          });
          const config = new ConfigService({
            JWT_SECRET: secret,
            JWT_EXPIRES_IN: '120',
          });
          const module = await Test.createTestingModule({
            imports: [AppModule],
          })
            .overrideProvider(PrismaService)
            .useValue(scoped)
            .overrideProvider(ConfigService)
            .useValue(config)
            .compile();
          app = module.createNestApplication({ logger: false });
          app.useGlobalFilters({
            catch(error, host) {
              const status =
                typeof error.getStatus === 'function' ? error.getStatus() : 500;
              if (status === 500)
                console.error(
                  JSON.stringify({ name: error.name, code: error.code }),
                );
              host
                .switchToHttp()
                .getResponse()
                .status(status)
                .json({ statusCode: status });
            },
          });
          app.useGlobalPipes(
            new ValidationPipe({
              whitelist: true,
              forbidNonWhitelisted: true,
              transform: true,
            }),
          );
          await app.init();
          const jwt = app.get(JwtService);
          const claims = {
            sub: employee.id,
            cod: employee.cod,
            unit: fixture.unit,
            isAdmin: true,
          };
          const token = await jwt.signAsync(claims);
          const other = await jwt.signAsync({ ...claims, unit: -1 });
          const base = `/manifests/${fixture.id}/entries`;
          async function call(
            method: string,
            path: string,
            body: unknown,
            status: number,
            auth: string | null = token,
          ) {
            let test = request(app.getHttpServer())[method](path);
            if (auth) test = test.set('Authorization', `Bearer ${auth}`);
            if (body !== undefined) test = test.send(body);
            const response = await test;
            assert.equal(
              response.status,
              status,
              `${method.toUpperCase()} ${path}: HTTP ${response.status}, esperado ${status}`,
            );
            checks++;
            return response.body;
          }
          await call('get', base, undefined, 401, null);
          await call('get', base, undefined, 404, other);
          const previewBody = { placa: vehicle.plate, manifesto_id: fixture.id, cod_777_00: 1000 };
          await call('post', '/manifests/preview', previewBody, 401, null);
          await call('post', '/manifests/preview', previewBody, 404, other);
          const preview = await call('post', '/manifests/preview', previewBody, 201);
          assert.equal(preview.frete_veiculo, 100);
          assert.equal(preview.freightVehicle, 100);
          assert.equal(preview.totalFretes, 930);
          const defaultPreview = await call('post', '/manifests/preview', { placa: vehicle.plate, cod_777_00: 1000 }, 201);
          assert(Number.isFinite(defaultPreview.frete_veiculo));
          await call('post', '/manifests/preview', { ...previewBody, frete_veiculo: -1 }, 400);
          const denied = await jwt.signAsync({
            ...claims,
            unit: -1,
            isAdmin: false,
          });
          await call('get', '/freight-expenses', undefined, 200, denied);
          const foundWeeks = await call(
            'get',
            '/weeks?date=2026-09-22',
            undefined,
            200,
          );
          let weekCode: string;
          if (foundWeeks.length) {
            assert.equal(foundWeeks.length, 1);
            weekCode = foundWeeks[0].codigo;
          } else {
            const codes = new Set(
              (await tx.frete_semanas.findMany()).map((week) => week.codigo),
            );
            weekCode = Array.from({ length: 10000 }, (_, i) =>
              String(9999 - i).padStart(4, '0'),
            ).find((code) => !codes.has(code));
            assert(weekCode, 'Nenhum código de semana livre para o teste.');
            await call(
              'post',
              '/weeks',
              {
                codigo: weekCode,
                data_inicio: '2026-09-20',
                data_fim: '2026-09-26',
              },
              201,
            );
            createdWeekCode = weekCode;
          }
          await call('get', `/weeks/${weekCode}`, undefined, 200);
          await call(
            'post',
            '/weeks',
            {
              codigo: weekCode,
              data_inicio: '2026-09-20',
              data_fim: '2026-09-26',
            },
            409,
          );
          await call(
            'post',
            '/weeks',
            {
              codigo: weekCode,
              data_inicio: '2026-09-20',
              data_fim: '2026-09-28',
            },
            400,
          );
          await call(
            'put',
            `/weeks/${weekCode}`,
            {
              codigo: weekCode,
              data_inicio: '2026-09-27',
              data_fim: '2026-10-03',
            },
            409,
          );
          const permission = await tx.user_permissions.findFirst({
            where: { cod_user: employee.cod, unit: fixture.unit },
          });
          if (permission)
            await tx.user_permissions.update({
              where: { id: permission.id },
              data: { freight_service: true },
            });
          else
            await tx.user_permissions.create({
              data: {
                cod_user: employee.cod,
                unit: fixture.unit,
                is_admin: false,
                freight_service: true,
              },
            });
          const regular = await jwt.signAsync({ ...claims, isAdmin: false });
          const destinationName=`DESTINO ${marker}`;
          const newDestination=await call('post','/destinations',{nome:destinationName},201,regular);
          await call('post','/destinations',{nome:destinationName},409,regular);
          await call('post','/destinations',{nome:'  '},400,regular);
          await call('get',`/destinations/${newDestination.id}`,undefined,404,other);
          assert((await call('get','/destinations',undefined,200,regular)).some((d:any)=>d.id===newDestination.id));
          const companies = await call('get','/registrations/companies',undefined,200,regular);
          assert.equal(companies.length,11);
          const driverBody = {cpf:'52998224725',name:'TESTE CADASTRO MOTORISTA'};
          await call('post','/registrations/drivers',{...driverBody,empresa_sigla:companies[0].sigla},400,regular);
          await call('post','/registrations/drivers',driverBody,401,null);
          await call('put',`/registrations/drivers/${driverBody.cpf}`,driverBody,401,null);
          await call('post','/registrations/drivers',{...driverBody,cpf:'11111111111'},400);
          if (!await tx.driver.findUnique({where:{cpf:BigInt(driverBody.cpf)}})) {
            const createdDriver = await call('post','/registrations/drivers',driverBody,201,regular);
            assert.equal('empresa_sigla' in createdDriver,false);
            await call('post','/registrations/drivers',driverBody,409);
            const editedDriver = await call('put',`/registrations/drivers/${driverBody.cpf}`,{...driverBody,name:'TESTE EDITADO'},200,regular);
            assert.equal('empresa_sigla' in editedDriver,false);
          }
          const types = await call('get','/registrations/vehicle-types',undefined,200,regular);
          assert(types.length>0);
          const vehicleBody = {plate:'ZZZ9Z99',codVehicleType:types[0].codVehicleType,owner:'11222333000181',owner_name:'TESTE CADASTRO PROPRIETARIO',empresa_sigla:companies[0].sigla};
          await call('post','/registrations/vehicles',vehicleBody,401,null);
          await call('put',`/registrations/vehicles/${vehicleBody.plate}`,vehicleBody,401,null);
          if (!await tx.vehicle.findUnique({where:{plate:vehicleBody.plate}})) {
            const createdVehicle = await call('post','/registrations/vehicles',vehicleBody,201,regular);
            assert.equal(createdVehicle.empresa_sigla,vehicleBody.empresa_sigla);
            assert.equal(Number(createdVehicle.second_payer_percent),0);
            assert.equal(createdVehicle.first_payer,vehicleBody.empresa_sigla);
            assert.equal(createdVehicle.second_payer,null);
            await call('put',`/registrations/vehicles/${vehicleBody.plate}`,vehicleBody,200,regular);
            await call('post','/registrations/vehicles',vehicleBody,409);
          }
          await call('get', '/freight-expenses', undefined, 200, regular);
          await call('post', '/freight-expenses', {codigo:'ADMINONLY',nome:'TESTE',tipo:'Credito',ativo:true}, 403, regular);
          await call('put', '/freight-expenses/1', {codigo:'ADMINONLY',nome:'TESTE',tipo:'Credito',ativo:false}, 403, regular);
          await call(
            'post',
            '/weeks',
            {
              codigo: weekCode,
              data_inicio: '2026-09-20',
              data_fim: '2026-09-26',
            },
            403,
            regular,
          );
          for (const [i, tipo] of [
            'Credito',
            'Debito',
            'Adiantamento',
          ].entries()) {
            const expense = await call(
              'post',
              '/freight-expenses',
              { codigo: `${marker}${i}`, nome: 'TESTE API', tipo, ativo: true },
              201,
            );
            expenseIds.push(expense.id);
          }
          await call(
            'post',
            '/freight-expenses',
            {
              codigo: `${marker}0`,
              nome: 'TESTE API',
              tipo: 'Credito',
              ativo: true,
            },
            409,
          );
          const payload = {
            despesa_id: expenseIds[0],
            valor: 50,
            data_lancamento: '2026-09-22',
          };
          const standaloneBody = {...payload,placa:fixture.placa,semana:weekCode};
          await call('post','/freight-entries',{...standaloneBody,semana:'XXXX'},400,regular);
          await call('post','/freight-entries',{...standaloneBody,data_lancamento:'2026-09-29'},400,regular);
          const standalone = await call('post','/freight-entries',standaloneBody,201,regular);
          assert.equal(standalone.entry.manifesto_id,null);
          assert.equal(standalone.entry.placa,fixture.placa);
          assert.equal(standalone.entry.semana,weekCode);
          assert.equal(standalone.entry.unit,fixture.unit);
          assert.equal(standalone.manifesto,null);
          const retrievedEntry = await call('get',`/freight-entries/number/${standalone.entry.numero}`,undefined,200,regular);
          assert.equal(retrievedEntry.entry.id,standalone.entry.id);
          await call('get',`/freight-entries/number/${standalone.entry.numero}`,undefined,404,other);
          const editedStandalone=await call('put',`/freight-entries/${standalone.entry.id}`,{...standaloneBody,valor:75,descricao:'EDITADO'},200,regular);
          assert.equal(editedStandalone.entry.numero,standalone.entry.numero);
          assert.equal(Number(editedStandalone.entry.valor),75);
          await call('put',`/freight-entries/${standalone.entry.id}`,standaloneBody,404,other);
          await tx.frete_lancamentos.update({where:{id:standalone.entry.id},data:{pago:true}});
          await call('delete',`/freight-entries/${standalone.entry.id}`,undefined,404,other);
          await call('delete',`/freight-entries/${standalone.entry.id}`,undefined,409,regular);
          await call('put',`/freight-entries/${standalone.entry.id}`,standaloneBody,409,regular);
          await tx.frete_lancamentos.update({where:{id:standalone.entry.id},data:{pago:false}});
          const standalonePreview = await call('get',`/freight-closures/preview?semana=${weekCode}&placa=${fixture.placa}`,undefined,200,regular);
          assert(standalonePreview.entries.some((e: {id:number}) => e.id === standalone.entry.id));
          const conference = await call('get', `/freight-closures/conference?semana=${weekCode}&placa=${fixture.placa}`, undefined, 200, regular);
          const financial=await call('get',`/freight-reports/financial?semana=${weekCode}&placa=${fixture.placa}&cupons=false`,undefined,200,regular);
          assert(financial.rows.some((r:any[])=>r[0]==='Lançamento'&&r[1]===standalone.entry.numero));
          assert(financial.rows.every((r:any[])=>r[3]===fixture.placa));
          assert.equal((await call('get',`/freight-reports/financial?semana=${weekCode}`,undefined,200,other)).rows.length,0);
          await call('get',`/freight-reports/financial?semana=${weekCode}&lancamentos=false&cupons=false`,undefined,400,regular);
          await call('get','/freight-reports/financial?inicio=2026-09-20',undefined,400,regular);
          assert(conference.groups[0].entries.some((e: {id:number}) => e.id === standalone.entry.id));
          assert.equal(conference.groups[0].totals.total_liquido, standalonePreview.totals.total_liquido);
          await call('get', '/freight-closures/conference?inicio=2026-09-20', undefined, 400, regular);
          await call('get', '/freight-closures/conference?inicio=2026-09-26&fim=2026-09-20', undefined, 400, regular);
          await call('get', `/freight-closures/conference?semana=${weekCode}&finalizados=invalid`, undefined, 400, regular);
          const conferencePrint = await request(app.getHttpServer()).get(`/freight-closures/conference/print?semana=${weekCode}&placa=${fixture.placa}`).set('Authorization', `Bearer ${regular}`);
          assert.equal(conferencePrint.status,200);
          assert(conferencePrint.text.includes('CONFERÊNCIA'));
          checks++;
          // Batch closure uses an isolated future period; outer transaction rolls back.
          const batchDate=new Date('2099-01-04T00:00:00Z');
          const batchEnd=new Date('2099-01-10T00:00:00Z');
          const batchDates={gte:batchDate,lte:batchEnd};
          assert.equal(await tx.frete_carregamento_manifestos.count({where:{unit:fixture.unit,semana:batchDates}}),0);
          assert.equal(await tx.frete_lancamentos.count({where:{unit:fixture.unit,data_lancamento:batchDates}}),0);
          assert.equal(await tx.frete_cupons.count({where:{unit:fixture.unit,data_cobranca:batchDates}}),0);
          const usedCodes=new Set((await tx.frete_semanas.findMany()).map(w=>w.codigo));
          const batchWeek=Array.from({length:10000},(_,i)=>String(9999-i).padStart(4,'0')).find(c=>!usedCodes.has(c));
          assert(batchWeek);
          await tx.frete_semanas.create({data:{codigo:batchWeek,data_inicio:batchDate,data_fim:batchEnd}});
          const secondVehicle=await tx.vehicle.findFirst({where:{plate:{not:vehicle.plate},canceled:false}});
          assert(secondVehicle);
          const batchIds:number[]=[];
          for(const placa of [vehicle.plate,secondVehicle.plate]) {
            const row=await tx.frete_carregamento_manifestos.create({data:{...fixture,id:undefined,semana:batchDate,placa,manifestos:`${marker}B${batchIds.length}`}});
            batchIds.push(row.id);
          }
          const batch=await call('post','/freight-closures/week',{semana:batchWeek},201,regular);
          assert.equal(batch.results.length,2);
          const paymentReport=await call('get',`/freight-reports/payments?semana=${batchWeek}`,undefined,200,regular);
          assert.equal(paymentReport.rows.length,2);
          assert(paymentReport.rows.every((r:any[])=>r[10]==='-100.00'));
          assert.equal((await call('get',`/freight-reports/payments?semana=${batchWeek}`,undefined,200,other)).rows.length,0);
          for(const endpoint of [`payments/spreadsheet?semana=${batchWeek}`,`financial/print?semana=${weekCode}`,`closures/reprint?semana=${batchWeek}`]){
            const printed=await request(app.getHttpServer()).get(`/freight-reports/${endpoint}`).set('Authorization',`Bearer ${regular}`);
            assert.equal(printed.status,200);assert(printed.text.includes(endpoint.startsWith('payments')?'urn:schemas-microsoft-com:office:spreadsheet':'<!doctype html>'));checks++;
          }
          await call('get',`/freight-reports/closures/reprint?numero=${batch.results[0].closure.numero}`,undefined,404,other);
          for(const result of batch.results) {
            assert.equal(result.closure.unit,fixture.unit);
            assert.equal(Number(result.payment.segunda.valor),0);
            await call('get',`/freight-closures/number/${result.closure.numero}/report`,undefined,200,regular);
            await call('get',`/freight-closures/number/${result.closure.numero}/report`,undefined,404,other);
          }
          assert.equal(await tx.frete_carregamento_manifestos.count({where:{id:{in:batchIds},fechamento_id:{not:null}}}),2);
          await call('post','/freight-closures/week',{semana:batchWeek},400,regular);
          await call('delete',`/freight-entries/${standalone.entry.id}`,undefined,200,regular);
          await call('get',`/freight-entries/number/${standalone.entry.numero}`,undefined,404,regular);
          await call('delete',`/freight-entries/${standalone.entry.id}`,undefined,404,regular);
          await call(
            'post',
            base,
            { ...payload, semana: weekCode === '0000' ? '0001' : '0000' },
            400,
          );
          const closure = await tx.frete_fechamentos.create({
            data: {
              numero: -1,
              unit: fixture.unit,
              semana: weekCode,
              placa: vehicle.plate,
              periodo_inicio: new Date('2026-09-21T00:00:00Z'),
              periodo_fim: new Date('2026-09-27T00:00:00Z'),
              status: 'FECHADO',
            },
          });
          closureId = closure.id;
          await call('post', base, payload, 409, regular);
          const adminEntry = await call('post', base, payload, 201);
          await call(
            'delete',
            `${base}/${adminEntry.entry.id}`,
            undefined,
            200,
          );
          await tx.frete_fechamentos.update({
            where: { id: closure.id },
            data: { status: 'CANCELADO' },
          });
          const regularEntry = await call('post', base, payload, 201, regular);
          assert.equal(regularEntry.entry.semana, weekCode);
          await call(
            'delete',
            `${base}/${regularEntry.entry.id}`,
            undefined,
            200,
            regular,
          );
          await tx.frete_fechamentos.delete({ where: { id: closure.id } });
          await call('post', base, { ...payload, valor: -1 }, 400);
          await call(
            'post',
            base,
            { ...payload, data_lancamento: '2026-02-30' },
            400,
          );
          await call('post', base, { ...payload, unit: -1 }, 400);
          await call('post', base, payload, 404, other);
          let result = await call('post', base, payload, 201);
          const entryId = result.entry.id;
          assert.equal(Number(result.manifesto.frt_tl_vlc), 150);
          assert.equal(Number(result.manifesto.percentual_antigo), 1);
          assert.equal(Number(result.manifesto.perc_final), 0.16129032);
          result = await call(
            'put',
            `${base}/${entryId}`,
            { ...payload, valor: 75 },
            200,
          );
          assert.equal(Number(result.manifesto.frt_tl_vlc), 175);
          const linkedLookup=await call('get',`/freight-entries/number/${result.entry.numero}`,undefined,200,regular);
          assert.equal(linkedLookup.manifesto.id,fixture.id);
          const linkedEdit=await call('put',`/freight-entries/${entryId}`,{...standaloneBody,manifesto_id:fixture.id,valor:75},200,regular);
          assert.equal(Number(linkedEdit.manifesto.frt_tl_vlc),175);
          for (const despesa_id of expenseIds.slice(1)) {
            result = await call('post', base, { ...payload, despesa_id }, 201);
            assert.equal(Number(result.manifesto.frt_tl_vlc), 175);
            assert.equal(Number(result.manifesto.valor_liquido), 180);
          }
          assert.equal((await call('get', base, undefined, 200)).length, 3);
          assert.equal(
            (await call('get', `${base}?week=${weekCode}`, undefined, 200))
              .length,
            3,
          );
          const filtered = await call(
            'get',
            `/manifests?week=${weekCode}`,
            undefined,
            200,
          );
          assert(filtered.some((manifest) => manifest.id === fixture.id));
          await tx.frete_lancamentos.update({
            where: { id: entryId },
            data: { pago: true },
          });
          await call('delete', `${base}/${entryId}`, undefined, 409);
          await call('put', `${base}/${entryId}`, payload, 409);
          await tx.frete_lancamentos.update({
            where: { id: entryId },
            data: { pago: false },
          });
          result = await call('delete', `${base}/${entryId}`, undefined, 200);
          assert.equal(Number(result.manifesto.frt_tl_vlc), 100);
          await tx.frete_carregamento_manifestos.update({
            where: { id: fixture.id },
            data: { num_fechamento: 999 },
          });
          await call('post', base, payload, 409);
          await tx.frete_carregamento_manifestos.update({
            where: { id: fixture.id },
            data: { num_fechamento: null, nao_777: 1000 },
          });
          const before = await tx.frete_lancamentos.count({
            where: { manifesto_id: fixture.id },
          });
          await call('post', base, payload, 400);
          assert.equal(
            await tx.frete_lancamentos.count({
              where: { manifesto_id: fixture.id },
            }),
            before,
            'Lançamento com falha de cálculo deve ser revertido.',
          );
          await call(
            'put',
            `/freight-expenses/${expenseIds[0]}`,
            {
              codigo: `${marker}0`,
              nome: 'TESTE API',
              tipo: 'Credito',
              ativo: false,
            },
            200,
          );
          await call('post', base, payload, 404);
          // Manutenção do manifesto com dados de referência válidos.
          const driver = await tx.driver.findFirst({ select: { cpf: true } });
          assert(
            driver,
            'É necessário um motorista cadastrado para testar a edição.',
          );
          const destination = await tx.frete_destinos.create({
            data: {
              unit: fixture.unit,
              nome: marker,
              ativo: true,
            },
          });
          const manifestPath = `/manifests/${fixture.id}`;
          const edit = {
            semana: '2026-09-22',
            hora: '11:00',
            manifestos: `U${marker}`,
            placa: vehicle.plate,
            cpf_motorista: driver.cpf.toString(),
            destino_id: destination.id,
            m3: 1,
            kg: 100,
            qtd_nf: 1,
            cod_777_00: 1000,
            frete_veiculo: 200,
          };
          await call('put', manifestPath, edit, 401, null);
          await call('put', manifestPath, edit, 404, other);
          await call('delete', manifestPath, undefined, 404, other);
          await call(
            'put',
            manifestPath,
            { ...edit, manifestos: template.manifestos },
            409,
          );
          await call('put', manifestPath, { ...edit, hora: '25:00' }, 400);
          const saved = await call('put', manifestPath, edit, 200);
          assert.equal(saved.id, fixture.id);
          assert.equal(Number(saved.frt_tl_vlc), 200);
          const linked = await call('get', base, undefined, 200);
          assert(
            linked.every(
              (entry) =>
                entry.manifesto_id === fixture.id &&
                entry.destino === marker.toUpperCase() &&
                entry.motorista === saved.motorista,
            ),
          );
          await call(
            'put',
            `/freight-expenses/${expenseIds[0]}`,
            {
              codigo: `${marker}0`,
              nome: 'TESTE API',
              tipo: 'Credito',
              ativo: true,
            },
            200,
          );
          await call('post', base, payload, 201);
          const recalculated = await call('put', manifestPath, edit, 200);
          assert.equal(Number(recalculated.frt_tl_vlc), 250);
          assert.equal(Number(recalculated.percentual_antigo), 1.66666667);
          await call('put', manifestPath, { ...edit, nao_777: 1000 }, 400);
          assert.equal(
            Number((await call('get', manifestPath, undefined, 200)).nao_777),
            0,
          );
          await tx.frete_lancamentos.update({
            where: { id: linked[0].id },
            data: { pago: true },
          });
          await call('put', manifestPath, edit, 409);
          await call('delete', manifestPath, undefined, 409);
          await tx.frete_lancamentos.update({
            where: { id: linked[0].id },
            data: { pago: false },
          });
          await tx.frete_carregamento_manifestos.update({
            where: { id: fixture.id },
            data: { num_fechamento: 999 },
          });
          await call('put', manifestPath, edit, 409);
          await call('delete', manifestPath, undefined, 409);
          await tx.frete_carregamento_manifestos.update({
            where: { id: fixture.id },
            data: { num_fechamento: null },
          });
          const removed = await call('delete', manifestPath, undefined, 200);
          assert.equal(removed.deletedEntries, 3);
          assert.equal(
            await tx.frete_lancamentos.count({
              where: { manifesto_id: fixture.id },
            }),
            0,
          );
          await call('get', manifestPath, undefined, 404);
          await call('delete', manifestPath, undefined, 404);
          // Notas financeiras e rateio em cupons, independentes do manifesto.
          const invoiceType = await call(
            'post',
            '/freight-invoice-types',
            {
              codigo: marker,
              nome: 'TESTE API',
              tipo: 'Debito',
              ativo: true,
            },
            201,
          );
          invoiceTypeId = invoiceType.id;
          await call(
            'post',
            '/freight-invoice-types',
            {
              codigo: marker,
              nome: 'TESTE API',
              tipo: 'Debito',
              ativo: true,
            },
            409,
          );
          const invoiceData = {
            numero: marker,
            data_nota: '2026-09-22',
            emitido_em: '2026-09-22',
            valor: 100,
            tipo_id: invoiceType.id,
          };
          const invoice = await call(
            'post',
            '/freight-invoices',
            invoiceData,
            201,
          );
          invoiceId = invoice.id;
          assert.equal(Number(invoice.saldo), 100);
          await call('post', '/freight-invoices', invoiceData, 409);
          const invoicePath = `/freight-invoices/${invoice.id}`;
          await call('get', invoicePath, undefined, 401, null);
          await call('get', invoicePath, undefined, 404, other);
          const couponData = {
            placa: vehicle.plate,
            cpf_motorista: driver.cpf.toString(),
            semana: weekCode,
            valor: 30,
          };
          const couponPath = `${invoicePath}/coupons`;
          const launchBody={nota:{...invoiceData,numero:`L${marker}`},cupom:couponData};
          await call('post','/freight-invoices/launches',{...launchBody,cupom:{...couponData,valor:101}},400);
          assert.equal(await tx.frete_notas.count({where:{numero:launchBody.nota.numero,unit:fixture.unit}}),0);
          await call('post','/freight-invoices/launches',{nota:launchBody.nota},400);
          const combined=await call('post','/freight-invoices/launches',launchBody,201);
          assert.equal(Number(combined.nota.saldo),70);
          const again=await call('post','/freight-invoices/launches',launchBody,201);
          assert.equal(again.nota.id,combined.nota.id);
          assert.equal(Number(again.nota.saldo),40);
          await call('post','/freight-invoices/launches',{...launchBody,nota:{...launchBody.nota,valor:200}},409);
          const byNumber=`/freight-invoices/by-number?numero=${encodeURIComponent(launchBody.nota.numero)}`;
          assert.equal((await call('get',byNumber,undefined,200,regular)).id,combined.nota.id);
          await call('get',byNumber,undefined,404,other);
          const byLaunch=`/freight-invoices/launches/${combined.coupon.id}`;
          assert.equal((await call('get',byLaunch,undefined,200,regular)).nota.id,combined.nota.id);
          await call('get',byLaunch,undefined,404,other);
          await call('delete',`/freight-invoices/${combined.nota.id}`,undefined,200);
          await call('post', couponPath, couponData, 404, other);
          await call('post', couponPath, { ...couponData, valor: 0 }, 400);
          let allocation = await call('post', couponPath, couponData, 201);
          const couponId = allocation.coupon.id;
          assert.equal(Number(allocation.nota.saldo), 70);
          await call('post', couponPath, { ...couponData, valor: 71 }, 400);
          assert.equal(
            (await call('get', couponPath, undefined, 200)).length,
            1,
          );
          assert.equal(
            Number((await call('get', invoicePath, undefined, 200)).saldo),
            70,
          );
          allocation = await call(
            'put',
            `${couponPath}/${couponId}`,
            { ...couponData, valor: 40 },
            200,
          );
          assert.equal(Number(allocation.nota.saldo), 60);
          await call('put', invoicePath, { ...invoiceData, valor: 39 }, 400);
          const changedInvoice = await call(
            'put',
            invoicePath,
            { ...invoiceData, valor: 120 },
            200,
          );
          assert.equal(Number(changedInvoice.saldo), 80);
          allocation = await call(
            'post',
            couponPath,
            { ...couponData, valor: 80 },
            201,
          );
          assert.equal(Number(allocation.nota.saldo), 0);
          assert.equal(
            (
              await call(
                'get',
                `${couponPath}?week=${weekCode}`,
                undefined,
                200,
              )
            ).length,
            2,
          );
          await tx.frete_cupons.update({
            where: { id: couponId },
            data: { pago: true },
          });
          await call('delete', `${couponPath}/${couponId}`, undefined, 409);
          await call('put', `${couponPath}/${couponId}`, couponData, 409);
          await call('put', invoicePath, invoiceData, 409);
          await call('delete', invoicePath, undefined, 409);
          await tx.frete_cupons.update({
            where: { id: couponId },
            data: { pago: false },
          });
          await call('delete', invoicePath, undefined, 403, regular);
          // Legacy closure fixture: exercise cancellation against real storage,
          // including a failure after the closure status has already been updated.
          const maxClosure = await tx.frete_fechamentos.aggregate({
            _max: { numero: true },
          });
          const cancelFixture = await tx.frete_fechamentos.create({
            data: {
              numero: (maxClosure._max.numero ?? 0) + 1,
              unit: fixture.unit,
              placa: fixture.placa,
              semana: weekCode,
              status: 'FECHADO',
              total_bruto: 100,
              total_liquido: 60,
            },
          });
          closureId = cancelFixture.id;
          const { id: omittedId, ...manifestCopy } = fixture;
          const cancelManifest = await tx.frete_carregamento_manifestos.create({
            data: {
              ...manifestCopy,
              manifestos: `C${marker}`,
              fechamento_id: cancelFixture.id,
              num_fechamento: cancelFixture.numero,
            },
          });
          const maxEntry = await tx.frete_lancamentos.aggregate({
            where: { unit: fixture.unit },
            _max: { numero: true },
          });
          const cancelEntry = await tx.frete_lancamentos.create({
            data: {
              numero: (maxEntry._max.numero ?? 0) + 1,
              unit: fixture.unit,
              placa: fixture.placa,
              codigo_despesa: 'TEST',
              nome_despesa: 'TESTE CANCELAMENTO',
              tipo_despesa: 'Debito',
              data_lancamento: fixture.semana,
              valor: 10,
              manifesto_id: cancelManifest.id,
              pago: true,
              fechamento_id: cancelFixture.id,
            },
          });
          await tx.frete_cupons.update({
            where: { id: couponId },
            data: { pago: true, fechamento_id: cancelFixture.id },
          });
          const cancelPath = `/freight-closures/${cancelFixture.id}/cancel`;
          const reason = { motivo: 'Conferencia automatizada' };
          await call('post', cancelPath, reason, 401, null);
          // Grant closure permission to ensure the administrator rule is tested too.
          await tx.user_permissions.updateMany({
            where: { cod_user: employee.cod, unit: fixture.unit },
            data: { freight_closure: true },
          });
          await call('post', cancelPath, reason, 403, regular);
          await call('post', cancelPath, reason, 404, other);
          await call('post', cancelPath, { motivo: '  ' }, 400);
          const originalUpdate = tx.frete_cupons.updateMany.bind(
            tx.frete_cupons,
          );
          tx.frete_cupons.updateMany = (async () => {
            throw new Error('INJECTED_CANCEL_FAILURE');
          }) as typeof tx.frete_cupons.updateMany;
          try {
            await call('post', cancelPath, reason, 500);
          } finally {
            tx.frete_cupons.updateMany = originalUpdate;
          }
          assert.equal(
            (
              await tx.frete_fechamentos.findUniqueOrThrow({
                where: { id: cancelFixture.id },
              })
            ).status,
            'FECHADO',
          );
          assert.equal(
            (
              await tx.frete_lancamentos.findUniqueOrThrow({
                where: { id: cancelEntry.id },
              })
            ).pago,
            true,
          );
          assert.equal(
            (
              await tx.frete_carregamento_manifestos.findUniqueOrThrow({
                where: { id: cancelManifest.id },
              })
            ).fechamento_id,
            cancelFixture.id,
          );
          const cancelled = await call('post', cancelPath, reason, 201);
          assert.deepEqual(cancelled.reabertos, {
            manifests: 1,
            entries: 1,
            coupons: 1,
          });
          assert.equal(
            cancelled.closure.historico.cancelamento.motivo,
            reason.motivo,
          );
          assert.equal(
            (
              await tx.frete_cupons.findUniqueOrThrow({
                where: { id: couponId },
              })
            ).pago,
            false,
          );
          assert.equal(
            (await call('get', invoicePath, undefined, 200)).saldo,
            '0',
          );
          await call('post', cancelPath, reason, 409);
          await call(
            'delete',
            `/manifests/${cancelManifest.id}`,
            undefined,
            200,
          );
          const cancelledDetail = await call(
            'get',
            `/freight-closures/${cancelFixture.id}`,
            undefined,
            200,
          );
          assert.equal(cancelledDetail.manifests.length, 0);
          const reportPath = `/freight-closures/${cancelFixture.id}/report`;
          await call('get', reportPath, undefined, 401, null);
          await call('get', reportPath, undefined, 404, other);
          const historicalReport = await call(
            'get',
            reportPath,
            undefined,
            200,
          );
          assert.equal(historicalReport.origem, 'CANCELAMENTO_LEGADO');
          assert.equal(historicalReport.manifests[0].id, cancelManifest.id);
          const printed = await request(app.getHttpServer())
            .get(`/freight-closures/${cancelFixture.id}/print`)
            .set('Authorization', `Bearer ${token}`);
          assert.equal(printed.status, 200);
          assert.match(printed.headers['content-type'], /text\/html/);
          assert.equal(printed.headers['cache-control'], 'no-store');
          assert(printed.text.includes('CANCELADO'));
          assert(printed.text.includes(`C${marker}`));
          checks++;
          assert.equal(
            cancelledDetail.closure.historico.cancelamento.dados.manifests[0]
              .id,
            cancelManifest.id,
          );
          allocation = await call(
            'delete',
            `${couponPath}/${couponId}`,
            undefined,
            200,
          );
          assert.equal(Number(allocation.nota.saldo), 40);
          const removedInvoice = await call(
            'delete',
            invoicePath,
            undefined,
            200,
          );
          assert.equal(removedInvoice.deletedCoupons, 1);
          assert.equal(
            await tx.frete_cupons.count({ where: { nota_id: invoice.id } }),
            0,
          );
          await call('get', invoicePath, undefined, 404);
          const payersPath = `/vehicles/${vehicle.plate}/payers`;
          const payersBody = {
            first_payer: 'TESTE A',
            second_payer: 'TESTE B',
            second_payer_percent: 0.3,
          };
          await call('put', payersPath, payersBody, 401, null);
          await call('put', payersPath, payersBody, 403, regular);
          await call(
            'put',
            payersPath,
            { ...payersBody, second_payer_percent: 30 },
            400,
          );
          await call(
            'put',
            payersPath,
            { ...payersBody, second_payer_percent: '0.3' },
            400,
          );
          await call(
            'put',
            payersPath,
            { ...payersBody, first_payer: '' },
            409,
          );
          await call(
            'put',
            payersPath,
            { ...payersBody, owner: 'INVALID' },
            400,
          );
          const savedPayers = await call('put', payersPath, payersBody, 200);
          assert.equal(savedPayers.second_payer_percent, '0.3');
          const readVehicle = await call(
            'get',
            `/vehicles/${vehicle.plate}`,
            undefined,
            200,
          );
          assert.equal(readVehicle.first_payer, 'TESTE A');
          assert.equal(readVehicle.second_payer, 'TESTE B');
          const clearedPayers = await call(
            'put',
            payersPath,
            { first_payer: '', second_payer: '', second_payer_percent: 0 },
            200,
          );
          assert.equal(clearedPayers.first_payer, null);
          assert.equal(clearedPayers.second_payer, null);
          // All vehicle mutations above are also reverted by the outer transaction.
          console.log(
            `${checks} verificações HTTP passaram; cálculos e rollback do lançamento conferidos.`,
          );
          throw rollback;
        },
        { isolationLevel: 'Serializable', timeout: 60000, maxWait: 10000 },
      );
    } catch (error) {
      if (error !== rollback) throw error;
    }
    assert.equal(
      await prisma.frete_carregamento_manifestos.count({
        where: { manifestos: { in: [marker, `U${marker}`] } },
      }),
      0,
    );
    assert.equal(
      await prisma.frete_despesas.count({ where: { id: { in: expenseIds } } }),
      0,
    );
    assert.equal(
      await prisma.frete_destinos.count({ where: { nome: marker } }),
      0,
    );
    if (createdWeekCode)
      assert.equal(
        await prisma.frete_semanas.count({
          where: { codigo: createdWeekCode },
        }),
        0,
      );
    if (closureId !== undefined)
      assert.equal(
        await prisma.frete_fechamentos.count({ where: { id: closureId } }),
        0,
      );
    if (invoiceTypeId !== undefined)
      assert.equal(
        await prisma.frete_tipos_nota.count({ where: { id: invoiceTypeId } }),
        0,
      );
    if (invoiceId !== undefined) {
      assert.equal(
        await prisma.frete_notas.count({ where: { id: invoiceId } }),
        0,
      );
      assert.equal(
        await prisma.frete_cupons.count({ where: { nota_id: invoiceId } }),
        0,
      );
    }
    if (fixtureId !== undefined)
      assert.equal(
        await prisma.frete_lancamentos.count({
          where: { manifesto_id: fixtureId },
        }),
        0,
      );
    console.log(
      'Rollback externo confirmado: nenhum registro de teste permaneceu no banco.',
    );
  } finally {
    if (app) await app.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // Não expõe tokens, credenciais, consultas ou dados de registros reais.
  console.error(
    error instanceof assert.AssertionError
      ? error.message
      : `Teste falhou: ${error.name} ${error.code ?? ''}`,
  );
  process.exitCode = 1;
});
