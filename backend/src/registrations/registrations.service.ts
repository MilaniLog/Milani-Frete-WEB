import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth-user.types';
import {
  DriverRegistrationDto,
  VehicleRegistrationDto,
} from './registration.dto';
import { validDocument } from './document';
@Injectable()
export class RegistrationsService {
  constructor(private readonly db: PrismaService) {}
  companies() {
    return this.db.frete_empresas.findMany({ orderBy: { matriz: 'asc' } });
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
        orderBy: { name: 'asc' },
        select: { cpf: true, name: true },
      })
    ).map((d) => ({ ...d, cpf: d.cpf.toString().padStart(11, '0') }));
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
      },
    });
    const drivers = await this.db.driver.findMany({
      where: { cpf: { in: vehicles.flatMap(v=>v.driver_cpf ? [BigInt(v.driver_cpf)] : []) } },
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
          select: { cpf: true },
        });
        if (key && !existing)
          throw new NotFoundException('Motorista não encontrado.');
        if (!key && existing)
          throw new ConflictException(
            'CPF já cadastrado. Localize o motorista pelo nome para editar.',
          );
        const data = {
          name: dto.name,
          user: user.cod,
        };
        const select = { cpf: true, name: true };
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
      data: { canceled: true, user: user.cod },
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
        if (!dto.owner_is_driver && dto.driver_cpf && !(await tx.driver.findUnique({where:{cpf:BigInt(dto.driver_cpf)},select:{cpf:true}})))
          throw new BadRequestException('Motorista não cadastrado. Selecione um motorista da lista.');
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
            data: { cnpj: dto.owner, fantasy_name: dto.owner_name },
          });
        // Registration only: no percentage or historic settlement changes.
        const { owner_is_driver, ...registration } = dto;
        if (owner_is_driver) {
          const driver = dto.driver_cpf ? await tx.driver.findUnique({ where: { cpf: BigInt(dto.driver_cpf) }, select: { cpf: true, name: true } }) : null;
          if (!driver)
            throw new BadRequestException('Proprietário não encontrado nos motoristas. Cadastre o motorista antes de vinculá-lo.');
          const normalize = (name: string) => name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
          if (normalize(driver.name) !== normalize(dto.owner_name))
            throw new BadRequestException('Selecione o motorista com o nome do proprietário.');
        }
        const data = { ...registration, user: user.cod,
          first_payer: dto.empresa_sigla, second_payer: null, second_payer_percent: 0 };
        return key
          ? tx.vehicle.update({ where: { plate: key }, data })
          : tx.vehicle.create({ data });
      });
    } catch (e) {
      if (e.code === 'P2002')
        throw new ConflictException(
          'Placa ou nome do proprietário já cadastrado. Confira os dados.',
        );
      throw e;
    }
  }
}
