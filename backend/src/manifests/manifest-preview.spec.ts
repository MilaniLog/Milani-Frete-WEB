import { ManifestsService } from './manifests.service';
import { FreightCalculationService } from '../freight-calculation/freight-calculation.service';
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

describe('Prévia do formulário VBA', () => {
  const user = { sub: 1, cod: 2, unit: 100, isAdmin: false };
  function setup() {
    const db = {
      vehicle: { findUnique: jest.fn().mockResolvedValue({ codVehicleType: 1, canceled: false }) },
      vehicleType: { findUnique: jest.fn().mockResolvedValue({ typeName: 'VAN', freight_value: 250, max_m3: 12, max_weight: 1500 }) },
      frete_carregamento_manifestos: { findFirst: jest.fn().mockResolvedValue({ frete_veiculo: 300 }) },
      frete_lancamentos: { findMany: jest.fn().mockResolvedValue([
        { tipo_despesa: 'Credito', valor: 50 }, { tipo_despesa: 'Debito', valor: 80 }, { tipo_despesa: 'Adiantamento', valor: 90 },
      ]) },
      frete_regras_calculo: { findMany: jest.fn().mockResolvedValue([
        { codigo_frete: 777, aliquota: '0.07', percentual: '0.15' },
        { codigo_frete: 888, aliquota: '0.12', percentual: '0.25' },
        { codigo_frete: 999, aliquota: '0.12', percentual: '1' },
      ]) },
    };
    return { db, service: new ManifestsService(db as any, new FreightCalculationService(db as any)) };
  }
  it('usa frete padrão e ICMS como CalcOldPercentManifest, incluindo adicionais e não entregues', async () => {
    const { service } = setup();
    const result = await service.preview({ placa: 'ABC1234', cod_777_00: 1000, nao_777: 100, descarga: 100 } as any, user);
    expect(result.frete_veiculo).toBe(250);
    expect(result.totalFretes).toBe(930);
    expect(result.totalReceive).toBe(1030);
    expect(result.discounts).toBe(93);
    expect(result.finalPercent).toBeCloseTo(250 / 937, 8);
    expect(result.vehicle).toEqual({ type: 'VAN', max_m3: 12, max_weight: 1500 });
  });
  it('preserva frete manual zero e inclui apenas créditos vinculados da mesma unidade', async () => {
    const { db, service } = setup();
    const result = await service.preview({ placa: 'ABC1234', manifesto_id: 8, frete_veiculo: 0, cod_777_00: 1000, despesas_empresa: 999 } as any, user);
    expect(result.frete_veiculo).toBe(0);
    expect(result.freightVehicle).toBe(50);
    expect(db.frete_lancamentos.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { manifesto_id: 8, unit: 100 } }));
  });
  it('preserva frete original ao editar e não expõe manifesto de outra unidade', async () => {
    const { db, service } = setup();
    const dto = { placa: 'ABC1234', manifesto_id: 8, cod_777_00: 1000 } as any;
    expect((await service.preview(dto, user)).frete_veiculo).toBe(300);
    db.frete_carregamento_manifestos.findFirst.mockResolvedValueOnce(null);
    await expect(service.preview(dto, user)).rejects.toMatchObject({ status: 404 });
  });
});
