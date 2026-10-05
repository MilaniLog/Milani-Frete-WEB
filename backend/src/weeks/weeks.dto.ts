import { IsDateString, IsOptional, Matches } from 'class-validator';

export class WeekDto {
  @Matches(/^\d{4}$/)
  codigo: string;

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  data_inicio: string;

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  data_fim: string;
}

export class WeekFilterDto {
  @IsOptional()
  @Matches(/^\d{4}$/)
  week?: string;
}

export class WeekQueryDto {
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
}
