import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateFinishDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  description?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  active?: boolean;
}