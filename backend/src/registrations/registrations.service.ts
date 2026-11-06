import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth-user.types';
import { hasGlobalFreightAccess } from '../auth/freight-access';
import {
  DriverRegistrationDto,
  UnitRegistrationDto,
  VehicleRegistrationDto,
} from './registration.dto';
import { validDocument } from './document';
@Injectable()
export class RegistrationsService {
  constructor(private readonly db: PrismaService) {}

  private registrationUnit(dto: { unit?: number }, user: AuthUser) {
    if (!user.isAdmin) return user.unit;
    if (!dto.unit) throw new BadRequestException('Informe a unidade de cadastro.');
    return dto.unit;
  }
  companies() {
    return this.db.frete_empresas.findMany({ orderBy: { matriz: 'asc' } });
  }
  async units(user: AuthUser) {
    if (!hasGlobalFreightAccess(user))
      throw new ForbiddenException('Usuário sem acesso global às unidades.');
    try {
      const rows = await this.db.branches.findMany({ orderBy: { unit: 'asc' } });
      return rows.map(row => ({ codigo: row.unit, local: row.branch, dominio: row.dominio }));
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2022') throw error;
      const rows = await this.db.$queryRaw<{ unit: number; branch: string }[]>`
        SELECT unit, branch FROM branches ORDER BY unit
      `;
      return rows.map(row => ({ codigo: row.unit, local: row.branch, dominio: null }));
    }
  }
  async unit(dto: UnitRegistrationDto, user: AuthUser, key?: number) {
    if (!user.isAdmin)
      throw new ForbiddenException('Somente administradores podem alterar unidades.');
    if (key != null && key !== dto.codigo)
      throw new BadRequestException('O código da unidade não pode ser alterado.');
    let existing;
    try {
      existing = await this.db.branches.findUnique({ where: { unit: dto.codigo } });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2022')
        throw new ConflictException('A coluna de domínio ainda não foi preparada no banco.');
      throw error;
    }
    if (key != null && !existing)
      throw new NotFoundException('Unidade não encontrada.');
    if (key == null && existing)
      throw new ConflictException('Código de unidade já cadastrado.');
    return key == null
      ? this.db.branches.create({ data: { unit: dto.codigo, branch: dto.local, dominio: dto.dominio, alterado_por: user.cod } })
      : this.db.branches.update({ where: { unit: key }, data: { branch: dto.local, dominio: dto.dominio, alterado_por: user.cod } });
  }
  types() {
    return this.db.vehicleType.findMany({
      orderBy: { codVehicleType: 'asc' },
      select: { codVehicleType: true, typeName: true },
    });
  }
  async drivers() {
    return (
      await this.db.driver.findMany({
        where: { canceled: false },
        orderBy: { name: 'asc' },
        select: { cpf: true, name: true, unit: true },
      })
    ).map((d) => ({ ...d, cpf: d.cpf.toString().padStart(11, '0') }));
  }
  async removeDriver(value: string, user: AuthUser) {
    const cpf = value.replace(/\D/g, '');
    if (!/^\d{11}$/.test(cpf) || !validDocument(cpf))
      throw new BadRequestException('CPF inválido.');
    const result = await this.db.driver.updateMany({
      where: { cpf: BigInt(cpf), canceled: false },
      data: { canceled: true, user: user.cod, alterado_por: user.cod },
    });
    if (!result.count)
      throw new NotFoundException('Motorista não encontrado ou já desativado.');
    return { cpf, deactivated: true };
  }
  async vehicles() {
    const vehicles = await this.db.vehicle.findMany({
      where: { canceled: false },
      orderBy: { plate: 'asc' },
      select: {
        plate: true,
        codVehicleType: true,
        owner: true,
        owner_name: true,
        empresa_sigla: true,
        driver_cpf: true,
        unit: true,
      },
    });
    const drivers = await this.db.driver.findMany({
      where: {
        canceled: false,
        cpf: { in: vehicles.flatMap(v=>v.driver_cpf ? [BigInt(v.driver_cpf)] : []) },
      },
      select: { cpf:true, name:true },
    });
    const names = new Map(drivers.map(d=>[d.cpf.toString().padStart(11,'0'),d.name]));
    return vehicles.map(v=>({...v, driver_name:v.driver_cpf ? names.get(v.driver_cpf) ?? null : null}));
  }
  async driver(dto: DriverRegistrationDto, user: AuthUser, key?: string) {
    if (!validDocument(dto.cpf)) throw new BadRequestException('CPF inválido.');
    if (key && key !== dto.cpf)
      throw new BadRequestException('O CPF não pode ser alterado.');
    try {
      return await this.db.$transaction(async (tx) => {
        const existing = await tx.driver.findUnique({
          where: { cpf: BigInt(dto.cpf) },
          select: { cpf: true, canceled: true },
        });
        if (key && (!existing || existing.canceled))
          throw new NotFoundException('Motorista não encontrado ou desativado.');
        if (!key && existing)
          throw new ConflictException(
            existing.canceled
              ? 'CPF pertence a um motorista desativado.'
              : 'CPF já cadastrado. Localize o motorista pelo nome para editar.',
          );
        const unit = this.registrationUnit(dto, user);
        const data = {
          name: dto.name,
          unit,
          user: user.cod,
          alterado_por: user.cod,
        };
        const select = { cpf: true, name: true, unit: true };
        const saved = key
          ? await tx.driver.update({ where: { cpf: BigInt(key) }, data, select })
          : await tx.driver.create({ data: { ...data, cpf: BigInt(dto.cpf) }, select });
        return { ...saved, cpf: saved.cpf.toString().padStart(11, '0') };
      });
    } catch (e) {
      if (e.code === 'P2002') throw new ConflictException('CPF já cadastrado.');
      throw e;
    }
  }
  async removeVehicle(value: string, user: AuthUser) {
    const plate = value.trim().toUpperCase();
    if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate))
      throw new BadRequestException('Placa inválida.');
    const result = await this.db.vehicle.updateMany({
      where: { plate, canceled: false },
      data: { canceled: true, user: user.cod, alterado_por: user.cod },
    });
    if (!result.count)
      throw new NotFoundException('Veículo não encontrado ou já excluído.');
    return { plate, excluded: true };
  }
  async vehicle(dto: VehicleRegistrationDto, user: AuthUser, key?: string) {
    if (!validDocument(dto.owner))
      throw new BadRequestException('CPF/CNPJ do proprietário inválido.');
    if (key && key !== dto.plate)
      throw new BadRequestException('A placa não pode ser alterada.');
    try {
      return await this.db.$transaction(async (tx) => {
        if (!dto.owner_is_driver && dto.driver_cpf) {
          const linkedDriver = await tx.driver.findUnique({
            where: { cpf: BigInt(dto.driver_cpf) },
            select: { cpf: true, canceled: true },
          });
          if (!linkedDriver || linkedDriver.canceled)
            throw new BadRequestException('Motorista não cadastrado ou desativado. Selecione um motorista ativo.');
        }
        if (
          !(await tx.frete_empresas.findUnique({
            where: { sigla: dto.empresa_sigla },
          }))
        )
          throw new BadRequestException('Empresa inválida.');
        if (
          !(await tx.vehicleType.findUnique({
            where: { codVehicleType: dto.codVehicleType },
          }))
        )
          throw new BadRequestException('Tipo de veículo inválido.');
        const existing = await tx.vehicle.findUnique({
          where: { plate: dto.plate },
        });
        if (key && (!existing || existing.canceled))
          throw new NotFoundException('Veículo não encontrado ou cancelado.');
        if (!key && existing)
          throw new ConflictException(
            'Placa já cadastrada. Localize o veículo para editar.',
          );
        const owner = await tx.companies.findUnique({
          where: { cnpj: dto.owner },
        });
        if (!owner)
          await tx.companies.create({
            data: { cnpj: dto.owner, fantasy_name: dto.owner_name, alterado_por: user.cod },
          });
        // Registration only: no percentage or historic settlement changes.
        const { owner_is_driver, unit: _dtoUnit, ...registration } = dto;
        if (owner_is_driver) {
          const driver = dto.driver_cpf ? await tx.driver.findUnique({ where: { cpf: BigInt(dto.driver_cpf) }, select: { cpf: true, name: true, canceled: true } }) : null;
          if (!driver || driver.canceled)
            throw new BadRequestException('Proprietário não encontrado nos motoristas. Cadastre o motorista antes de vinculá-lo.');
          const normalize = (name: string) => name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
          if (normalize(driver.name) !== normalize(dto.owner_name))
            throw new BadRequestException('Selecione o motorista com o nome do proprietário.');
        }
        const unit = this.registrationUnit(dto, user);
        const data = { ...registration, unit, user: user.cod, alterado_por: user.cod,
          first_payer: dto.empresa_sigla, second_payer: null, second_payer_percent: 0 };
        return key
          ? tx.vehicle.update({ where: { plate: key }, data })
          : tx.vehicle.create({ data });
      });
    } catch (e) {
      if (e.code === 'P2002')
        throw new ConflictException(
          'Placa já cadastrada. Localize o veículo para editar.',
        );
      throw e;
    }
  }
}
