import { RegistrationsService } from './registrations.service';
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
const user = { sub: 1, cod: 2, unit: 100, isAdmin: false };
function setup(count = 1) {
  const updateMany = jest.fn().mockResolvedValue({ count });
  return { updateMany, service: new RegistrationsService({ vehicle: { updateMany } } as any) };
}
it('exclui logicamente apenas o veículo ativo e registra o usuário', async () => {
  const { service, updateMany } = setup();
  expect(await service.removeVehicle('abc1d23', user)).toEqual({ plate: 'ABC1D23', excluded: true });
  expect(updateMany).toHaveBeenCalledWith({ where: { plate: 'ABC1D23', canceled: false }, data: { canceled: true, user: 2 } });
});
it('rejeita placa inválida sem alterar registros', async () => {
  const { service, updateMany } = setup();
  await expect(service.removeVehicle('invalid', user)).rejects.toThrow('Placa inválida');
  expect(updateMany).not.toHaveBeenCalled();
});
it('informa quando o veículo não existe ou já foi excluído', async () => {
  const { service } = setup(0);
  await expect(service.removeVehicle('ABC1234', user)).rejects.toThrow('Veículo não encontrado ou já excluído');
});
