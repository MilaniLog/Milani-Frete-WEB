import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsInt()
  @Min(1)
  cod!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;

  @IsInt()
  @Min(1)
  unit!: number;

  @IsBoolean()
  isAdmin!: boolean;

  @IsIn(['OPERACAO', 'FINANCEIRO', 'RH'])
  freightProfile!: 'OPERACAO' | 'FINANCEIRO' | 'RH';
}

export class UpdateUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name!: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password?: string;

  @IsInt()
  @Min(1)
  unit!: number;

  @IsBoolean()
  isAdmin!: boolean;

  @IsIn(['OPERACAO', 'FINANCEIRO', 'RH'])
  freightProfile!: 'OPERACAO' | 'FINANCEIRO' | 'RH';
}
