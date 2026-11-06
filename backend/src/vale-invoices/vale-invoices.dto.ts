import { IsDateString, IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class CreateValeInvoiceDto {
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  inicio!: string;

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fim!: string;
}

export class PreviewValeInvoiceDto extends CreateValeInvoiceDto {
  @IsOptional()
  @IsIn(['todos', 'debito', 'credito', 'ctrb'])
  movimento?: 'todos' | 'debito' | 'credito' | 'ctrb';

  @IsOptional()
  @IsString()
  local?: string;

  @IsOptional()
  @IsIn(['LOOG', 'MLN'])
  dominio?: 'LOOG' | 'MLN';
}
