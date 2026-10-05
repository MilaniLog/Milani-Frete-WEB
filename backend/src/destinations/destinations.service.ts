import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DestinationsService {
  constructor(private readonly prisma: PrismaService) {}
  async create(nome: string, unit: number) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          if (await tx.frete_destinos.findFirst({ where: { unit, nome } }))
            throw new ConflictException('Destino já cadastrado nesta unidade.');
          return tx.frete_destinos.create({
            data: { unit, nome, ativo: true },
            select: { id: true, nome: true },
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

  async findAll(unit: number) {
    return this.prisma.frete_destinos.findMany({
      where: {
        unit,
        ativo: true,
      },

      orderBy: {
        nome: 'asc',
      },

      select: {
        id: true,
        nome: true,
      },
    });
  }

  async findById(id: number, unit: number) {
    const destination = await this.prisma.frete_destinos.findFirst({
      where: {
        id,
        unit,
        ativo: true,
      },

      select: {
        id: true,
        nome: true,
      },
    });

    if (!destination) {
      throw new NotFoundException('Destino não encontrado.');
    }

    return destination;
  }
}
