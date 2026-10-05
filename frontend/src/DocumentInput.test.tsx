// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import DocumentInput from './DocumentInput';
import { formatDocument, normalizePlate, normalizeWeek } from './field-formats';
afterEach(cleanup);
it('formata CPF com zeros iniciais e envia somente dígitos', () => {
  render(<form><label>CPF<DocumentInput kind="cpf" name="cpf" required /></label></form>);
  const input = screen.getByLabelText('CPF') as HTMLInputElement;
  fireEvent.change(input, { target: { value: '001.234.567-89' } });
  expect(input.value).toBe('001.234.567-89');
  expect(input.checkValidity()).toBe(true);
  expect(new FormData(input.form!).get('cpf')).toBe('00123456789');
  fireEvent.change(input, { target: { value: '123' } });
  expect(input.checkValidity()).toBe(false);
});
it('alterna CPF/CNPJ, aceita colar documento e permite limpar', () => {
  render(<form><label>Documento<DocumentInput name="owner" required /></label></form>);
  const input = screen.getByLabelText('Documento') as HTMLInputElement;
  fireEvent.change(input, { target: { value: '11.222.333/0001-81' } });
  expect(input.value).toBe('11.222.333/0001-81');
  expect(input.checkValidity()).toBe(true);
  expect(new FormData(input.form!).get('owner')).toBe('11222333000181');
  fireEvent.change(input, { target: { value: '52998224725' } });
  expect(input.value).toBe('529.982.247-25');
  fireEvent.change(input, { target: { value: '' } });
  expect(new FormData(input.form!).get('owner')).toBe('');
});
it('padroniza placa antiga, Mercosul e código da semana', () => {
  expect(normalizePlate('abc-1234')).toBe('ABC1234');
  expect(normalizePlate('abc1d23')).toBe('ABC1D23');
  expect(normalizeWeek('39a26')).toBe('3926');
  expect(formatDocument('')).toBe('');
});
