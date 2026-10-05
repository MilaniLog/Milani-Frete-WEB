import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import type { AuthUser } from '../auth/auth-user.types';

type Database = Pick<
  Prisma.TransactionClient,
  'frete_semanas' | 'frete_fechamentos'
>;

export async function getWeek(database: Database, codigo: string) {
  const week = await database.frete_semanas.findUnique({ where: { codigo } });
  if (!week) throw new NotFoundException('Semana não cadastrada.');
  return week;
}

export async function periodForDate(
  database: Database,
  date: Date,
  codigo?: string,
) {
  const weeks = await database.frete_semanas.findMany({
    where: { data_inicio: { lte: date }, data_fim: { gte: date } },
    take: 2,
  });
  if (!weeks.length)
    throw new BadRequestException(
      'Cadastre uma semana que inclua a data informada.',
    );
  if (weeks.length !== 1)
    throw new ConflictException('Há semanas sobrepostas para esta data.');
  const week = weeks[0];
  if (codigo !== undefined && codigo !== week.codigo)
    throw new BadRequestException('A data não pertence à semana informada.');
  return week;
}

export async function assertPeriodWritable(
  database: Database,
  date: Date,
  placa: string,
  user: AuthUser,
  codigo?: string,
) {
  const week = await periodForDate(database, date, codigo);
  const closure = await database.frete_fechamentos.findFirst({
    where: {
      unit: user.unit,
      placa,
      status: { notIn: ['ABERTO', 'CANCELADO'] },
      OR: [
        { semana: week.codigo },
        {
          periodo_inicio: { lte: week.data_fim },
          periodo_fim: { gte: week.data_inicio },
        },
      ],
    },
    select: { id: true },
  });
  // VBA permite intervenção administrativa no período, sem reabrir registros.
  if (closure && !user.isAdmin)
    throw new ConflictException(
      'Período fechado para esta placa. É necessária autorização administrativa.',
    );
  return week;
}
