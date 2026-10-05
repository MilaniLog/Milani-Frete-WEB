import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Inclusão e substituição completa do lançamento. O manifesto não pode ser transferido.
export class EntryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  despesa_id: number;

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  data_lancamento: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999999.99)
  valor: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  descricao?: string;

  @IsOptional()
  @Matches(/^\d{4}$/)
  semana?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  departamento?: string;
}
