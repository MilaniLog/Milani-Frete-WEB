import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const drivers = await this.prisma.driver.findMany({
      orderBy: {
        name: 'asc',
      },

      select: {
        cpf: true,
        name: true,
      },
    });

    return drivers.map((driver) => ({
      cpf: driver.cpf.toString().padStart(11, '0'),
      name: driver.name,
    }));
  }

  async findByCpf(cpf: string) {
    const normalizedCpf = cpf.trim();

    if (!/^\d{1,11}$/.test(normalizedCpf)) {
      throw new BadRequestException('CPF inválido.');
    }

    const driver = await this.prisma.driver.findUnique({
      where: {
        cpf: BigInt(normalizedCpf),
      },

      select: {
        cpf: true,
        name: true,
      },
    });

    if (!driver) {
      throw new NotFoundException('Motorista não encontrado.');
    }

    return {
      cpf: driver.cpf.toString().padStart(11, '0'),
      name: driver.name,
    };
  }
}
