import { ConflictException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';

type Payers = {
  first_payer: string | null;
  second_payer: string | null;
  second_payer_percent: Decimal;
};

export function allocatePayment(
  balance: Decimal,
  vehicle: Payers,
  identifiers: (string | null)[],
) {
  const first = vehicle.first_payer?.trim() || null;
  const second = vehicle.second_payer?.trim() || null;
  const percent = new Decimal(vehicle.second_payer_percent);
  if (!percent.isFinite() || percent.lt(0) || percent.gt(1))
    throw new ConflictException(
      'Percentual da segunda pagadora deve estar entre 0 e 1.',
    );
  if (
    (second && !first) ||
    (!second && !percent.isZero()) ||
    (first && first === second)
  )
    throw new ConflictException(
      'Cadastro das empresas pagadoras inconsistente.',
    );
  // Preserve identifiers as text, including leading zeros and punctuation.
  const ctrbs = identifiers
    .map((value) => value?.trim())
    .filter((value): value is string => !!value);
  const total = balance.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
  const split = total.gt(1000) && !!second && ctrbs.length === 0;
  const secondValue = split
    ? total.mul(percent).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN)
    : new Decimal(0);
  return {
    criterio: ctrbs.length ? 'CTRB' : split ? 'RATEIO' : 'INTEGRAL',
    ctrbs,
    percentual_segunda_cadastrado: percent,
    primeira: { empresa: first, valor: total.minus(secondValue) },
    segunda: { empresa: second, valor: secondValue },
  };
}
