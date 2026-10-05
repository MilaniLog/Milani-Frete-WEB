import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth-user.types';
import { WeekDto } from './weeks.dto';
import { getWeek } from './period-policy';

@Injectable()
export class WeeksService {
  constructor(private readonly prisma: PrismaService) {}

  list(date?: string) {
    const day = date ? new Date(`${date}T00:00:00.000Z`) : undefined;
    return this.prisma.frete_semanas.findMany({
      where: day ? { data_inicio: { lte: day }, data_fim: { gte: day } } : {},
      orderBy: { data_inicio: 'desc' },
    });
  }

  findOne(codigo: string) {
    return getWeek(this.prisma, codigo);
  }

  async save(dto: WeekDto, user: AuthUser, existingCode?: string) {
    // O calendário legado é global (sem unit); manutenção exige administrador.
    if (!user.isAdmin)
      throw new ForbiddenException(
        'Somente administradores podem alterar o calendário compartilhado.',
      );
    if (existingCode !== undefined && existingCode !== dto.codigo)
      throw new BadRequestException(
        'O código da semana não pode ser alterado.',
      );
    const start = new Date(`${dto.data_inicio}T00:00:00.000Z`);
    const end = new Date(`${dto.data_fim}T00:00:00.000Z`);
    if (end.getTime() - start.getTime() !== 6 * 86400000)
      throw new BadRequestException(
        'A semana deve conter sete dias, incluindo início e fim.',
      );
    if (start.getUTCDay() !== 0 || end.getUTCDay() !== 6)
      throw new BadRequestException(
        'A semana deve começar no domingo e terminar no sábado.',
      );
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            if (existingCode !== undefined) {
              const current = await getWeek(tx, existingCode);
              if (
                current.data_inicio.getTime() === start.getTime() &&
                current.data_fim.getTime() === end.getTime()
              )
                return current;
              const [manifest, entry, closure, coupon] = await Promise.all([
                tx.frete_carregamento_manifestos.findFirst({
                  where: {
                    semana: { gte: current.data_inicio, lte: current.data_fim },
                  },
                  select: { id: true },
                }),
                tx.frete_lancamentos.findFirst({
                  where: {
                    OR: [
                      { semana: existingCode },
                      {
                        data_lancamento: {
                          gte: current.data_inicio,
                          lte: current.data_fim,
                        },
                      },
                    ],
                  },
                  select: { id: true },
                }),
                tx.frete_fechamentos.findFirst({
                  where: {
                    OR: [
                      { semana: existingCode },
                      {
                        periodo_inicio: { lte: current.data_fim },
                        periodo_fim: { gte: current.data_inicio },
                      },
                    ],
                  },
                  select: { id: true },
                }),
                tx.frete_cupons.findFirst({
                  where: {
                    OR: [
                      { semana: existingCode },
                      {
                        data_cobranca: {
                          gte: current.data_inicio,
                          lte: current.data_fim,
                        },
                      },
                    ],
                  },
                  select: { id: true },
                }),
              ]);
              if (manifest || entry || closure || coupon)
                throw new ConflictException(
                  'Semana em uso não pode ter seu período alterado.',
                );
            }
            const overlapping = await tx.frete_semanas.findFirst({
              where: {
                ...(existingCode === undefined
                  ? {}
                  : { codigo: { not: existingCode } }),
                data_inicio: { lte: end },
                data_fim: { gte: start },
              },
            });
            if (overlapping)
              throw new ConflictException(
                'O período se sobrepõe a uma semana cadastrada.',
              );
            const data = {
              codigo: dto.codigo,
              data_inicio: start,
              data_fim: end,
            };
            return existingCode === undefined
              ? tx.frete_semanas.create({ data })
              : tx.frete_semanas.update({
                  where: { codigo: existingCode },
                  data,
                });
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (error) {
        if (error.code === 'P2002')
          throw new ConflictException('Código de semana já cadastrado.');
        if (error.code !== 'P2034') throw error;
        if (attempt === 2)
          throw new ConflictException(
            'Conflito ao salvar semana. Tente novamente.',
          );
      }
    }
  }
}
