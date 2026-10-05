import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/client';
import type { AuthUser } from '../auth/auth-user.types';
import { VehiclePayersDto } from './vehicle-payers.dto';
import { allocatePayment } from '../freight-closures/payment-allocation';

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async updatePayers(plate: string, dto: VehiclePayersDto, user: AuthUser) {
    if (!user.isAdmin)
      throw new ForbiddenException(
        'Somente administrador pode alterar pagadoras no cadastro compartilhado.',
      );
    const normalizedPlate = plate.trim().toUpperCase();
    if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizedPlate))
      throw new BadRequestException(
        'Placa inválida. Informe a placa sem hífen.',
      );
    const data = {
      first_payer: dto.first_payer.trim() || null,
      second_payer: dto.second_payer.trim() || null,
      second_payer_percent: new Decimal(dto.second_payer_percent),
    };
    // Apply the same consistency rules used by settlement previews.
    allocatePayment(new Decimal(0), data, []);
    try {
      return await this.prisma.vehicle.update({
        where: { plate: normalizedPlate, canceled: false },
        data,
        select: {
          plate: true,
          first_payer: true,
          second_payer: true,
          second_payer_percent: true,
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2025')
        throw new NotFoundException('Veículo não encontrado ou cancelado.');
      throw error;
    }
  }

  async findByPlate(plate: string) {
    const normalizedPlate = plate.trim().toUpperCase();

    /*
     * Aceita:
     * ABC1234  - padrão antigo sem hífen
     * ABC1D23  - padrão Mercosul
     *
     * Não aceita:
     * ABC-1234
     */
    const validPlate = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizedPlate);

    if (!validPlate) {
      throw new BadRequestException(
        'Placa inválida. Informe a placa sem hífen.',
      );
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: {
        plate: normalizedPlate,
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Veículo não encontrado.');
    }

    if (vehicle.canceled) {
      throw new NotFoundException('Veículo cancelado.');
    }

    const vehicleType = await this.prisma.vehicleType.findUnique({
      where: {
        codVehicleType: vehicle.codVehicleType,
      },
    });

    if (!vehicleType) {
      throw new NotFoundException('Tipo de veículo não encontrado.');
    }

    return {
      plate: vehicle.plate,
      owner: vehicle.owner,

      first_payer: vehicle.first_payer,
      second_payer: vehicle.second_payer,
      second_payer_percent: vehicle.second_payer_percent,

      vehicleType: {
        codVehicleType: vehicleType.codVehicleType,

        typeName: vehicleType.typeName,

        max_m3: vehicleType.max_m3,

        max_weight: vehicleType.max_weight,

        freight_value: vehicleType.freight_value,

        category: vehicleType.codVehicleType < 100 ? 'AGREGADO' : 'ESPORADICO',
      },
    };
  }
}
