import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManifestsService } from '../manifests/manifests.service';
import { FreightCalculationService } from './freight-calculation.service';

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

describe('Cálculos do VBA', () => {
  // Configurações lidas de ICMS!B6:D8 do arquivo original.
  const rules = [
    { codigo_frete: 777, aliquota: '0.07', percentual: '0.15' },
    { codigo_frete: 888, aliquota: '0.12', percentual: '0.25' },
    { codigo_frete: 999, aliquota: '0.12', percentual: '1' },
  ];
  let service: FreightCalculationService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      frete_regras_calculo: { findMany: jest.fn().mockResolvedValue(rules) },
      frete_carregamento_manifestos: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }) => data),
      },
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({ codVehicleType: 1 }),
      },
      vehicleType: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ typeName: 'VAN', freight_value: 100 }),
      },
      driver: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Motorista de teste' }),
      },
      frete_destinos: {
        findFirst: jest.fn().mockResolvedValue({ nome: 'Destino de teste' }),
      },
    };
    prisma.frete_semanas = {
      findMany: jest.fn(async () => [
        {
          codigo: '2639',
          data_inicio: new Date('2026-09-21T00:00:00Z'),
          data_fim: new Date('2026-09-27T00:00:00Z'),
        },
      ]),
    };
    prisma.frete_fechamentos = { findFirst: jest.fn(async () => null) };
    prisma.$transaction = jest.fn(async (action) => action(prisma));
    service = new FreightCalculationService(prisma as PrismaService);
  });

  it.each([
    [777, 930, 150],
    [888, 880, 250],
    [999, 880, 1000],
  ])(
    'calcula os dois modos para o código %s',
    async (code, icms, percentage) => {
      const result = await service.calculate({
        frete_veiculo: 100,
        [`cod_${code}_00`]: 1000,
      });
      expect(result.totalFretes).toBe(icms);
      expect(result.percentageCalculation.totalFretes).toBe(percentage);
      expect(result.initPercent).toBeCloseTo(100 / icms, 8);
      expect(result.percentageCalculation.finalPercent).toBeCloseTo(
        100 / percentage,
        8,
      );
    },
  );

  it('inclui todos os adicionais, descarga, não entregues e despesas nos dois modos', async () => {
    const result = await service.calculate({
      frete_veiculo: 100,
      despesas_empresa: 50,
      cod_777_00: 1000,
      cod_888_00: 200,
      cod_999_00: 50,
      nao_777: 100,
      nao_888: 20,
      nao_999: 5,
      outros: 1,
      diaria: 2,
      tde: 3,
      escada: 4,
      paletizacao: 5,
      estadia: 6,
      descarga: 7,
    });
    expect(result).toMatchObject({
      totalFretes: 1150,
      totalReceive: 1178,
      discounts: 115,
      totalPay: 150,
    });
    expect(result.finalPercent).toBeCloseTo(150 / 1063, 8);
    expect(result.percentageCalculation).toMatchObject({
      totalFretes: 250,
      totalReceive: 278,
      discounts: 25,
      totalPay: 150,
    });
    expect(result.percentageCalculation.initPercent).toBe(0.4);
    expect(result.percentageCalculation.finalPercent).toBeCloseTo(150 / 253, 8);
  });

  it('arredonda cada frete e não entregue para duas casas com desempate para o par', async () => {
    const result = await service.calculate({
      frete_veiculo: 0,
      cod_888_00: 4.02,
      nao_888: 0.06,
    });
    expect(result.percentageCalculation.freightsCalculated).toMatchObject({
      freight888: 1, // 1,005 => 1,00
      notDelivery888: 0.02, // 0,015 => 0,02
    });
  });

  it('mantém percentuais zero na prévia sem frete', async () => {
    const result = await service.calculate({
      frete_veiculo: 100,
      descarga: 10,
    });
    expect(result).toMatchObject({
      initPercent: 0,
      finalPercent: 0,
      totalReceive: 10,
    });
    expect(result.percentageCalculation).toMatchObject({
      initPercent: 0,
      finalPercent: 0,
      totalReceive: 10,
    });
  });

  it('rejeita base final zero no modo ICMS', async () => {
    await expect(
      service.calculate({ frete_veiculo: 100, cod_777_00: 100, nao_777: 100 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejeita base final zero também quando ocorre só no segundo modo', async () => {
    await expect(
      service.calculate({ frete_veiculo: 100, cod_999_00: 10, nao_888: 40 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('usa os percentuais cadastrados e consulta a origem normalizada', async () => {
    prisma.frete_regras_calculo.findMany.mockResolvedValue(
      rules.map((rule) => ({ ...rule, percentual: '0.5' })),
    );
    const result = await service.calculate({
      origem: ' sp ',
      frete_veiculo: 100,
      cod_777_00: 1000,
    });
    expect(result.percentageCalculation.totalFretes).toBe(500);
    expect(prisma.frete_regras_calculo.findMany).toHaveBeenCalledWith({
      where: {
        origem: 'SP',
        ativo: true,
        codigo_frete: { in: [777, 888, 999] },
      },
    });
  });

  it('rejeita configuração sem um dos códigos', async () => {
    prisma.frete_regras_calculo.findMany.mockResolvedValue(rules.slice(0, 2));
    await expect(
      service.calculate({ frete_veiculo: 100 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('salva a coluna 50 no percentual_antigo sem substituir os campos ICMS', async () => {
    const manifests = new ManifestsService(prisma, service);
    const saved = await manifests.create(
      {
        semana: '2026-09-22',
        hora: '10:00',
        manifestos: '101000001-1',
        placa: 'ABC1234',
        cpf_motorista: '12345678901',
        destino_id: 1,
        m3: 1,
        kg: 100,
        qtd_nf: 1,
        cod_777_00: 1000,
        descarga: 10,
      },
      { sub: 1, cod: 10, unit: 101, isAdmin: false },
    );
    expect(saved).toMatchObject({
      origem: 'SP',
      cod_777_15: 930,
      frete_calc: 930,
      sub_total: 930,
      perc_carreg: 0.10752688,
      perc_final: 0.10638298,
      carreg_perc: 0.10752688,
      final_perc: 0.10638298,
      percentual_antigo: 0.625,
    });
  });
});
