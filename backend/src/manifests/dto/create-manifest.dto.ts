import { Transform, Type } from 'class-transformer';

import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateManifestDto {
  // =========================================================
  // DADOS PRINCIPAIS
  // =========================================================

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  semana: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  manifestos: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(20)
  manifesto_adicional_1?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(20)
  manifesto_adicional_2?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(20)
  manifesto_adicional_3?: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/)
  @MaxLength(10)
  hora: string;

  @IsString()
  @Matches(/^[A-Za-z]{3}[0-9][A-Za-z0-9][0-9]{2}$/, {
    message: 'Placa inválida. Informe a placa sem hífen.',
  })
  placa: string;

  @IsString()
  @Matches(/^\d{1,11}$/, {
    message: 'CPF do motorista inválido.',
  })
  cpf_motorista: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  destino_id: number;

  // =========================================================
  // CARGA
  // =========================================================

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  m3: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  kg: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  qtd_nf: number;

  // =========================================================
  // ORIGEM DA REGRA
  // =========================================================

  @IsOptional()
  @IsString()
  @MaxLength(10)
  origem?: string;

  // =========================================================
  // FRETE DO VEÍCULO
  //
  // Se não for enviado, o backend usa o valor do vehicleType.
  // =========================================================

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  frete_veiculo?: number;

  // =========================================================
  // FRETES BRUTOS
  // =========================================================

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

  // =========================================================
  // NÃO ENTREGUE
  // =========================================================

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

  // =========================================================
  // VALORES A RECEBER
  // =========================================================

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

  // =========================================================
  // OUTROS DADOS
  // =========================================================

  @IsOptional()
  @IsString()
  @MaxLength(255)
  observacao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  romaneio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const match = value.trim().toUpperCase().replace(/\s/g, '').match(/^(\d{12})\/?([\dX]{0,4})$/);
    return match ? `${match[1]}/${match[2].padEnd(4, 'X')}` : value;
  })
  ciot?: string;

  // =========================================================
  // CTRB
  // =========================================================

  @IsOptional()
  @IsString()
  @MaxLength(8)
  @Matches(/^\d{6}-\d$/, { message: 'ctrb_numero must match 000000-0' })
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const digits = value.replace(/\D/g, '').slice(0, 7);
    return digits.length > 6 ? `${digits.slice(0, 6)}-${digits.slice(6)}` : value;
  })
  ctrb_numero?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ctrb_total?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ctrb_adiantamento?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sest_senat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  irrf?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  prev_social?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  inss?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  vale_pedagio?: number;

  // =========================================================
  // CARGA MISTA
  // =========================================================

  @IsOptional()
  @IsBoolean()
  carga_mista?: boolean;
}
