export function formatQuickTime(value: string): string | null {
  const match = /^(\d{2}):?(\d{2})$/.exec(value.trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return `${match[1]}:${match[2]}`;
}
export function parseQuickDate(value: string): { display: string; iso: string } | null {
  const text = value.trim();
  let day: string, month: string, year: string;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const local = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(text);
  if (iso) [, year, month, day] = iso;
  else if (local) [, day, month, year] = local;
  else if (/^(\d{6}|\d{8})$/.test(text)) {
    day = text.slice(0,2); month = text.slice(2,4); year = text.slice(4);
  } else return null;
  if (year.length === 2) year = `20${year}`;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (Number(year) < 1000 || !Number.isFinite(date.getTime()) || date.getUTCFullYear() !== Number(year) || date.getUTCMonth()+1 !== Number(month) || date.getUTCDate() !== Number(day)) return null;
  return { display:`${day}/${month}/${year}`, iso:`${year}-${month}-${day}` };
}
