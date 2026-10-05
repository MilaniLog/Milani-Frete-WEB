import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

import { Type } from 'class-transformer';

export class LoginDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cod: number;

  @IsString()
  @IsNotEmpty()
  password: string;
}
