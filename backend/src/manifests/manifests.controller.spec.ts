import { NotFoundException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth-user.types';
import { PrismaService } from '../prisma/prisma.service';
import { FreightCalculationService } from '../freight-calculation/freight-calculation.service';
import { ManifestsController } from './manifests.controller';
import { ManifestsService } from './manifests.service';

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
// O usuário já autenticado é fornecido ao controller nestes testes.
jest.mock('../auth/jwt-auth.guard', () => ({ JwtAuthGuard: class {} }));

describe('ManifestsController: isolamento por unidade', () => {
  const records = [
    { id: 1, unit: 101, manifestos: '101000001-1' },
    { id: 2, unit: 202, manifestos: '202000001-1' },
  ];
  let controller: ManifestsController;
  let request: AuthenticatedRequest;

  beforeEach(() => {
    // Simula a omissão de filtros undefined, para detectar a regressão
    // em que o controller passava um número em vez do usuário completo.
    const matches = (
      record: (typeof records)[number],
      where: Record<string, unknown>,
    ) =>
      Object.entries(where).every(
        ([key, value]) => value === undefined || record[key] === value,
      );
    const prisma = {
      frete_carregamento_manifestos: {
        findMany: jest.fn(async ({ where }) =>
          records.filter((record) => matches(record, where)),
        ),
        findFirst: jest.fn(
          async ({ where }) =>
            records.find((record) => matches(record, where)) ?? null,
        ),
      },
    };
    const service = new ManifestsService(
      prisma as unknown as PrismaService,
      {} as FreightCalculationService,
    );
    controller = new ManifestsController(service);
    request = { user: { sub: 1, cod: 10, unit: 101, isAdmin: false } };
  });

  it('lista somente manifestos da unidade autenticada', async () => {
    await expect(controller.findAll(request)).resolves.toEqual([records[0]]);
  });

  it('retorna um manifesto da própria unidade', async () => {
    await expect(controller.findOne(1, request)).resolves.toEqual(records[0]);
  });

  it('não permite consultar por ID um manifesto de outra unidade', async () => {
    await expect(controller.findOne(2, request)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('mantém o filtro de unidade para administradores', async () => {
    request.user.isAdmin = true;
    await expect(controller.findAll(request)).resolves.toEqual([records[0]]);
    await expect(controller.findOne(2, request)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
