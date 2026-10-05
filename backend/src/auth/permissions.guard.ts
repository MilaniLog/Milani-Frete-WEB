import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { Reflector } from '@nestjs/core';

import { PrismaService } from '../prisma/prisma.service';

import { PERMISSION_KEY } from './require-permission.decorator';

import { PermissionKey } from './permission.types';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.getAllAndOverride<PermissionKey>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    /*
     * Se a rota não exigir nenhuma permissão específica,
     * deixa passar.
     */
    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Usuário não autenticado.');
    }

    // Freight pages are available to every authenticated user. Administrative
    // mutations (weeks, expense catalog, cancellations) retain service checks.
    if (requiredPermission === 'freight_service' || requiredPermission === 'freight_closure') {
      return true;
    }

    /*
     * Administrador passa pela verificação de serviço.
     */
    if (user.isAdmin) {
      return true;
    }

    const permission = await this.prisma.user_permissions.findFirst({
      where: {
        cod_user: user.cod,
        unit: user.unit,
      },
    });

    if (!permission) {
      throw new ForbiddenException('Usuário sem permissões para esta unidade.');
    }

    if (!permission[requiredPermission]) {
      throw new ForbiddenException(
        'Usuário sem permissão para acessar este serviço.',
      );
    }

    return true;
  }
}
