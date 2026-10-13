import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class CreateFamilyDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Z0-9][A-Z0-9._/-]*$/, {
    message:
      'El código debe contener letras, números o los símbolos . _ / -',
  })
  code!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la familia es obligatorio' })
  @MaxLength(100)
  name!: string;
}

export class UpdateFamilyDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la familia es obligatorio' })
  @MaxLength(100)
  name?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  active?: boolean;
}

export class ListFamiliesQueryDto {
  // Omitted: all families. true/false: only active or inactive ones.
  @Transform(toBoolean)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean({ message: 'active debe ser true o false' })
  active?: boolean;
}

export class ListReferencesQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty({ message: 'familyId no puede estar vacío' })
  @MaxLength(50)
  familyId?: string;
}
