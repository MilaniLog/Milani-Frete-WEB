import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { WeekFilterDto } from '../../weeks/weeks.dto';

export class ManifestQueryDto extends WeekFilterDto {
  @IsOptional()
  @IsIn(['true'])
  recent?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  number?: string;
}
