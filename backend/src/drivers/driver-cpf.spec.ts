import { DriversService } from './drivers.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VehicleRegistrationDto } from '../registrations/registration.dto';
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
it('preserva zeros iniciais na lista e na consulta individual', async () => {
  const row = { cpf: 123456789n, name: 'Motorista' };
  const service = new DriversService({ driver: { findMany: async () => [row], findUnique: async () => row } } as any);
  expect((await service.findAll())[0].cpf).toBe('00123456789');
  expect((await service.findByCpf('00123456789')).cpf).toBe('00123456789');
});
it('aceita CPF legado sem zeros, mas rejeita nome no lugar do CPF', async () => {
  const data = { plate: 'ABC1234', owner: '52998224725', owner_name: 'Proprietário', empresa_sigla: 'EX', codVehicleType: 1 };
  const dto = plainToInstance(VehicleRegistrationDto, { ...data, driver_cpf: '123456789' });
  expect(dto.driver_cpf).toBe('00123456789');
  expect(await validate(dto)).toHaveLength(0);
  expect((await validate(plainToInstance(VehicleRegistrationDto, { ...data, driver_cpf: 'Motorista' }))).some(e => e.property === 'driver_cpf')).toBe(true);
});
