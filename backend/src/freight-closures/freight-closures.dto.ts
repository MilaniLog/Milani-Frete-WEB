import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  IsOptional,
  IsIn,
  IsDateString,
  IsArray,
  IsInt,
  Min,
  ValidateNested,
} from 'class-validator';

export class ConferenceDto {
  @IsOptional() @Matches(/^\d{4}$/) semana?: string;
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/)
  placa?: string;
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  inicio?: string;
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fim?: string;
  @IsOptional() @Matches(/^\d+$/) usuario?: string;
  @IsOptional() @IsString() @MaxLength(10) despesa?: string;
  @IsOptional() @Matches(/^\d+$/) numero?: string;
  @IsOptional() @Matches(/^\d+$/) tipo?: string;
  @IsOptional() @IsIn(['Todos', 'Agregado', 'Esporadico']) categoria?: string;
  @IsOptional() @IsIn(['true', 'false']) finalizados?: string;
  @IsOptional() @IsIn(['true', 'false']) mista?: string;
  @IsOptional() @IsIn(['true', 'false']) ordenar_data?: string;
  @IsOptional() @IsIn(['true', 'false']) ordenar_tipo?: string;
  @IsOptional() @IsIn(['true', 'false']) separar_pagamentos?: string;
}

export class CancelClosureDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  motivo: string;
}

export class ClosureDto {
  @Matches(/^\d{4}$/)
  semana: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/)
  placa: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  debit_entry_ids?: number[];
}

class WeekClosureSelectionDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/)
  placa: string;

  @IsArray()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  debit_entry_ids: number[];
}

export class WeekClosureDto {
  @Matches(/^\d{4}$/)
  semana: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique((item: WeekClosureSelectionDto) => item.placa)
  @ValidateNested({ each: true })
  @Type(() => WeekClosureSelectionDto)
  selections?: WeekClosureSelectionDto[];
}
