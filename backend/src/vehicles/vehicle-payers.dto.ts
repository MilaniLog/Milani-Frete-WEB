import { Transform } from 'class-transformer';
import { IsNumber, IsString, Max, MaxLength, Min } from 'class-validator';

export class VehiclePayersDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(30)
  first_payer: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(30)
  second_payer: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(1)
  second_payer_percent: number;
}
