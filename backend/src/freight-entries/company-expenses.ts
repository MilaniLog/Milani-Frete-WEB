import { BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';

// Regra CalcLaunchBalance do VBA, compartilhada pelos dois fluxos de edição.
export function companyExpenses(
  entries: { tipo_despesa: string; valor: Decimal.Value }[],
): number {
  let total = new Decimal(0);
  for (const entry of entries) {
    switch (entry.tipo_despesa.trim().toLowerCase()) {
      case 'credito':
        total = total.plus(entry.valor);
        break;
      case 'debito':
      case 'adiantamento':
        break;
      default:
        throw new BadRequestException('Tipo de despesa inválido.');
    }
  }
  return total.toNumber();
}
