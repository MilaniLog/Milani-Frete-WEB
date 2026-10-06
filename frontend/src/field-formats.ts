export const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
export const normalizePlate = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
export const normalizeWeek = (value: string) => digits(value).slice(0, 4);

export function maskCiot(value: string): string {
  const raw = String(value ?? '').toUpperCase().replace(/[^0-9X]/g, '').slice(0, 16);
  return raw.length > 12 ? `${raw.slice(0, 12)}/${raw.slice(12)}` : raw;
}
export function formatCtrb(value: string): string {
  const raw = digits(value).slice(0, 7);
  return raw.length > 6 ? `${raw.slice(0, 6)}-${raw.slice(6)}` : raw;
}
export function formatCiot(value: string): string | null {
  const compact = value.trim().toUpperCase().replace(/\s/g, '');
  if (!compact) return '';
  const match = compact.match(/^(\d{12})\/?([\dX]{0,4})$/);
  return match ? `${match[1]}/${match[2].padEnd(4, 'X')}` : null;
}
export function formatDocument(value: unknown, kind: 'cpf' | 'document' = 'document') {
  const raw = digits(value).slice(0, kind === 'cpf' ? 11 : 14);
  const sizes = kind === 'cpf' || raw.length <= 11 ? [3, 3, 3, 2] : [2, 3, 3, 4, 2];
  const separators = sizes.length === 4 ? ['.', '.', '-'] : ['.', '.', '/', '-'];
  let position = 0;
  return sizes.map((size, i) => {
    const part = raw.slice(position, position + size); position += size;
    return part ? (i ? separators[i - 1] : '') + part : '';
  }).join('');
}
