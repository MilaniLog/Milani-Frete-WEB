import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { companyExpenses } from '../freight-entries/company-expenses';
import { getWeek, periodForDate } from '../weeks/period-policy';

import { FreightCalculationService } from '../freight-calculation/freight-calculation.service';

import { CreateManifestDto } from './dto/create-manifest.dto';
import { PreviewManifestDto } from './dto/preview-manifest.dto';
import type { AuthUser } from '../auth/auth-user.types';

function normalizeManifestSearch(value?: string) {
  const text = value?.trim() ?? '';
  const digits = text.replace(/\D/g, '');
  if (/^\d{10}$/.test(digits)) return `${digits.slice(0, 9)}-${digits.slice(9)}`;
  return text;
}

@Injectable()
export class ManifestsService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly freightCalculationService: FreightCalculationService,
  ) {}

  private async operationalUnits(user: AuthUser) {
    if (user.isAdmin) return undefined;
    if (!this.prisma.user_permissions?.findMany) return [user.unit];
    const rows = await this.prisma.user_permissions.findMany({
      where: {
        cod_user: user.cod,
        OR: [{ freight_service: true }, { freight_closure: true }],
      },
      select: { unit: true },
    });
    return [...new Set([user.unit, ...rows.map((row) => row.unit)])];
  }

  private async operationalUnitWhere(user: AuthUser, unit?: number) {
    if (user.isAdmin) return unit == null ? {} : { unit };
    const units = await this.operationalUnits(user);
    if (unit != null) {
      if (!units!.includes(unit))
        throw new NotFoundException('Registro nao encontrado nesta unidade.');
      return { unit };
    }
    return units!.length === 1 ? { unit: units![0] } : { unit: { in: units } };
  }

  private unitFromManifestNumber(value: string) {
    const prefix = value.trim().slice(0, 3);
    return /^\d{3}$/.test(prefix) ? Number(prefix) : undefined;
  }

  async preview(dto: PreviewManifestDto, user: AuthUser) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { plate: dto.placa },
      select: { codVehicleType: true, canceled: true },
    });
    if (!vehicle || vehicle.canceled) throw new NotFoundException('Veículo não encontrado ou cancelado.');
    const type = await this.prisma.vehicleType.findUnique({
      where: { codVehicleType: vehicle.codVehicleType },
      select: { typeName: true, max_m3: true, max_weight: true, freight_value: true },
    });
    if (!type) throw new NotFoundException('Tipo do veículo não encontrado.');
    let expenses = 0;
    let originalFreight: number | undefined;
    if (dto.manifesto_id != null) {
      const manifest = await this.prisma.frete_carregamento_manifestos.findFirst({
        where: { id: dto.manifesto_id, ...(await this.operationalUnitWhere(user)) },
        select: { frete_veiculo: true, unit: true },
      });
      if (!manifest) throw new NotFoundException('Manifesto não encontrado.');
      originalFreight = Number(manifest.frete_veiculo);
      expenses = companyExpenses(await this.prisma.frete_lancamentos.findMany({
        where: { manifesto_id: dto.manifesto_id, ...(await this.operationalUnitWhere(user, manifest.unit)) },
        select: { tipo_despesa: true, valor: true },
      }));
    }
    const freight = dto.frete_veiculo ?? originalFreight ?? Number(type.freight_value);
    const calculation = await this.freightCalculationService.calculate({
      ...dto, frete_veiculo: freight, despesas_empresa: expenses,
    });
    return {
      ...calculation,
      frete_veiculo: freight,
      despesas_empresa: expenses,
      vehicle: { type: type.typeName, max_m3: Number(type.max_m3), max_weight: Number(type.max_weight) },
    };
  }

  // =========================================================
  // LISTAR MANIFESTOS
  // =========================================================

  async findAll(user: AuthUser, weekCode?: string, number?: string, recent = false) {
    const week = weekCode ? await getWeek(this.prisma, weekCode) : undefined;
    const manifestNumber = normalizeManifestSearch(number);
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const midnight = new Date(`${today}T00:00:00-03:00`).getTime();
    return this.prisma.frete_carregamento_manifestos.findMany({
      where: {
        ...(await this.operationalUnitWhere(user)),
        ...(recent ? { data_hora: { gte: new Date(midnight - 86400000), lt: new Date(midnight + 86400000) } } : {}),
        ...(manifestNumber
          ? {
              OR: [
                { manifestos: manifestNumber },
                { manifesto_adicional_1: manifestNumber },
                { manifesto_adicional_2: manifestNumber },
                { manifesto_adicional_3: manifestNumber },
              ],
            }
          : {}),
        ...(week
          ? { semana: { gte: week.data_inicio, lte: week.data_fim } }
          : {}),
      },

      orderBy: {
        id: 'desc',
      },

      take: 50,

      select: {
        id: true,
        unit: true,
        semana: true,
        origem: true,
        manifestos: true,
        manifesto_adicional_1: true,
        manifesto_adicional_2: true,
        manifesto_adicional_3: true,
        hora: true,
        placa: true,
        motorista: true,
        tipo_veiculo: true,
        destino: true,

        m3: true,
        kg: true,
        qtd_nf: true,

        cod_777_00: true,
        cod_888_00: true,
        cod_999_00: true,

        cod_777_15: true,
        cod_888_25: true,
        cod_999_100: true,

        frete_total: true,
        frete_calc: true,
        frete_veiculo: true,

        frt_tl_vlc: true,

        perc_carreg: true,
        perc_final: true,
        percentual_antigo: true,

        carreg_perc: true,
        final_perc: true,

        nao_777: true,
        nao_888: true,
        nao_999: true,

        nao_777_calc: true,
        nao_888_calc: true,
        nao_999_calc: true,

        subtotal: true,

        outros: true,
        diaria: true,
        tde: true,
        escada: true,
        paletização: true,
        estadia: true,
        descarga: true,

        sub_lc_ex: true,
        sub_frete: true,
        sub_total: true,

        observacao: true,
        romaneio: true,
        ciot: true,

        ctrb_numero: true,
        ctrb_total: true,
        ctrb_adiantamento: true,

        sest_senat: true,
        irrf: true,
        prev_social: true,
        inss: true,

        total_retencoes: true,
        valor_liquido: true,
        vale_pedagio: true,

        carga_mista: true,

        fechamento_id: true,
        num_fechamento: true,

        usuario: true,
        data_hora: true,
      },
    });
  }

  // =========================================================
  // BUSCAR MANIFESTO POR ID
  // =========================================================

  async findOne(id: number, user: AuthUser) {
    const manifesto = await this.prisma.frete_carregamento_manifestos.findFirst(
      {
        where: {
          id,
          ...(await this.operationalUnitWhere(user)),
        },
      },
    );

    if (!manifesto) {
      throw new NotFoundException('Manifesto não encontrado.');
    }

    return manifesto;
  }

  // =========================================================
  // CRIAR MANIFESTO
  // =========================================================

  async create(dto: CreateManifestDto, user: AuthUser) {
    return this.mutate(async (tx) => {
      const manifestUnit = this.unitFromManifestNumber(dto.manifestos) ?? user.unit;
      await this.operationalUnitWhere(user, manifestUnit);
      const data = await this.buildData(tx, dto, user, undefined, 0, manifestUnit);
      return tx.frete_carregamento_manifestos.create({ data });
    });
  }

  async update(id: number, dto: CreateManifestDto, user: AuthUser) {
    return this.mutate(async (tx) => {
      const { manifest, entries } = await this.editable(tx, id, user);
      const data = await this.buildData(
        tx,
        {
          ...dto,
          origem: dto.origem ?? manifest.origem,
          carga_mista: dto.carga_mista ?? manifest.carga_mista,
          frete_veiculo: dto.frete_veiculo ?? Number(manifest.frete_veiculo),
        },
        user,
        id,
        companyExpenses(entries),
        manifest.unit,
      );
      for (const entry of entries)
        await periodForDate(
          tx,
          entry.data_lancamento,
          entry.semana ?? undefined,
        );
      const updated = await tx.frete_carregamento_manifestos.update({
        where: { id },
        data,
      });
      // Vínculo por ID preserva os lançamentos quando o número muda.
      await tx.frete_lancamentos.updateMany({
        where: { manifesto_id: id, unit: manifest.unit },
        data: {
          placa: updated.placa,
          motorista: updated.motorista,
          tipo_veiculo: updated.tipo_veiculo,
          destino: updated.destino,
          updated_at: new Date(),
        },
      });
      return updated;
    });
  }

  async remove(id: number, user: AuthUser) {
    return this.mutate(async (tx) => {
      const { manifest } = await this.editable(tx, id, user);
      const entries = await tx.frete_lancamentos.deleteMany({
        where: {
          manifesto_id: id,
          unit: manifest.unit,
          pago: false,
          fechamento_id: null,
        },
      });
      await tx.frete_carregamento_manifestos.delete({
        where: { id },
      });
      return { id, deleted: true, deletedEntries: entries.count };
    });
  }

  private async editable(
    tx: Prisma.TransactionClient,
    id: number,
    user: AuthUser,
  ) {
    const manifest = await tx.frete_carregamento_manifestos.findFirst({
      where: { id, ...(await this.operationalUnitWhere(user)) },
    });
    if (!manifest) throw new NotFoundException('Manifesto não encontrado.');
    if (manifest.fechamento_id != null) {
      throw new ConflictException(
        'Manifesto fechado não pode ser alterado ou excluído.',
      );
    }
    const entries = await tx.frete_lancamentos.findMany({
      where: { manifesto_id: id },
    });
    if (
      entries.some(
        (entry) =>
          entry.unit !== manifest.unit || entry.pago || entry.fechamento_id != null,
      )
    ) {
      throw new ConflictException(
        'O manifesto possui lançamentos pagos, fechados ou de outra unidade.',
      );
    }
    await periodForDate(tx, manifest.semana);
    for (const entry of entries)
      await periodForDate(
        tx,
        entry.data_lancamento,
        entry.semana ?? undefined,
      );
    return { manifest, entries };
  }

  private async mutate<T>(
    action: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(action, {
          isolationLevel: 'Serializable',
        });
      } catch (error) {
        if (error.code === 'P2003')
          throw new ConflictException(
            'Manifesto possui vínculos que impedem esta alteração.',
          );
        if (error.code === 'P2002')
          throw new ConflictException(
            'Já existe um registro com os dados informados.',
          );
        if (error.code !== 'P2034') throw error;
        if (attempt === 2)
          throw new ConflictException(
            'Conflito ao alterar manifesto. Tente novamente.',
          );
      }
    }
  }

  private async buildData(
    database: Prisma.TransactionClient,
    dto: CreateManifestDto,
    user: AuthUser,
    excludeId?: number,
    expenses = 0,
    targetUnit = user.unit,
  ): Promise<Prisma.frete_carregamento_manifestosUncheckedCreateInput> {
    // =======================================================
    // NORMALIZAÇÕES
    // =======================================================

    const placa = dto.placa.trim().toUpperCase();

    const manifestNumbers = this.manifestNumbers(dto);
    const numeroManifesto = manifestNumbers[0];
    const [
      ,
      manifestoAdicional1 = null,
      manifestoAdicional2 = null,
      manifestoAdicional3 = null,
    ] = manifestNumbers;

    const origem = dto.origem?.trim().toUpperCase() || 'SP';
    const semana = new Date(`${dto.semana}T00:00:00.000Z`);
    const week = await periodForDate(database, semana);

    // =======================================================
    // VERIFICA MANIFESTO DUPLICADO
    // =======================================================

    const repeated = manifestNumbers.find(
      (number, index) => manifestNumbers.indexOf(number) !== index,
    );
    if (repeated)
      throw new ConflictException(
        `O manifesto ${repeated} foi informado mais de uma vez.`,
      );

    const manifestoExistente =
      await database.frete_carregamento_manifestos.findFirst({
        where: {
          unit: targetUnit,
          OR: [
            { manifestos: { in: manifestNumbers } },
            { manifesto_adicional_1: { in: manifestNumbers } },
            { manifesto_adicional_2: { in: manifestNumbers } },
            { manifesto_adicional_3: { in: manifestNumbers } },
          ],
          ...(excludeId === undefined ? {} : { id: { not: excludeId } }),
        },

        select: {
          id: true,
        },
      });

    if (manifestoExistente) {
      throw new ConflictException(
        `O manifesto ${numeroManifesto} já está cadastrado nesta unidade.`,
      );
    }

    // =======================================================
    // VEÍCULO
    // =======================================================

    const vehicle = await database.vehicle.findUnique({
      where: {
        plate: placa,
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Veículo não encontrado.');
    }

    if (vehicle.canceled) {
      throw new BadRequestException('Este veículo está cancelado.');
    }

    // =======================================================
    // TIPO DO VEÍCULO
    // =======================================================

    const vehicleType = await database.vehicleType.findUnique({
      where: {
        codVehicleType: vehicle.codVehicleType,
      },
    });

    if (!vehicleType) {
      throw new NotFoundException('Tipo do veículo não encontrado.');
    }

    // =======================================================
    // MOTORISTA
    // =======================================================

    const cpfMotorista = BigInt(dto.cpf_motorista);

    const driver = await database.driver.findUnique({
      where: {
        cpf: cpfMotorista,
      },
    });

    if (!driver) {
      throw new NotFoundException('Motorista não encontrado.');
    }

    // =======================================================
    // DESTINO
    //
    // So aceita destino:
    // - da mesma unidade
    // - ativo
    // =======================================================

    const destination = await database.frete_destinos.findFirst({
      where: {
        id: dto.destino_id,
        unit: user.unit,
        ativo: true,
      },
    });

    if (!destination) {
      throw new NotFoundException(
        'Destino nao encontrado ou inativo na unidade do usuario.',
      );
    }

    // =======================================================
    // FRETE DO VEÍCULO
    //
    // Se não for enviado manualmente,
    // usa o valor padrão do tipo.
    // =======================================================

    const freteVeiculo = dto.frete_veiculo ?? Number(vehicleType.freight_value);

    // =======================================================
    // FRETES BRUTOS
    // =======================================================

    const freight777 = dto.cod_777_00 ?? 0;

    const freight888 = dto.cod_888_00 ?? 0;

    const freight999 = dto.cod_999_00 ?? 0;

    // =======================================================
    // PELO MENOS UM FRETE
    // =======================================================

    if (freight777 === 0 && freight888 === 0 && freight999 === 0) {
      throw new BadRequestException(
        'Informe pelo menos um valor de frete 777, 888 ou 999.',
      );
    }

    // =======================================================
    // NÃO ENTREGUES
    // =======================================================

    const nao777 = dto.nao_777 ?? 0;

    const nao888 = dto.nao_888 ?? 0;

    const nao999 = dto.nao_999 ?? 0;

    // =======================================================
    // VALORES A RECEBER
    // =======================================================

    const outros = dto.outros ?? 0;

    const diaria = dto.diaria ?? 0;

    const tde = dto.tde ?? 0;

    const escada = dto.escada ?? 0;

    const paletizacao = dto.paletizacao ?? 0;

    const estadia = dto.estadia ?? 0;

    const descarga = dto.descarga ?? 0;

    // =======================================================
    // CÁLCULO
    //
    // O manifesto nasce sem lançamentos. As rotas de lançamentos
    // recalculam os custos e percentuais ao incluir, editar ou excluir.
    // =======================================================

    const calculation = await this.freightCalculationService.calculate(
      {
        origem,

        frete_veiculo: freteVeiculo,

        cod_777_00: freight777,

        cod_888_00: freight888,

        cod_999_00: freight999,

        nao_777: nao777,

        nao_888: nao888,

        nao_999: nao999,

        outros,
        diaria,
        tde,
        escada,
        paletizacao,
        estadia,
        descarga,

        despesas_empresa: expenses,
      },
      database,
    );

    // =======================================================
    // TOTAL BRUTO DOS FRETES
    // =======================================================

    const freteTotal = freight777 + freight888 + freight999;

    // =======================================================
    // SUBTOTAL DOS NÃO ENTREGUES
    //
    // Excel:
    // AE + AF + AG
    // =======================================================

    const subtotal =
      calculation.freightsCalculated.notDelivery777 +
      calculation.freightsCalculated.notDelivery888 +
      calculation.freightsCalculated.notDelivery999;

    // =======================================================
    // SUBTOTAL DOS ADICIONAIS
    //
    // Excel:
    // outros
    // + diária
    // + TDE
    // + escada
    // + paletização
    // + estadia
    //
    // descarga não entra neste subtotal legado.
    // =======================================================

    const subLcEx = outros + diaria + tde + escada + paletizacao + estadia;

    // =======================================================
    // FRETE DO VEÍCULO FINAL
    // =======================================================

    const subFrete = calculation.freightVehicle;

    // =======================================================
    // SUBTOTAL FINAL
    //
    // frete calculado
    // + adicionais
    // - não entregues
    // =======================================================

    const subTotal = calculation.totalFretes + subLcEx - subtotal;

    // =======================================================
    // CTRB
    // =======================================================

    const ctrbTotal = dto.ctrb_total ?? 0;

    const ctrbAdiantamento = dto.ctrb_adiantamento ?? 0;

    const sestSenat = dto.sest_senat ?? 0;

    const irrf = dto.irrf ?? 0;

    const prevSocial = dto.prev_social ?? 0;

    const inss = dto.inss ?? 0;

    // =======================================================
    // RETENÇÕES
    // =======================================================

    const totalRetencoes = sestSenat + irrf + prevSocial + inss;

    // =======================================================
    // VALOR LÍQUIDO CTRB
    // =======================================================

    const valorLiquido = ctrbTotal - ctrbAdiantamento - totalRetencoes;

    // =======================================================
    // DATA
    // =======================================================

    const numFechamento = await this.resolveClosureNumber(
      database,
      targetUnit,
      placa,
      week,
      excludeId,
    );

    // =======================================================
    // SALVA
    // =======================================================

    return {
      // =================================================
      // IDENTIFICAÇÃO
      // =================================================

      unit: targetUnit,

      origem,

      semana,

      manifestos: numeroManifesto,
      manifesto_adicional_1: manifestoAdicional1,
      manifesto_adicional_2: manifestoAdicional2,
      manifesto_adicional_3: manifestoAdicional3,

      hora: dto.hora.trim(),

      placa,

      motorista: driver.name,

      tipo_veiculo: vehicleType.typeName,

      destino: destination.nome.trim().toUpperCase(),

      // =================================================
      // CARGA
      // =================================================

      m3: dto.m3,

      kg: dto.kg,

      qtd_nf: dto.qtd_nf,

      // =================================================
      // FRETES BRUTOS
      // =================================================

      cod_777_00: freight777,

      cod_888_00: freight888,

      cod_999_00: freight999,

      // =================================================
      // FRETES CALCULADOS
      // =================================================

      cod_777_15: calculation.freightsCalculated.freight777,

      cod_888_25: calculation.freightsCalculated.freight888,

      cod_999_100: calculation.freightsCalculated.freight999,

      // =================================================
      // TOTAIS
      // =================================================

      frete_total: freteTotal,

      frete_calc: calculation.totalFretes,

      frete_veiculo: freteVeiculo,

      frt_tl_vlc: calculation.freightVehicle,

      // =================================================
      // PERCENTUAIS
      // =================================================

      perc_carreg: calculation.initPercent,

      perc_final: calculation.finalPercent,

      // Coluna 50: PERCENTUAL ANTIGO, preenchida por CalcNewPercentManifest.
      percentual_antigo: calculation.percentageCalculation.finalPercent,

      carreg_perc: calculation.initPercent,

      final_perc: calculation.finalPercent,

      // =================================================
      // NÃO ENTREGUE
      // =================================================

      nao_777: nao777,

      nao_888: nao888,

      nao_999: nao999,

      nao_777_calc: calculation.freightsCalculated.notDelivery777,

      nao_888_calc: calculation.freightsCalculated.notDelivery888,

      nao_999_calc: calculation.freightsCalculated.notDelivery999,

      // =================================================
      // SUBTOTAIS
      // =================================================

      subtotal,

      sub_lc_ex: subLcEx,

      sub_frete: subFrete,

      sub_total: subTotal,

      // =================================================
      // ADICIONAIS
      // =================================================

      outros,

      diaria,

      tde,

      escada,

      paletização: paletizacao,

      estadia,

      descarga,

      // =================================================
      // INFORMAÇÕES
      // =================================================

      observacao: dto.observacao?.trim() || null,

      romaneio: dto.romaneio?.trim() || null,

      ciot: dto.ciot?.trim() || null,

      // =================================================
      // CTRB
      // =================================================

      ctrb_numero: dto.ctrb_numero?.trim() || null,

      ctrb_total: ctrbTotal,

      ctrb_adiantamento: ctrbAdiantamento,

      sest_senat: sestSenat,

      irrf,

      prev_social: prevSocial,

      inss,

      total_retencoes: totalRetencoes,

      valor_liquido: valorLiquido,

      vale_pedagio: dto.vale_pedagio ?? 0,

      // =================================================
      // CARGA MISTA
      // =================================================

      carga_mista: dto.carga_mista ?? false,

      num_fechamento: numFechamento,

      // =================================================
      // USUÁRIO
      // =================================================

      usuario: String(user.cod),
    };
  }

  private manifestNumbers(dto: CreateManifestDto) {
    return [
      dto.manifestos,
      dto.manifesto_adicional_1,
      dto.manifesto_adicional_2,
      dto.manifesto_adicional_3,
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => !!value);
  }

  private async resolveClosureNumber(
    database: Prisma.TransactionClient,
    unit: number,
    placa: string,
    week: Awaited<ReturnType<typeof periodForDate>>,
    excludeId?: number,
  ) {
    const open = await database.frete_carregamento_manifestos.findFirst({
      where: {
        unit,
        placa,
        semana: { gte: week.data_inicio, lte: week.data_fim },
        fechamento_id: null,
        num_fechamento: { not: null },
        ...(excludeId === undefined ? {} : { id: { not: excludeId } }),
      },
      orderBy: { id: 'asc' },
      select: { num_fechamento: true },
    });
    if (open?.num_fechamento != null) return open.num_fechamento;

    if (excludeId !== undefined) {
      const current = await database.frete_carregamento_manifestos.findFirst({
        where: {
          id: excludeId,
          unit,
          placa,
          semana: { gte: week.data_inicio, lte: week.data_fim },
          fechamento_id: null,
        },
        select: { num_fechamento: true },
      });
      if (current?.num_fechamento != null) return current.num_fechamento;
    }

    const base = Number(week.codigo) * 10000;
    const range = { gte: base + 1, lte: base + 9999 };
    const [lastManifest, lastClosure] = await Promise.all([
      database.frete_carregamento_manifestos.findFirst({
        where: {
          unit,
          num_fechamento: range,
        },
        orderBy: { num_fechamento: 'desc' },
        select: { num_fechamento: true },
      }),
      database.frete_fechamentos.findFirst({
        where: {
          unit,
          numero: range,
        },
        orderBy: { numero: 'desc' },
        select: { numero: true },
      }),
    ]);
    const last = Math.max(
      lastManifest?.num_fechamento ?? base,
      lastClosure?.numero ?? base,
    );
    if (last >= base + 9999)
      throw new ConflictException(
        `A semana ${week.codigo} atingiu o limite de 9999 fechamentos.`,
      );
    return last + 1;
  }
}
