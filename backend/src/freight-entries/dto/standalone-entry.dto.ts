import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Min } from 'class-validator';
import { EntryDto } from './entry.dto';
export class StandaloneEntryDto extends EntryDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/)
  placa: string;
  @Matches(/^\d{4}$/) declare semana: string;
  @IsOptional() @Matches(/^\d{1,11}$/) cpf_motorista?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) manifesto_id?: number;
}
