import { Type } from 'class-transformer';

import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CalculateFreightDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  origem?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  frete_veiculo: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cod_777_00?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cod_888_00?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cod_999_00?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  nao_777?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  nao_888?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  nao_999?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  outros?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  diaria?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tde?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  escada?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  paletizacao?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estadia?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  descarga?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  despesas_empresa?: number;
}
