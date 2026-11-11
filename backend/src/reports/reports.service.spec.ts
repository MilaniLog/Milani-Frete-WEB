import { ReportsService } from './reports.service';
import { reportHtml, reportSpreadsheet } from './report-render';
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

it('formata CPF e CNPJ no HTML e na planilha', () => {
  const report = {
    title: 'Documentos',
    notes: [],
    columns: ['CPF', 'CNPJ'],
    rows: [['00123456789', '11222333000181']],
    totals: [],
    numeric: [],
  };
  expect(reportHtml(report)).toContain('001.234.567-89');
  expect(reportHtml(report)).toContain('11.222.333/0001-81');
  const spreadsheet = reportSpreadsheet(report).toString('utf8');
  expect(spreadsheet).toContain('001.234.567-89');
  expect(spreadsheet).toContain('11.222.333/0001-81');
});
describe('Relatórios VBA', () => {
  const user = { sub: 1, cod: 7, unit: 100, isAdmin: false };
  let db: any, service: ReportsService;
  const start = new Date('2026-09-20'),
    end = new Date('2026-09-26');
  const original = {
    manifests: [
      {
        id: 1,
        manifestos: 'M1',
        frete_veiculo: '1000',
        ctrb_total: '200',
        valor_liquido: '150',
      },
      { frete_veiculo: '0', ctrb_total: '999', valor_liquido: '999' },
    ],
    entries: [
      {
        id: 9,
        manifesto_id: 1,
        codigo_despesa: '3333',
        tipo_despesa: 'Debito',
        valor: '25',
      },
    ],
    coupons: [],
    totals: { total_bruto: '1000', total_liquido: '900', total_ctrb: '1199' },
    payment: {
      primeira: { empresa: 'MMA', valor: '900' },
      segunda: { empresa: null, valor: '0' },
      ctrbs: [],
      criterio: 'CTRB',
    },
    beneficiario: { documento: '00123456789', nome: 'Proprietário original' },
  };
  beforeEach(() => {
    db = {
      frete_semanas: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            codigo: '3926',
            data_inicio: start,
            data_fim: end,
          }),
        findMany: jest.fn().mockResolvedValue([
          { codigo: '3926', data_inicio: start, data_fim: end },
          { codigo: '3826', data_inicio: new Date('2026-09-13'), data_fim: new Date('2026-09-19') },
          { codigo: '3726', data_inicio: new Date('2026-09-06'), data_fim: new Date('2026-09-12') },
          { codigo: '3626', data_inicio: new Date('2026-08-30'), data_fim: new Date('2026-09-05') },
        ]),
      },
      frete_lancamentos: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              id: 1,
              numero: 5,
              unit: 100,
              manifesto_id: 1,
              placa: 'ABC1234',
              motorista: 'João',
              codigo_despesa: '0002',
              nome_despesa: 'Pedágio',
              tipo_despesa: 'Credito',
              valor: '0.10',
              data_lancamento: start,
              created_at: start,
              pago: false,
              fechamento_id: null,
              descricao: '<script>x</script>',
              departamento: 'A',
              responsavel_cod: 7,
            },
          ]),
      },
      frete_cupons: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              id: 2,
              placa: 'ABC1234',
              motorista: 'João',
              nota: {
                numero: '0001',
                codigo_tipo: '0009',
                nome_tipo: 'Avaria',
              },
              valor: '0.20',
              data_cobranca: start,
              created_at: start,
              pago: false,
              fechamento_id: null,
              departamento: 'A',
              responsavel_cod: 8,
            },
          ]),
      },
      frete_carregamento_manifestos: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, manifestos: 'M1' }]),
      },
      frete_fechamentos: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              id: 3,
              numero: 40,
              unit: 100,
              semana: '3926',
              placa: 'ABC1234',
              status: 'FECHADO',
              periodo_inicio: start,
              periodo_fim: end,
              total_bruto: '1000',
              total_liquido: '900',
              total_ctrb: '1199',
              historico: { finalizacao: { dados: original } },
            },
          ]),
      },
      vehicle: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              plate: 'ABC1234',
              codVehicleType: 1,
              owner: '99999999999',
              owner_name: 'Alterado',
              empresa_sigla: 'ATT',
            },
          ]),
      },
      vehicleType: {
        findMany: jest.fn().mockResolvedValue([
          { codVehicleType: 1, typeName: 'VAN' },
        ]),
      },
      branches: {
        findMany: jest.fn().mockImplementation((query) =>
          query?.where?.unit
            ? Promise.resolve([
                { unit: 100, branch: 'SP', dominio: 'MLN' },
              ])
            : Promise.resolve([{ unit: 301 }, { unit: 830 }]),
        ),
      },
    };
    db.$transaction = jest.fn((work) => work(db));
    service = new ReportsService(db);
  });
  it('lista números já atribuídos aos manifestos de todas as unidades, mesmo antes do fechamento', async () => {
    db.frete_carregamento_manifestos.findMany.mockResolvedValue([
      {
        placa: 'ABC1234',
        num_fechamento: 41260001,
      },
      {
        placa: 'DEF5678',
        num_fechamento: 41260002,
      },
      {
        placa: 'DEF5678',
        num_fechamento: 41260002,
      },
    ]);
    const result = await service.manifests({ semana: '3926' }, user);
    expect(db.frete_carregamento_manifestos.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          cancelado: false,
          semana: { gte: start, lte: end },
          num_fechamento: { not: null },
        },
        orderBy: [{ placa: 'asc' }, { num_fechamento: 'asc' }],
      }),
    );
    expect(result.columns).toEqual(['Placa', 'Nº fechamento']);
    expect(result.printLayout).toBe('compact-pairs');
    expect(result.rows).toEqual([
      ['ABC1234', '41260001'],
      ['DEF5678', '41260002'],
    ]);
    expect(result.notes).toContain('Todas as unidades');
    expect(result.notes).toContain('Total: 2');
    const html = reportHtml(result);
    expect(html).toContain('@page{size:A4 portrait');
    expect(html.match(/<th>PLACA<\/th>/g)).toHaveLength(2);
    expect(html.match(/<th>Nº FECHAMENTO<\/th>/g)).toHaveLength(2);
    expect(html).not.toContain('Valores em reais');
  });

  it('permite que usuário comum filtre o relatório de CTRB por local', async () => {
    db.frete_carregamento_manifestos.findMany.mockResolvedValue([]);
    await service.manifests({ semana: '3926', local: 'VIX' }, user);
    expect(db.branches.findMany).toHaveBeenCalledWith({
      where: { branch: 'VIX' },
      select: { unit: true },
    });
    expect(db.frete_carregamento_manifestos.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ unit: { in: [301, 830] } }),
      }),
    );
  });
  it('soma valores decimais, diferencia cupons e vales e escapa texto', async () => {
    const result = await service.financial({ semana: '3926' }, user);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0][1]).toBe(1);
    expect(result.rows[0][1]).not.toBe(5);
    expect(result.rows[0][5]).toBe('M1');
    expect(result.rows[1][5]).toBe('0001');
    expect(result.columns).toContain('Usuário');
    expect(result.rows[0][12]).toBe(7);
    expect(result.totals.at(-1)?.value).toBe('-0.10');
    expect(reportHtml(result)).not.toContain('<script>');
    expect(reportHtml(result)).toContain('&lt;script&gt;');
  });
  it('consulta todos os vales da placa sem exigir período', async () => {
    const result = await service.financial(
      {
        placa: 'ABC1234',
        lancamentos: 'true',
        cupons: 'false',
        situacao: 'todos',
      },
      user,
    );

    expect(db.frete_lancamentos.findMany).toHaveBeenCalledWith({
      where: { unit: 100, placa: 'ABC1234', cancelado: false },
      orderBy: { id: 'asc' },
    });
    expect(result.notes[0]).toContain('Todos os vales da placa ABC1234');
  });
  it('aplica placa, departamento, usuário, status e intervalo de inclusão à unidade', async () => {
    await service.financial(
      {
        inicio: '2026-09-20',
        fim: '2026-09-26',
        placa: 'ABC1234',
        departamento: 'A',
        usuario: '7',
        data_por: 'inclusao',
        situacao: 'abertos',
      },
      user,
    );
    for (const table of ['frete_lancamentos', 'frete_cupons'])
      expect(db[table].findMany.mock.calls[0][0].where).toMatchObject({
        unit: 100,
        placa: 'ABC1234',
        departamento: { startsWith: 'A' },
        responsavel_cod: 7,
        pago: false,
        fechamento_id: null,
        created_at: { gte: start, lt: new Date('2026-09-27') },
      });
  });
  it('filtra vales por crédito ou débito e pelo tipo da despesa', async () => {
    await service.financial(
      {
        semana: '3926',
        lancamentos: 'true',
        cupons: 'false',
        movimento: 'debito',
        tipo: '0001',
      },
      user,
    );
    expect(db.frete_lancamentos.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tipo_despesa: { in: ['Debito', 'Adiantamento'] },
        codigo_despesa: '0001',
      }),
      orderBy: { id: 'asc' },
    });

    db.frete_lancamentos.findMany.mockClear();
    await service.financial(
      {
        semana: '3926',
        lancamentos: 'true',
        cupons: 'false',
        movimento: 'credito',
      },
      user,
    );
    expect(db.frete_lancamentos.findMany.mock.calls[0][0].where).toMatchObject({
      tipo_despesa: 'Credito',
    });
  });
  it('permite somente cupons e valida seleção vazia e período', async () => {
    const result = await service.financial({ semana: '3926', lancamentos: 'false' }, user);
    expect(result.title).toBe('Conferência de cupons');
    expect(result.rows.every(row => row[0] === 'Cupom')).toBe(true);
    expect(reportHtml(result)).not.toContain('SELECIONADOS');
    expect(db.frete_lancamentos.findMany).not.toHaveBeenCalled();
    await expect(
      service.financial(
        { semana: '3926', lancamentos: 'false', cupons: 'false' },
        user,
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.financial({ inicio: '2026-09-26', fim: '2026-09-20' }, user),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.financial({ semana: '3926', inicio: '2026-09-20' }, user),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('relatório de vales não consulta cupons e agrupa a impressão por placa', async () => {
    const result = await service.financial({ semana: '3926', cupons: 'false' }, user);
    expect(db.frete_cupons.findMany).not.toHaveBeenCalled();
    expect(result.title).toBe('Conferência de vales');
    expect(result.rows.every(row => row[0] === 'Vale')).toBe(true);
    const html = reportHtml(result);
    expect(html).toContain('ABC1234 · VAN · João');
    expect(html).toContain('ID VALE');
    expect(html).toContain('CRÉDITOS');
    expect(html).not.toContain('<h3>DÉBITOS</h3>');
    expect(html).not.toContain('<h3>CTRB</h3>');
    expect(html).toContain('TOTAL DA PLACA');
    expect(html).toContain('0002 - Pedágio');
    expect(html).not.toContain('TIPO: 0002');
  });
  it('mantém o CTRB separado e não o soma ao total da placa', () => {
    const html = reportHtml({
      financialKind: 'entries',
      title: 'Vales',
      notes: [],
      columns: ['Origem', 'ID Vale', 'Data', 'Placa', 'Motorista', 'Manifesto', 'Código'],
      numeric: [10],
      totals: [],
      rows: [
        ['Vale', 1, '20/09/2026', 'ABC1234', 'João', 'M1', '0001', 'Moeda', '', 'Debito', '-10.00'],
        ['Vale', 2, '20/09/2026', 'ABC1234', 'João', 'M1', '3333', 'CTRB', '', 'Debito', '-5.00'],
      ],
    });
    expect(html).toMatch(/TOTAL DE CTRB<\/th><th class="value">-?R\$\s*5,00/);
    expect(html).toMatch(/TOTAL DA PLACA<\/strong><span>-?R\$\s*10,00/);
  });
  it('planilha usa o TOTAL CTRB do relatório, já descontado do CTRB pago', async () => {
    const result = await service.payments(
      { semana: '3926', dominio: 'MLN', placa: 'ABC1234' },
      user,
    );
    expect(result.rows[0]).toEqual([
      'MMA',
      '00123456789',
      'Proprietário original',
      '3926',
      '40',
      'ABC1234',
      '1000.00',
      '200.00',
      '25.00',
      '800.00',
      '100.00',
      '700.00',
      '16/10/2026',
      null,
      '100',
      'MLN',
      'SP',
      '1124.00',
    ]);
    expect(result.rows[1]).toEqual([
      'MMA',
      null,
      'SUBTOTAL MMA',
      null,
      null,
      null,
      '1000.00',
      '200.00',
      '25.00',
      '800.00',
      '100.00',
      '700.00',
      null,
      null,
      null,
      null,
      null,
      '1124.00',
    ]);
    expect(result.subtotalRows).toEqual([1]);
    expect(result.columns[0]).toBe('EMPRESA');
    expect(result.columns[8]).toBe('CTRB PAGO');
    expect(result.columns[12]).toBe('VENC');
    expect(result.columns[13]).toBe('DT PG');
    expect(result.totalSections).toEqual([
      {
        title: 'Totais do frete',
        totals: [
          { label: 'Total TTL frete', value: '1000.00' },
          { label: 'Total líquido sem CTRB', value: '800.00' },
          { label: 'Total vales', value: '100.00' },
          { label: 'Total líquido a pagar', value: '700.00' },
        ],
      },
      {
        title: 'Totais do CTRB',
        totals: [
          { label: 'Total CTRB bruto', value: '200.00' },
          { label: 'Total CTRB líquido', value: '1124.00' },
          { label: 'Total CTRB pago', value: '25.00' },
          { label: 'Total CTRB a pagar', value: '1124.00' },
        ],
      },
      {
        title: 'Total final',
        totals: [
          { label: 'Total líquido a pagar', value: '700.00' },
          { label: 'Total CTRB a pagar', value: '1124.00' },
          { label: 'Total a pagar', value: '1824.00' },
        ],
      },
    ]);
    expect(result.columns).toContain('PLACA');
    expect(result.columns).toContain('DOM');
    expect(result.columns).toContain('UN');
    expect(result.columns).not.toContain('EMPR');
    expect(db.frete_fechamentos.findMany.mock.calls[0][0].where).toMatchObject({
      unit: 100,
      semana: '3926',
      status: 'FECHADO',
    });
    expect(db.frete_carregamento_manifestos.findMany).not.toHaveBeenCalled();
    const sheet = reportSpreadsheet(result);
    const sheetContents = sheet.toString('utf8');
    expect(sheet.subarray(0, 2).toString()).toBe('PK');
    expect(sheetContents).toContain('001.234.567-89');
    expect(sheetContents).toContain('SUBTOTAL MMA');
    expect(sheetContents).not.toContain('EMPRESA: MMA');
    expect(sheetContents).toContain('>MMA<');
    expect(sheetContents).toContain('CPF/CNPJ PROP');
    expect(sheetContents).toContain('<cols>');
    expect(sheetContents).toContain('bestFit="1"');
    expect(sheetContents).toContain('Total CTRB a pagar');
    expect(sheetContents).toContain('Total a pagar');
    expect(sheetContents).toContain('<v>700</v>');
    expect(sheetContents).not.toContain('<f>');
    const html = reportHtml(result);
    expect(html).toContain('<th>MMA</th><th>CPF/CNPJ PROP</th>');
    expect(html).not.toContain('EMPRESA: MMA');
    const secondCompany = [...result.rows[0]];
    secondCompany[0] = 'ZZZ';
    const secondSubtotal = [...result.rows[1]];
    secondSubtotal[0] = 'ZZZ';
    secondSubtotal[2] = 'SUBTOTAL ZZZ';
    const multiCompanySheet = reportSpreadsheet({
      ...result,
      rows: [...result.rows, secondCompany, secondSubtotal],
      subtotalRows: [1, 3],
    }).toString('utf8');
    expect(multiCompanySheet).toContain('<rowBreaks count="1" manualBreakCount="1">');
    expect(multiCompanySheet).toContain('man="1"');
  });
  it('soma o TTL FRETE da semana escolhida e das três anteriores por placa', async () => {
    db.frete_fechamentos.findMany.mockResolvedValue([
      { id: 1, unit: 100, semana: '3926', placa: 'ABC1234', status: 'FECHADO', total_bruto: '100', historico: null },
      { id: 2, unit: 100, semana: '3826', placa: 'ABC1234', status: 'FECHADO', total_bruto: '200', historico: null },
      { id: 3, unit: 100, semana: '3726', placa: 'ABC1234', status: 'FECHADO', total_bruto: '300', historico: null },
      { id: 4, unit: 100, semana: '3626', placa: 'ABC1234', status: 'FECHADO', total_bruto: '400', historico: null },
    ]);
    db.vehicle.findMany.mockResolvedValue([
      { plate: 'ABC1234', owner: '00123456789', owner_name: 'Proprietário' },
    ]);

    const result = await service.accumulatedFreight(
      { semana: '3926', unit: 100, tipo: '1' },
      { ...user, isAdmin: true },
    );

    expect(result.columns).toEqual([
      'UNIDADE',
      'CPF/CNPJ',
      'Nome do proprietário',
      'Placa',
      'Valor acumulado',
      '3926',
      '3826',
      '3726',
      '3626',
    ]);
    expect(result.rows).toEqual([
      ['100', '00123456789', 'Proprietário', 'ABC1234', '1000.00', '100.00', '200.00', '300.00', '400.00'],
    ]);
    expect(db.frete_fechamentos.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          unit: 100,
          status: 'FECHADO',
          semana: { in: ['3926', '3826', '3726', '3626'] },
          placa: { in: ['ABC1234'] },
        },
      }),
    );
    expect(db.vehicle.findMany).toHaveBeenCalledWith({
      where: { codVehicleType: 1 },
      select: { plate: true },
    });
  });
  it('bloqueia o frete acumulado para usuario nao administrador', async () => {
    expect(() => service.accumulatedFreight({ semana: '3926' }, user)).toThrow(
      'Somente administradores',
    );
  });
  it('reimprime por número usando histórico sem cálculos ou gravações', async () => {
    const html = await service.reprint({ numero: '40' }, user);
    expect(html).toContain('M1');
    expect(html).toContain('40');
    expect(db.frete_fechamentos.findMany.mock.calls[0][0].where).toEqual({
      unit: 100,
      status: 'FECHADO',
      numero: 40,
    });
    expect(db.frete_fechamentos.findMany.mock.calls[0][0].orderBy).toEqual([
      { placa: 'asc' },
      { numero: 'asc' },
      { id: 'asc' },
    ]);
    expect(db.frete_lancamentos.findMany).toHaveBeenCalledWith({
      where: { id: { in: [9] } },
    });
    db.frete_fechamentos.findMany.mockResolvedValue([]);
    await expect(service.reprint({ numero: '40' }, user)).rejects.toMatchObject(
      { status: 404 },
    );
  });
  it('aplica domínio e unidade local à reimpressão administrativa', async () => {
    await service.reprint(
      { semana: '3926', dominio: 'MLN', local: 'SSA' },
      { ...user, isAdmin: true },
    );
    expect(db.branches.findMany).toHaveBeenCalledWith({
      where: { branch: 'SSA', dominio: 'MLN' },
      select: { unit: true },
    });
    expect(db.frete_fechamentos.findMany.mock.calls[0][0].where).toMatchObject({
      unit: { in: [301, 830] },
      status: 'FECHADO',
      semana: '3926',
    });
  });
  it('filtra a reimpressão pela categoria do veículo', async () => {
    await service.reprint(
      { semana: '3926', categoria: 'Esporadico' },
      user,
    );
    expect(db.vehicle.findMany).toHaveBeenCalledWith({
      where: { codVehicleType: { gte: 100 } },
      select: { plate: true },
    });
    expect(db.frete_fechamentos.findMany.mock.calls.at(-1)[0].where).toMatchObject({
      unit: 100,
      status: 'FECHADO',
      semana: '3926',
      placa: { in: ['ABC1234'] },
    });
  });
  it.each(['FINANCEIRO', 'RH'] as const)(
    'aplica filtros globais à reimpressão para o perfil %s',
    async (freightProfile) => {
      await service.reprint(
        { semana: '3926', dominio: 'MLN', local: 'SSA' },
        { ...user, freightProfile },
      );
      expect(db.branches.findMany).toHaveBeenCalledWith({
        where: { branch: 'SSA', dominio: 'MLN' },
        select: { unit: true },
      });
      const call = db.frete_fechamentos.findMany.mock.calls.slice(-1)[0];
      expect(call[0].where).toMatchObject({
        unit: { in: [301, 830] },
        status: 'FECHADO',
        semana: '3926',
      });
    },
  );
  it('exclui cancelados da reimpressão e informa falta de dados legados', async () => {
    const closure = (await db.frete_fechamentos.findMany())[0];
    db.frete_fechamentos.findMany.mockResolvedValue([]);
    expect(await service.reprint({ semana: '3926' }, user)).not.toContain(
      'CANCELADO',
    );
    expect(
      db.frete_fechamentos.findMany.mock.calls.at(-1)[0].where,
    ).toMatchObject({ status: 'FECHADO' });
    db.frete_fechamentos.findMany.mockResolvedValue([
      { ...closure, historico: null },
    ]);
    const r = await service.payments({ semana: '3926' }, user);
    expect(r.rows[0][17]).toBeNull();
    expect(r.notes.join(' ')).toContain('sem cópia original');
  });
});
