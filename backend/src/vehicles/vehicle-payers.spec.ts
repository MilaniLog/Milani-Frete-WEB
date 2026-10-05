import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VehiclesService } from './vehicles.service';
import { VehiclePayersDto } from './vehicle-payers.dto';

describe('Cadastro de pagadoras', () => {
  const admin = { sub: 1, cod: 1, unit: 2, isAdmin: true };
  const dto = {
    first_payer: 'A',
    second_payer: 'B',
    second_payer_percent: 0.3,
  };
  let db: any;
  let service: VehiclesService;
  beforeEach(() => {
    db = {
      vehicle: { update: jest.fn().mockResolvedValue({ plate: 'ABC1234' }) },
    };
    service = new VehiclesService(db);
  });
  it('normaliza placa e grava somente os três campos de pagadoras', async () => {
    await service.updatePayers(' abc1234 ', dto, admin);
    const query = db.vehicle.update.mock.calls[0][0];
    expect(query.where).toEqual({ plate: 'ABC1234', canceled: false });
    expect(Object.keys(query.data).sort()).toEqual(Object.keys(dto).sort());
    expect(query.data.second_payer_percent.toString()).toBe('0.3');
  });
  it('permite remover o rateio explicitamente', async () => {
    await service.updatePayers(
      'ABC1234',
      { first_payer: '', second_payer: '', second_payer_percent: 0 },
      admin,
    );
    expect(db.vehicle.update.mock.calls[0][0].data.first_payer).toBeNull();
    expect(db.vehicle.update.mock.calls[0][0].data.second_payer).toBeNull();
  });
  it('impede usuário comum de alterar cadastro global', async () => {
    await expect(
      service.updatePayers('ABC1234', dto, { ...admin, isAdmin: false }),
    ).rejects.toMatchObject({ status: 403 });
    expect(db.vehicle.update).not.toHaveBeenCalled();
  });
  it('não grava cadastro inconsistente', async () => {
    await expect(
      service.updatePayers('ABC1234', { ...dto, first_payer: '' }, admin),
    ).rejects.toMatchObject({ status: 409 });
    expect(db.vehicle.update).not.toHaveBeenCalled();
  });
  it('retorna 404 para veículo ausente ou cancelado', async () => {
    db.vehicle.update.mockRejectedValue({ code: 'P2025' });
    await expect(
      service.updatePayers('ABC1234', dto, admin),
    ).rejects.toMatchObject({ status: 404 });
  });
  it.each([
    {},
    { ...dto, second_payer_percent: '0.3' },
    { ...dto, second_payer_percent: 30 },
    { ...dto, second_payer_percent: 0.1234567 },
    { ...dto, first_payer: null },
    { ...dto, first_payer: 'A'.repeat(31) },
  ])('valida contrato %j', async (body) => {
    expect(
      (await validate(plainToInstance(VehiclePayersDto, body))).length,
    ).toBeGreaterThan(0);
  });
  it('aceita os limites do percentual', async () => {
    for (const percent of [0, 1, 0.123456])
      expect(
        await validate(
          plainToInstance(VehiclePayersDto, {
            ...dto,
            second_payer_percent: percent,
          }),
        ),
      ).toHaveLength(0);
  });
});
