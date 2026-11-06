import { ForbiddenException } from '@nestjs/common';
import { verifyPassword } from '../auth/passwords';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const admin = { sub: 1, cod: 1, unit: 100, isAdmin: true } as any;
  const dto = {
    cod: 20,
    name: 'Novo Usuário',
    password: 'senha123',
    unit: 100,
    isAdmin: false,
    freightProfile: 'OPERACAO' as const,
  };

  it('impede listagem e criação por usuário comum', async () => {
    const db = {} as any;
    const service = new UsersService(db);
    expect(() => service.list({ ...admin, isAdmin: false })).toThrow(ForbiddenException);
    await expect(service.create(dto, { ...admin, isAdmin: false })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('cria login e permissões da unidade com senha protegida', async () => {
    const employees = {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }) => ({ id: 2, ...data })),
    };
    const permissions = { create: jest.fn(async ({ data }) => data) };
    const db = {
      employees,
      branches: { findUnique: jest.fn().mockResolvedValue({ unit: 100 }) },
      user_permissions: permissions,
      $transaction: jest.fn((work) => work({ employees, user_permissions: permissions })),
    } as any;
    const service = new UsersService(db);

    const result = await service.create(dto, admin);

    const stored = employees.create.mock.calls[0][0].data.password;
    expect(stored).not.toBe(dto.password);
    await expect(verifyPassword(stored, dto.password)).resolves.toBe(true);
    expect(result).toMatchObject({ cod: 20, unit: 100, freight_profile: 'OPERACAO' });
    expect(permissions.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      cod_user: 20,
      unit: 100,
      freight_service: true,
      freight_closure: true,
    }) });
  });

  it('edita os dados e preserva a senha quando nenhuma nova é informada', async () => {
    const update = jest.fn(async ({ data }) => ({ id: 2, cod: 20, ...data }));
    const permissions = {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue({ id: 5 }),
      create: jest.fn(),
    };
    const db = {
      employees: {
        findUnique: jest.fn().mockResolvedValue({ id: 2, cod: 20, password: 'hash-atual' }),
        update,
      },
      branches: { findUnique: jest.fn().mockResolvedValue({ unit: 301 }) },
      user_permissions: permissions,
      $transaction: jest.fn((work) => work({ employees: { update }, user_permissions: permissions })),
    } as any;
    const service = new UsersService(db);

    const result = await service.update(20, {
      name: 'Nome Alterado',
      unit: 301,
      isAdmin: true,
      freightProfile: 'FINANCEIRO',
    }, admin);

    expect(update.mock.calls[0][0].data).not.toHaveProperty('password');
    expect(result).toMatchObject({ cod: 20, Name: 'Nome Alterado', unit: 301, isAdmin: true });
    expect(permissions.updateMany).toHaveBeenCalledWith({
      where: { cod_user: 20 },
      data: { is_admin: true, alterado_por: 1 },
    });
  });
});
