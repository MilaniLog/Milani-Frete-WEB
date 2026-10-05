import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Decimal } from '@prisma/client/runtime/client';

import { PrismaService } from '../prisma/prisma.service';

import { CalculateFreightDto } from './dto/calculate-freight.dto';

@Injectable()
export class FreightCalculationService {
  constructor(private readonly prisma: PrismaService) {}

  private money(value: number) {
    return Math.round((value + Number.EPSILON) * 10000) / 10000;
  }

  private percent(value: number) {
    return Math.round((value + Number.EPSILON) * 100000000) / 100000000;
  }

  async calculate(
    dto: CalculateFreightDto,
    database: Pick<PrismaService, 'frete_regras_calculo'> = this.prisma,
  ) {
    const origem = dto.origem?.trim().toUpperCase() || 'SP';

    const rules = await database.frete_regras_calculo.findMany({
      where: {
        origem,
        ativo: true,

        codigo_frete: {
          in: [777, 888, 999],
        },
      },
    });

    const rule777 = rules.find((rule) => rule.codigo_frete === 777);

    const rule888 = rules.find((rule) => rule.codigo_frete === 888);

    const rule999 = rules.find((rule) => rule.codigo_frete === 999);

    if (!rule777) {
      throw new NotFoundException(`Regra 777 não cadastrada para ${origem}.`);
    }

    if (!rule888) {
      throw new NotFoundException(`Regra 888 não cadastrada para ${origem}.`);
    }

    if (!rule999) {
      throw new NotFoundException(`Regra 999 não cadastrada para ${origem}.`);
    }

    const icms = this.calculateMode(dto, origem, [
      (value) => value * (1 - Number(rule777.aliquota)),
      (value) => value * (1 - Number(rule888.aliquota)),
      (value) => value * (1 - Number(rule999.aliquota)),
    ]);

    // CalcFreight777/888/999: Round(valor * percentual, 2).
    // Decimal evita que erros bin?rios mudem o desempate para o par.
    const percentage = (rate: typeof rule777.percentual) => (value: number) =>
      new Decimal(value)
        .mul(rate.toString())
        .toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN)
        .toNumber();
    const percentageCalculation = this.calculateMode(dto, origem, [
      percentage(rule777.percentual),
      percentage(rule888.percentual),
      percentage(rule999.percentual),
    ]);

    // Preserva o contrato existente; o segundo modo ? um campo adicional.
    return { ...icms, percentageCalculation };
  }

  private calculateMode(
    dto: CalculateFreightDto,
    origem: string,
    calculators: [
      (value: number) => number,
      (value: number) => number,
      (value: number) => number,
    ],
  ) {
    const [calc777Fn, calc888Fn, calc999Fn] = calculators;
    const calc777 = calc777Fn(dto.cod_777_00 ?? 0);
    const calc888 = calc888Fn(dto.cod_888_00 ?? 0);
    const calc999 = calc999Fn(dto.cod_999_00 ?? 0);
    const calcNot777 = calc777Fn(dto.nao_777 ?? 0);
    const calcNot888 = calc888Fn(dto.nao_888 ?? 0);
    const calcNot999 = calc999Fn(dto.nao_999 ?? 0);

    // ========================================================
    // FRETES DE ENTREGA
    // ========================================================

    const totalFretes = calc777 + calc888 + calc999;

    // ========================================================
    // ADICIONAIS A RECEBER
    // ========================================================

    const totalReceive =
      totalFretes +
      (dto.escada ?? 0) +
      (dto.outros ?? 0) +
      (dto.paletizacao ?? 0) +
      (dto.tde ?? 0) +
      (dto.diaria ?? 0) +
      (dto.estadia ?? 0) +
      (dto.descarga ?? 0);

    // ========================================================
    // NÃO ENTREGA = DESCONTOS
    // ========================================================

    const discounts = calcNot777 + calcNot888 + calcNot999;

    // ========================================================
    // VALOR QUE A EMPRESA PAGARÁ AO VEÍCULO
    //
    // VBA:
    // toPay = FreightValue + TotalSpendCompany
    // ========================================================

    const totalPay = dto.frete_veiculo + (dto.despesas_empresa ?? 0);

    // ========================================================
    // SEM FRETE 777 / 888 / 999 NÃO HÁ PERCENTUAL
    // ========================================================

    if (totalReceive === 0 || totalFretes === 0) {
      return {
        origem,

        freightsCalculated: {
          freight777: this.money(calc777),
          freight888: this.money(calc888),
          freight999: this.money(calc999),

          notDelivery777: this.money(calcNot777),

          notDelivery888: this.money(calcNot888),

          notDelivery999: this.money(calcNot999),
        },

        totalFretes: this.money(totalFretes),

        totalReceive: this.money(totalReceive),

        discounts: this.money(discounts),

        totalPay: this.money(totalPay),

        initPercent: 0,

        finalPercent: 0,

        freightVehicle: this.money(totalPay),
      };
    }

    const baseFinal = totalReceive - discounts;

    if (baseFinal === 0) {
      throw new BadRequestException(
        'Não é possível calcular o percentual final porque o total após os descontos é zero.',
      );
    }

    // ========================================================
    // VBA:
    //
    // InitPercent =
    // FreightValue /
    // (calc777 + calc888 + calc999)
    //
    // FinalPercent =
    // toPay /
    // (ToReceive - discounts)
    // ========================================================

    const initPercent = dto.frete_veiculo / totalFretes;

    const finalPercent = totalPay / baseFinal;

    return {
      origem,

      freightsCalculated: {
        freight777: this.money(calc777),

        freight888: this.money(calc888),

        freight999: this.money(calc999),

        notDelivery777: this.money(calcNot777),

        notDelivery888: this.money(calcNot888),

        notDelivery999: this.money(calcNot999),
      },

      totalFretes: this.money(totalFretes),

      totalReceive: this.money(totalReceive),

      discounts: this.money(discounts),

      totalPay: this.money(totalPay),

      initPercent: this.percent(initPercent),

      finalPercent: this.percent(finalPercent),

      freightVehicle: this.money(totalPay),
    };
  }
}
