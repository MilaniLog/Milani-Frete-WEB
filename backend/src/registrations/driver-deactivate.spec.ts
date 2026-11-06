import { RegistrationsService } from './registrations.service';

describe('Desativação de motorista', () => {
  const user = { sub: 1, cod: 77, unit: 100, isAdmin: true };

  it('marca o motorista como desativado sem excluir o registro', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = new RegistrationsService({
      driver: { updateMany },
    } as any);

    await expect(service.removeDriver('529.982.247-25', user)).resolves.toEqual({
      cpf: '52998224725',
      deactivated: true,
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { cpf: BigInt('52998224725'), canceled: false },
      data: { canceled: true, user: 77, alterado_por: 77 },
    });
  });

  it('lista somente motoristas ativos', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new RegistrationsService({ driver: { findMany } } as any);
    await service.drivers();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { canceled: false },
    }));
  });

  it('não sugere motorista desativado nos veículos ativos', async () => {
    const findManyDrivers = jest.fn().mockResolvedValue([]);
    const service = new RegistrationsService({
      vehicle: {
        findMany: jest.fn().mockResolvedValue([{
          plate: 'ABC1D23',
          codVehicleType: 1,
          owner: '52998224725',
          owner_name: 'Proprietário',
          empresa_sigla: 'ECP',
          driver_cpf: '52998224725',
          unit: 100,
        }]),
      },
      driver: { findMany: findManyDrivers },
    } as any);
    await expect(service.vehicles()).resolves.toEqual([
      expect.objectContaining({ plate: 'ABC1D23', driver_name: null }),
    ]);
    expect(findManyDrivers).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ canceled: false }),
    }));
  });
});
