import { expect, it } from 'vitest';
import { formatManifestNumber } from './manifest-number';
it('separa unidade, completa seis posições e preserva o último dígito', () => {
  expect(formatManifestNumber('8503182')).toBe('850000318-2');
  expect(formatManifestNumber('100483168')).toBe('100048316-8');
  expect(formatManifestNumber('850318-2')).toBe('850000318-2');
  expect(formatManifestNumber('850000318-2')).toBe('850000318-2');
  expect(formatManifestNumber('0011')).toBe('001000000-1');
});
it('não corta dígitos nem aceita identificadores incompletos', () => {
  for (const value of ['', '850', 'ABC1234', '85012345678', '85012-34']) expect(formatManifestNumber(value)).toBeNull();
});
