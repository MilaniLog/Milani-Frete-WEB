import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export class ExpenseDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  codigo: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nome: string;

  @IsIn(['Debito', 'Credito', 'Adiantamento'])
  tipo: string;

  @IsBoolean()
  ativo: boolean;
}
