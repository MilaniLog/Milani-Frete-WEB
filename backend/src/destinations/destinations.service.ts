import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth-user.types';

@Injectable()
export class DestinationsService {
  constructor(private readonly prisma: PrismaService) {}
  private unitWhere(user: AuthUser, unit?: number) {
    return user.isAdmin ? (unit == null ? {} : { unit }) : { unit: user.unit };
  }

  async create(nome: string, user: AuthUser, requestedUnit?: number) {
    if (user.isAdmin && requestedUnit == null)
      throw new ConflictException('Informe a unidade do destino.');
    const unit = user.isAdmin ? requestedUnit! : user.unit;
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          if (await tx.frete_destinos.findFirst({ where: { unit, nome } }))
            throw new ConflictException('Destino já cadastrado nesta unidade.');
          return tx.frete_destinos.create({
            data: { unit, nome, ativo: true },
            select: { id: true, unit: true, nome: true },
          });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (e) {
      if (e.code === 'P2034' || e.code === 'P2002')
        throw new ConflictException(
          'Cadastro alterado simultaneamente. Atualize a lista antes de tentar novamente.',
        );
      throw e;
    }
  }

  async findAll(user: AuthUser) {
    return this.prisma.frete_destinos.findMany({
      where: {
        ...this.unitWhere(user),
        ativo: true,
      },

      orderBy: {
        nome: 'asc',
      },

      select: {
        id: true,
        unit: true,
        nome: true,
      },
    });
  }

  async findById(id: number, user: AuthUser) {
    const destination = await this.prisma.frete_destinos.findFirst({
      where: {
        id,
        ...this.unitWhere(user),
        ativo: true,
      },

      select: {
        id: true,
        unit: true,
        nome: true,
      },
    });

    if (!destination) {
      throw new NotFoundException('Destino não encontrado.');
    }

    return destination;
  }
}
