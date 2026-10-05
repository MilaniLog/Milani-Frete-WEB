import { expect, it } from 'vitest';
import { formatCiot } from './field-formats';
it('formata CIOT com barra e completa posições finais ausentes', () => {
  expect(formatCiot('5200277244837189')).toBe('520027724483/7189');
  expect(formatCiot('520027724483/7189')).toBe('520027724483/7189');
  expect(formatCiot('520027724483')).toBe('520027724483/XXXX');
  expect(formatCiot('520027724483/71')).toBe('520027724483/71XX');
  expect(formatCiot('520027724483/xxxx')).toBe('520027724483/XXXX');
  expect(formatCiot('')).toBe('');
  expect(formatCiot('52002772448')).toBeNull();
  expect(formatCiot('520027724483/71890')).toBeNull();
});
