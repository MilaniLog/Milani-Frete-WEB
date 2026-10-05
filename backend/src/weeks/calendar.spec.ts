import { calendarYear } from './calendar';

describe('Calendário operacional de domingo a sábado', () => {
  it('reproduz o exemplo informado e a semana 53 do Excel', () => {
    const weeks = calendarYear(2026);
    expect(weeks).toHaveLength(53);
    expect(weeks.find((week) => week.codigo === '3926')).toEqual({
      codigo: '3926',
      data_inicio: new Date('2026-09-20T00:00:00Z'),
      data_fim: new Date('2026-09-26T00:00:00Z'),
    });
    expect(weeks.slice(-1)[0]).toEqual({
      codigo: '5326',
      data_inicio: new Date('2026-12-27T00:00:00Z'),
      data_fim: new Date('2027-01-02T00:00:00Z'),
    });
  });
  it('gera 2026 e 2027 sem lacunas, duplicatas ou sobreposição na virada', () => {
    const next = calendarYear(2027);
    expect(next).toHaveLength(52);
    expect(next[0].data_inicio.toISOString().slice(0, 10)).toBe('2027-01-03');
    expect(next.slice(-1)[0]?.data_fim.toISOString().slice(0, 10)).toBe(
      '2028-01-01',
    );
    const weeks = [...calendarYear(2026), ...next];
    expect(new Set(weeks.map((week) => week.codigo)).size).toBe(105);
    weeks.forEach((week, index) => {
      expect(week.data_inicio.getUTCDay()).toBe(0);
      expect(week.data_fim.getUTCDay()).toBe(6);
      expect(week.data_fim.getTime() - week.data_inicio.getTime()).toBe(
        6 * 86400000,
      );
      if (index)
        expect(
          week.data_inicio.getTime() - weeks[index - 1].data_fim.getTime(),
        ).toBe(86400000);
    });
  });
});
