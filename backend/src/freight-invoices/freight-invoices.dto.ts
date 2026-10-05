import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  IsDefined,
} from 'class-validator';

export class InvoiceTypeDto {
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
  // Os tipos encontrados na planilha são débitos do veículo.
  @IsIn(['Debito'])
  tipo: string;
  @IsBoolean()
  ativo: boolean;
}

export class InvoiceDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  numero: string;
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  data_nota: string;
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  emitido_em: string;
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999999.99)
  valor: number;
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tipo_id: number;
  @IsOptional()
  @IsString()
  @MaxLength(30)
  departamento?: string;
}

export class CouponDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/)
  placa: string;
  @Matches(/^\d{1,11}$/)
  cpf_motorista: string;
  @Matches(/^\d{4}$/)
  semana: string;
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
  @IsString()
  @MaxLength(30)
  departamento?: string;
}

export class InvoiceLaunchDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => InvoiceDto)
  nota: InvoiceDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => CouponDto)
  cupom: CouponDto;
}

export class InvoiceNumberDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  numero: string;
}
