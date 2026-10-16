import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DestinationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(nome: string) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          if (await tx.frete_destinos.findFirst({ where: { nome } }))
            throw new ConflictException('Destino já cadastrado.');
          return tx.frete_destinos.create({
            data: { nome, ativo: true },
            select: { id: true, nome: true },
          });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'P2034' || code === 'P2002')
        throw new ConflictException('Cadastro alterado simultaneamente. Atualize a lista antes de tentar novamente.');
      throw error;
    }
  }

  findAll() {
    return this.prisma.frete_destinos.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    });
  }

  async findById(id: number) {
    const destination = await this.prisma.frete_destinos.findFirst({
      where: { id, ativo: true },
      select: { id: true, nome: true },
    });
    if (!destination) throw new NotFoundException('Destino não encontrado.');
    return destination;
  }
}
