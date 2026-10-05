import { Decimal } from '@prisma/client/runtime/client';
import { allocatePayment } from './payment-allocation';

describe('Rateio entre pagadoras', () => {
  const vehicle = {
    first_payer: 'A',
    second_payer: 'B',
    second_payer_percent: new Decimal('0.3'),
  };
  it.each([
    ['1000', '1000', '0'],
    ['1000.01', '700.01', '300'],
    ['2000', '1400', '600'],
    ['0', '0', '0'],
    ['-50', '-50', '0'],
  ])('distribui saldo %s em %s e %s', (balance, first, second) => {
    const result = allocatePayment(new Decimal(balance), vehicle, []);
    expect(result.primeira.valor.toString()).toBe(first);
    expect(result.segunda.valor.toString()).toBe(second);
    expect(result.primeira.valor.plus(result.segunda.valor).toString()).toBe(
      new Decimal(balance).toString(),
    );
  });
  it('CTRB textual impede rateio sem ser tratado como dinheiro', () => {
    const result = allocatePayment(new Decimal(2000), vehicle, [
      ' 00123-4 ',
      null,
    ]);
    expect(result.criterio).toBe('CTRB');
    expect(result.ctrbs).toEqual(['00123-4']);
    expect(result.primeira.valor.toString()).toBe('2000');
    expect(result.segunda.valor.toString()).toBe('0');
  });
  it('preserva soma em caso de meio centavo', () => {
    const result = allocatePayment(
      new Decimal('1000.01'),
      { ...vehicle, second_payer_percent: new Decimal('.5') },
      [],
    );
    expect(result.primeira.valor.toString()).toBe('500.01');
    expect(result.segunda.valor.toString()).toBe('500');
  });
  it('sem pagadora cadastrada mantém saldo integral sem inventar empresa', () => {
    const result = allocatePayment(
      new Decimal(2000),
      {
        first_payer: null,
        second_payer: null,
        second_payer_percent: new Decimal(0),
      },
      [],
    );
    expect(result.primeira.empresa).toBeNull();
    expect(result.primeira.valor.toString()).toBe('2000');
  });
  it.each(['-0.01', '1.01', '30'])(
    'rejeita percentual inválido %s',
    (value) => {
      expect(() =>
        allocatePayment(
          new Decimal(2000),
          { ...vehicle, second_payer_percent: new Decimal(value) },
          [],
        ),
      ).toThrow();
    },
  );
  it.each([
    { first_payer: null },
    { second_payer: null },
    { second_payer: 'A' },
  ])('rejeita cadastro inconsistente %j', (change) => {
    expect(() =>
      allocatePayment(new Decimal(2000), { ...vehicle, ...change }, []),
    ).toThrow();
  });
});
