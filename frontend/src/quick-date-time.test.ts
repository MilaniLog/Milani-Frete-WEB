import { expect, it } from 'vitest';
import { formatQuickTime, parseQuickDate } from './quick-date-time';
it('aceita horário digitado com ou sem separador',()=>{
  expect(formatQuickTime('1212')).toBe('12:12');
  expect(formatQuickTime('0000')).toBe('00:00');
  expect(formatQuickTime('23:59')).toBe('23:59');
  for(const value of ['2400','1260','123','ab:cd']) expect(formatQuickTime(value)).toBeNull();
});
it('aceita os dois comprimentos de ano e valida o calendário',()=>{
  for(const value of ['121226','12122026','12/12/26','12/12/2026','2026-12-12']) expect(parseQuickDate(value)).toEqual({display:'12/12/2026',iso:'2026-12-12'});
  expect(parseQuickDate('290224')?.display).toBe('29/02/2024');
  for(const value of ['290226','310426','001226','121326','12122','12/122026']) expect(parseQuickDate(value)).toBeNull();
});
