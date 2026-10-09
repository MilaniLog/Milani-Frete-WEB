import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  Matches,
  IsDateString,
  IsIn,
  IsString,
  MaxLength,
} from 'class-validator';
export class ReportQuery {
  @IsOptional() @Type(() => Number) @IsInt() unit?: number;
  @IsOptional() @Matches(/^\d{4}$/) semana?: string;
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  inicio?: string;
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fim?: string;
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/)
  placa?: string;
  @IsOptional() @IsString() @MaxLength(30) departamento?: string;
  @IsOptional() @Matches(/^\d{1,9}$/) usuario?: string;
  @IsOptional() @IsString() @MaxLength(30) empresa?: string;
  @IsOptional() @IsIn(['true', 'false']) lancamentos?: string;
  @IsOptional() @IsIn(['true', 'false']) cupons?: string;
  @IsOptional() @IsIn(['despesa', 'inclusao']) data_por?: string;
  @IsOptional() @IsIn(['abertos', 'pagos', 'todos']) situacao?: string;
  @IsOptional() @Matches(/^\d{1,9}$/) numero?: string;
}
