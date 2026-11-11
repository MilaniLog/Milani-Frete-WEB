import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  IsNumber,
} from 'class-validator';

export class TicketQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(100) pageSize = 25;
  @IsOptional() @Transform(({ value }) => String(value ?? '').trim()) @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() unit?: number;
  @IsOptional() @Transform(({ value }) => String(value ?? '').trim()) @IsString() @MaxLength(50) type?: string;
  @IsOptional() @Transform(({ value }) => String(value ?? '').trim()) @IsString() @MaxLength(50) invoiceStatus?: string;
  @IsOptional() @IsIn(['todos', 'abertos', 'finalizados']) situation: 'todos' | 'abertos' | 'finalizados' = 'todos';
  @IsOptional() @IsDateString({ strict: true }) start?: string;
  @IsOptional() @IsDateString({ strict: true }) end?: string;
}

export class AdjustTicketPendingDto {
  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @MaxLength(100)
  type!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  freight!: number;

  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @MaxLength(10000)
  message!: string;
}
