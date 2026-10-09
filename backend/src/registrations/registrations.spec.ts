import { validDocument } from './document';
import { RegistrationsService } from './registrations.service';
describe('Cadastros de motoristas e veículos', () => {
  it.each([false, true])('salva motorista sem consultar ou vincular empresa (edição: %s)', async (editing) => {
    const cpf = '52998224725';
    const saved = { cpf: BigInt(cpf), name: 'Motorista teste', unit: 100 };
    const tx = {
      driver: {
        findUnique: jest.fn().mockResolvedValue(editing ? { cpf: BigInt(cpf) } : null),
        create: jest.fn().mockResolvedValue(saved),
        update: jest.fn().mockResolvedValue(saved),
      },
      frete_empresas: { findUnique: jest.fn() },
    };
    const service = new RegistrationsService({ $transaction: (fn) => fn(tx) } as any);
    const result = await service.driver({ cpf, name: saved.name },
      { sub: 1, cod: 2, unit: 100, isAdmin: false }, editing ? cpf : undefined);
    expect(result).toEqual({ cpf, name: saved.name, unit: 100 });
    expect(tx.frete_empresas.findUnique).not.toHaveBeenCalled();
    const write = editing ? tx.driver.update : tx.driver.create;
    expect(write.mock.calls[0][0].data).not.toHaveProperty('empresa_sigla');
    expect(write.mock.calls[0][0].select).toEqual({ cpf: true, name: true, unit: true });
    expect(write.mock.calls[0][0].data.unit).toBe(100);
  });
  it.each(['52998224725', '11222333000181'])(
    'aceita documento válido %s',
    (v) => expect(validDocument(v)).toBe(true),
  );
  it.each(['11111111111', '52998224724', '11222333000180', 'abc'])(
    'rejeita documento inválido %s',
    (v) => expect(validDocument(v)).toBe(false),
  );
  it('usuário comum passa pela mesma validação documental', async () => {
    const db = { $transaction: jest.fn() };
    const service = new RegistrationsService(db as any);
    const user = { sub: 1, cod: 1, unit: 100, isAdmin: false };
    await expect(service.driver({} as any, user)).rejects.toMatchObject({
      status: 400,
    });
    await expect(service.vehicle({} as any, user)).rejects.toMatchObject({
      status: 400,
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
