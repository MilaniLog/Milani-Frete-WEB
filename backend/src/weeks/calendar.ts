const DAY = 86400000;

// The operational week is Sunday–Saturday. Its number follows the Monday
// within that interval: 3926 = 2026-09-20 through 2026-09-26.
function firstSunday(year: number): Date {
  const january4 = new Date(Date.UTC(year, 0, 4));
  const daysAfterMonday = (january4.getUTCDay() + 6) % 7;
  return new Date(january4.getTime() - (daysAfterMonday + 1) * DAY);
}

export function calendarYear(year: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2099)
    throw new Error('Informe um ano entre 2000 e 2099.');
  const first = firstSunday(year);
  const next = firstSunday(year + 1);
  const weeks: { codigo: string; data_inicio: Date; data_fim: Date }[] = [];
  for (
    let time = first.getTime(), number = 1;
    time < next.getTime();
    time += 7 * DAY, number++
  ) {
    weeks.push({
      codigo: `${String(number).padStart(2, '0')}${String(year).slice(-2)}`,
      data_inicio: new Date(time),
      data_fim: new Date(time + 6 * DAY),
    });
  }
  return weeks;
}
