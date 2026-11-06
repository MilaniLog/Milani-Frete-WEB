import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.types';
import { hashPassword } from '../auth/passwords';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './users.dto';

@Injectable()
export class UsersService {
  constructor(private readonly db: PrismaService) {}

  private admin(user: AuthUser) {
    if (!user.isAdmin)
      throw new ForbiddenException('Somente administradores podem acessar usuários.');
  }

  list(user: AuthUser) {
    this.admin(user);
    return this.db.employees.findMany({
      orderBy: { cod: 'asc' },
      select: {
        id: true,
        cod: true,
        Name: true,
        unit: true,
        isAdmin: true,
        freight_profile: true,
      },
    });
  }

  async create(dto: CreateUserDto, user: AuthUser) {
    this.admin(user);
    const name = dto.name.trim();
    const existing = await this.db.employees.findUnique({ where: { cod: dto.cod } });
    if (existing) throw new ConflictException('Código de usuário já cadastrado.');
    const unit = await this.db.branches.findUnique({ where: { unit: dto.unit } });
    if (!unit) throw new NotFoundException('Unidade não encontrada.');
    const password = await hashPassword(dto.password);
    return this.db.$transaction(async (tx) => {
      const created = await tx.employees.create({
        data: {
          cod: dto.cod,
          Name: name,
          password,
          unit: dto.unit,
          isAdmin: dto.isAdmin,
          freight_profile: dto.freightProfile,
          alterado_por: user.cod,
        },
        select: {
          id: true,
          cod: true,
          Name: true,
          unit: true,
          isAdmin: true,
          freight_profile: true,
        },
      });
      await tx.user_permissions.create({
        data: {
          cod_user: dto.cod,
          unit: dto.unit,
          is_admin: dto.isAdmin,
          freight_service: true,
          freight_closure: true,
          stock_service: false,
          ticket_service: false,
          alterado_por: user.cod,
        },
      });
      return created;
    });
  }

  async update(cod: number, dto: UpdateUserDto, user: AuthUser) {
    this.admin(user);
    const existing = await this.db.employees.findUnique({ where: { cod } });
    if (!existing) throw new NotFoundException('Usuário não encontrado.');
    const unit = await this.db.branches.findUnique({ where: { unit: dto.unit } });
    if (!unit) throw new NotFoundException('Unidade não encontrada.');
    const password = dto.password ? await hashPassword(dto.password) : undefined;
    return this.db.$transaction(async (tx) => {
      const updated = await tx.employees.update({
        where: { cod },
        data: {
          Name: dto.name.trim(),
          unit: dto.unit,
          isAdmin: dto.isAdmin,
          freight_profile: dto.freightProfile,
          alterado_por: user.cod,
          ...(password ? { password } : {}),
        },
        select: {
          id: true,
          cod: true,
          Name: true,
          unit: true,
          isAdmin: true,
          freight_profile: true,
        },
      });
      await tx.user_permissions.updateMany({
        where: { cod_user: cod },
        data: { is_admin: dto.isAdmin, alterado_por: user.cod },
      });
      const currentPermission = await tx.user_permissions.findFirst({
        where: { cod_user: cod, unit: dto.unit },
      });
      if (!currentPermission) {
        await tx.user_permissions.create({
          data: {
            cod_user: cod,
            unit: dto.unit,
            is_admin: dto.isAdmin,
            freight_service: true,
            freight_closure: true,
            stock_service: false,
            ticket_service: false,
            alterado_por: user.cod,
          },
        });
      }
      return updated;
    });
  }
}
