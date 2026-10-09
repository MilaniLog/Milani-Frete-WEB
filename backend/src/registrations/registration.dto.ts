import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class DriverRegistrationDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) unit?: number;
  @Matches(/^\d{11}$/) cpf: string;
  @Transform(trim) @IsString() @MinLength(4) @MaxLength(50) name: string;
}
export class VehicleRegistrationDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) unit?: number;
  @IsOptional() @IsBoolean() owner_is_driver?: boolean;
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' && /^\d{1,11}$/.test(value.trim()) ? value.trim().padStart(11, '0') : value)
  @Matches(/^\d{11}$/, { message: 'Selecione um motorista com CPF de 11 dígitos.' })
  driver_cpf?: string | null;
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/)
  plate: string;
  @Type(() => Number) @IsInt() @Min(1) codVehicleType: number;
  @Transform(trim) @IsString() @Length(2, 50) owner_name: string;
  @Matches(/^(\d{11}|\d{14})$/) owner: string;
  @Transform(trim) @IsString() @Length(1, 10) empresa_sigla: string;
}
