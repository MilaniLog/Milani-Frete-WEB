import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { verifyPassword } from './passwords';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DeletionAuthorizationService {
  private readonly failures = new Map<number, { count: number; until: number }>();
  private readonly logger = new Logger(DeletionAuthorizationService.name);
  constructor(private readonly db: PrismaService) {}

  async authorize(request: any) {
    if (request.method !== 'DELETE') return;
    const credentials = request.body?.admin_authorization;
    if (request.body) delete request.body.admin_authorization;
    delete request.user.deletionApprovedBy;
    const actor = await this.db.employees.findUnique({ where: { cod: request.user.cod }, select: { id: true, isAdmin: true } });
    if (!actor || actor.id !== request.user.sub) throw new ForbiddenException('Usuário não autorizado.');
    request.user.isAdmin = Boolean(actor.isAdmin);
    if (actor.isAdmin) return;
    const deny = (message: string) => new ForbiddenException({ code: 'ADMIN_APPROVAL_REQUIRED', message });
    if (!credentials) throw deny('Esta exclusão precisa da autorização de um administrador.');
    const previous = this.failures.get(request.user.cod);
    if (previous && previous.until > Date.now() && previous.count >= 5)
      throw new ForbiddenException('Muitas tentativas de autorização. Aguarde dez minutos.');
    const cod = Number(credentials.cod), password = credentials.password;
    let valid = false;
    if (Number.isSafeInteger(cod) && cod > 0 && typeof password === 'string' && password.length > 0 && password.length <= 256) {
      const admin = await this.db.employees.findUnique({ where: { cod }, select: { isAdmin: true, password: true } });
      if (admin?.isAdmin && admin.password) {
        valid = await verifyPassword(admin.password, password).catch(() => false);
      }
    }
    if (!valid) {
      for (const [key, value] of this.failures) if (value.until <= Date.now()) this.failures.delete(key);
      this.failures.set(request.user.cod, { count: previous && previous.until > Date.now() ? previous.count + 1 : 1, until: previous && previous.until > Date.now() ? previous.until : Date.now() + 600000 });
      throw deny('Código ou senha de administrador inválidos.');
    }
    this.failures.delete(request.user.cod);
    request.user.deletionApprovedBy = cod;
    this.logger.log(`Exclusão autorizada: operador ${request.user.cod}, administrador ${cod}, unidade ${request.user.unit}, rota ${request.path}`);
  }
}
