import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hashPassword, isPasswordHash, verifyPassword } from './passwords';

import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const cod = Number(loginDto.cod);
    const password = String(loginDto.password ?? '');

    if (!cod || !password) {
      throw new UnauthorizedException('Código e senha são obrigatórios.');
    }

    const user = await this.prisma.employees.findUnique({
      where: {
        cod,
      },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('Código ou senha inválidos.');
    }

    const senhaBanco = user.password;
    const senhaCorreta = await verifyPassword(senhaBanco, password);
    const senhaJaTemHash = isPasswordHash(senhaBanco);

    if (!senhaCorreta) {
      throw new UnauthorizedException('C?digo ou senha inv?lidos.');
    }

    /*
     * Migra??o autom?tica da senha antiga.
     *
     * Se o usu?rio entrou corretamente usando uma senha que
     * ainda estava em texto puro, transformamos em hash port?til.
     */
    if (!senhaJaTemHash) {
      const passwordHash = await hashPassword(password);

      await this.prisma.employees.update({
        where: {
          cod: user.cod,
        },

        data: {
          password: passwordHash,
        },
      });
    }

    /*
     * Um usuário pode possuir permissões em mais de uma unidade.
     */
    const permissions = await this.prisma.user_permissions.findMany({
      where: {
        cod_user: user.cod,
      },

      orderBy: {
        unit: 'asc',
      },

      select: {
        unit: true,
        is_admin: true,
        stock_service: true,
        ticket_service: true,
        freight_service: true,
        freight_closure: true,
      },
    });

    const payload = {
      sub: user.id,
      cod: user.cod,
      unit: user.unit,
      isAdmin: user.isAdmin,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      user: {
        id: user.id,
        cod: user.cod,
        name: user.Name,
        unit: user.unit,
        isAdmin: user.isAdmin,
      },

      permissions,

      accessToken,
    };
  }
}
