import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';

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

    let senhaCorreta = false;
    let senhaJaTemHash = false;

    /*
     * Senhas novas terão hash Argon2.
     * Senhas antigas do sistema ainda podem estar em texto puro.
     */
    if (senhaBanco.startsWith('$argon2')) {
      senhaJaTemHash = true;

      try {
        senhaCorreta = await argon2.verify(senhaBanco, password);
      } catch {
        senhaCorreta = false;
      }
    } else {
      senhaCorreta = senhaBanco === password;
    }

    if (!senhaCorreta) {
      throw new UnauthorizedException('Código ou senha inválidos.');
    }

    /*
     * Migração automática da senha antiga.
     *
     * Se o usuário entrou corretamente usando uma senha que
     * ainda estava em texto puro, transformamos em Argon2.
     */
    if (!senhaJaTemHash) {
      const passwordHash = await argon2.hash(password);

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
