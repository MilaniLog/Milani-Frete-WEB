import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth-user.types';
import { getWeek, periodForDate } from '../weeks/period-policy';
import {
  CouponDto,
  InvoiceDto,
  InvoiceTypeDto,
  InvoiceLaunchDto,
} from './freight-invoices.dto';

@Injectable()
export class FreightInvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  private async transaction<T>(
    action: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(action, {
          isolationLevel: 'Serializable',
        });
      } catch (error) {
        if (error.code === 'P2002')
          throw new ConflictException(
            'Número ou código já cadastrado nesta unidade.',
          );
        if (error.code === 'P2003')
          throw new ConflictException(
            'Existem vínculos que impedem esta alteração.',
          );
        if (error.code !== 'P2034') throw error;
        if (attempt === 2)
          throw new ConflictException('Conflito ao salvar. Tente novamente.');
      }
    }
  }

  listTypes(user: AuthUser) {
    return this.prisma.frete_tipos_nota.findMany({
      where: { unit: user.unit },
      orderBy: { codigo: 'asc' },
    });
  }

  saveType(dto: InvoiceTypeDto, user: AuthUser, id?: number) {
    return this.transaction(async (tx) => {
      if (id !== undefined) {
        const type = await tx.frete_tipos_nota.findFirst({
          where: { id, unit: user.unit },
        });
        if (!type) throw new NotFoundException('Tipo de nota não encontrado.');
        return tx.frete_tipos_nota.update({
          where: { id, unit: user.unit },
          data: dto,
        });
      }
      return tx.frete_tipos_nota.create({ data: { ...dto, unit: user.unit } });
    });
  }

  list(user: AuthUser) {
    return this.prisma.frete_notas.findMany({
      where: { unit: user.unit },
      orderBy: { id: 'desc' },
      take: 50,
    });
  }

  private async invoice(
    tx: Pick<PrismaService, 'frete_notas'>,
    id: number,
    user: AuthUser,
  ) {
    const note = await tx.frete_notas.findFirst({
      where: { id, unit: user.unit },
    });
    if (!note)
      throw new NotFoundException('Nota não encontrada nesta unidade.');
    return note;
  }

  findOne(id: number, user: AuthUser) {
    return this.invoice(this.prisma, id, user);
  }

  async findByNumber(numero: string, user: AuthUser) {
    const note = await this.prisma.frete_notas.findFirst({
      where: { numero: numero.trim(), unit: user.unit },
    });
    if (!note)
      throw new NotFoundException('Nota não encontrada nesta unidade.');
    return note;
  }

  findLaunch(id: number, user: AuthUser) {
    return this.transaction(async (tx) => {
      const coupon = await tx.frete_cupons.findFirst({
        where: { id, unit: user.unit },
      });
      if (!coupon)
        throw new NotFoundException('Lançamento não encontrado nesta unidade.');
      return { coupon, nota: await this.invoice(tx, coupon.nota_id, user) };
    });
  }

  createLaunch(dto: InvoiceLaunchDto, user: AuthUser) {
    return this.transaction(async (tx) => {
      const existing = await tx.frete_notas.findFirst({
        where: { numero: dto.nota.numero, unit: user.unit },
      });
      // Reusing a number never overwrites the invoice's original value or classification.
      if (
        existing &&
        (existing.tipo_id !== dto.nota.tipo_id ||
          !new Decimal(existing.valor).eq(dto.nota.valor) ||
          existing.data_nota.toISOString().slice(0, 10) !== dto.nota.data_nota)
      )
        throw new ConflictException(
          'A nota já existe com outros dados. Consulte a nota novamente.',
        );
      const note = existing ?? (await this.saveInvoice(tx, dto.nota, user));
      return this.changeCouponTransaction(tx, note.id, user, {
        kind: 'create',
        dto: dto.cupom,
      });
    });
  }

  private async editableCoupon(
    tx: Prisma.TransactionClient,
    coupon: {
      pago: boolean;
      fechamento_id: number | null;
      data_cobranca: Date;
      placa: string;
      semana: string;
    },
    user: AuthUser,
  ) {
    if (coupon.pago || coupon.fechamento_id != null)
      throw new ConflictException(
        'Cupom pago ou fechado não pode ser alterado.',
      );
    await periodForDate(
      tx,
      coupon.data_cobranca,
      coupon.semana,
    );
  }

  save(dto: InvoiceDto, user: AuthUser, id?: number) {
    return this.transaction((tx) => this.saveInvoice(tx, dto, user, id));
  }

  private async saveInvoice(
    tx: Prisma.TransactionClient,
    dto: InvoiceDto,
    user: AuthUser,
    id?: number,
  ) {
    if (id !== undefined) {
      await this.invoice(tx, id, user);
      const coupons = await tx.frete_cupons.findMany({
        where: { nota_id: id, unit: user.unit },
      });
      for (const coupon of coupons) await this.editableCoupon(tx, coupon, user);
    }
    const type = await tx.frete_tipos_nota.findFirst({
      where: { id: dto.tipo_id, unit: user.unit, ativo: true },
    });
    if (!type)
      throw new NotFoundException('Tipo de nota não encontrado ou inativo.');
    if (type.tipo !== 'Debito')
      throw new BadRequestException('Tipo de nota não suportado.');
    const total =
      id === undefined ? new Decimal(0) : await this.totalCoupons(tx, id, user);
    const saldo = new Decimal(dto.valor).minus(total);
    if (saldo.isNegative())
      throw new BadRequestException(
        'O valor da nota não pode ser menor que a soma dos cupons.',
      );
    const data = {
      unit: user.unit,
      numero: dto.numero,
      valor: dto.valor,
      saldo,
      data_nota: new Date(`${dto.data_nota}T00:00:00Z`),
      emitido_em: new Date(`${dto.emitido_em}T00:00:00Z`),
      tipo_id: type.id,
      codigo_tipo: type.codigo,
      nome_tipo: type.nome,
      tipo: type.tipo,
      responsavel_cod: user.cod,
      departamento: dto.departamento?.trim() || null,
    };
    return id === undefined
      ? tx.frete_notas.create({ data })
      : tx.frete_notas.update({ where: { id, unit: user.unit }, data });
  }

  async remove(id: number, user: AuthUser) {
    if (!user.isAdmin && !user.deletionApprovedBy)
      throw new ForbiddenException(
        'Somente administradores podem excluir notas e seus cupons.',
      );
    return this.transaction(async (tx) => {
      await this.invoice(tx, id, user);
      const coupons = await tx.frete_cupons.findMany({
        where: { nota_id: id, unit: user.unit },
      });
      for (const coupon of coupons) await this.editableCoupon(tx, coupon, user);
      const deleted = await tx.frete_cupons.deleteMany({
        where: { nota_id: id, unit: user.unit },
      });
      await tx.frete_notas.delete({ where: { id, unit: user.unit } });
      return { id, deleted: true, deletedCoupons: deleted.count };
    });
  }

  async listCoupons(id: number, user: AuthUser, weekCode?: string) {
    await this.invoice(this.prisma, id, user);
    if (weekCode) await getWeek(this.prisma, weekCode);
    return this.prisma.frete_cupons.findMany({
      where: {
        nota_id: id,
        unit: user.unit,
        ...(weekCode ? { semana: weekCode } : {}),
      },
      orderBy: { id: 'asc' },
    });
  }

  private async totalCoupons(
    tx: Prisma.TransactionClient,
    id: number,
    user: AuthUser,
  ) {
    const result = await tx.frete_cupons.aggregate({
      where: { nota_id: id, unit: user.unit },
      _sum: { valor: true },
    });
    return new Decimal(result._sum.valor ?? 0);
  }

  changeCoupon(
    id: number,
    user: AuthUser,
    change:
      | { kind: 'create'; dto: CouponDto }
      | { kind: 'update'; couponId: number; dto: CouponDto }
      | { kind: 'delete'; couponId: number },
  ) {
    return this.transaction((tx) =>
      this.changeCouponTransaction(tx, id, user, change),
    );
  }

  private async changeCouponTransaction(
    tx: Prisma.TransactionClient,
    id: number,
    user: AuthUser,
    change:
      | { kind: 'create'; dto: CouponDto }
      | { kind: 'update'; couponId: number; dto: CouponDto }
      | { kind: 'delete'; couponId: number },
  ) {
    const note = await this.invoice(tx, id, user);
    if (change.kind !== 'create') {
      const current = await tx.frete_cupons.findFirst({
        where: { id: change.couponId, nota_id: id, unit: user.unit },
      });
      if (!current)
        throw new NotFoundException('Cupom não encontrado nesta nota.');
      await this.editableCoupon(tx, current, user);
    }
    let coupon;
    if (change.kind === 'delete') {
      coupon = await tx.frete_cupons.delete({
        where: { id: change.couponId, nota_id: id, unit: user.unit },
      });
    } else {
      const dto = change.dto;
      const vehicle = await tx.vehicle.findUnique({
        where: { plate: dto.placa },
        select: { plate: true, canceled: true, codVehicleType: true },
      });
      if (!vehicle || vehicle.canceled)
        throw new NotFoundException('Veículo não encontrado ou cancelado.');
      const type = await tx.vehicleType.findUnique({
        where: { codVehicleType: vehicle.codVehicleType },
      });
      const driver = await tx.driver.findUnique({
        where: { cpf: BigInt(dto.cpf_motorista) },
        select: { name: true },
      });
      if (!type || !driver)
        throw new NotFoundException(
          'Tipo de veículo ou motorista não encontrado.',
        );
      const week = await getWeek(tx, dto.semana);
      await periodForDate(
        tx,
        week.data_inicio,
        week.codigo,
      );
      const data = {
        placa: vehicle.plate,
        motorista: driver.name,
        tipo_veiculo: type.typeName,
        semana: week.codigo,
        data_cobranca: week.data_inicio,
        valor: dto.valor,
        descricao: dto.descricao?.trim() || null,
        departamento: dto.departamento?.trim() || null,
        responsavel_cod: user.cod,
      };
      coupon =
        change.kind === 'create'
          ? await tx.frete_cupons.create({
              data: { ...data, unit: user.unit, nota_id: id },
            })
          : await tx.frete_cupons.update({
              where: { id: change.couponId, unit: user.unit, nota_id: id },
              data,
            });
    }
    const saldo = new Decimal(note.valor).minus(
      await this.totalCoupons(tx, id, user),
    );
    if (saldo.isNegative())
      throw new BadRequestException(
        'A soma dos cupons não pode ultrapassar o valor da nota.',
      );
    const updated = await tx.frete_notas.update({
      where: { id, unit: user.unit },
      data: { saldo },
    });
    return { coupon, nota: updated };
  }
}
