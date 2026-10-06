/** VBA PadWithZeros(..., 7): six digits plus the final digit, after the unit. */
export function formatManifestNumber(value: string): string | null {
  const text = value.trim();
  const match = /^(\d{3})(\d{1,7}|\d{1,6}-\d)$/.exec(text);
  if (!match) return null;
  const number = match[2].replace('-', '').padStart(7, '0');
  return `${match[1]}${number.slice(0,6)}-${number.slice(6)}`;
}

export function comparableManifestNumber(value: string): string {
  return value.replace(/\D/g, '');
}
