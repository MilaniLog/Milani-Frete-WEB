import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Min } from 'class-validator';
import { CalculateFreightDto } from '../../freight-calculation/dto/calculate-freight.dto';

export class PreviewManifestDto extends CalculateFreightDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @Matches(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/)
  placa: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  manifesto_id?: number;

  @IsOptional()
  declare frete_veiculo: number;
}
