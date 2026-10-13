import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { InventoryLocationType } from '../../../generated/prisma/client.js';

class NamedLocationDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Z0-9][A-Z0-9._-]*$/)
  code!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}

export class CreateBranchDto extends NamedLocationDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;
}

export class CreateInventoryLocationDto extends NamedLocationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  branchId!: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(InventoryLocationType)
  type?: InventoryLocationType;
}

export class CreateAisleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  inventoryLocationId!: string;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  number!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  floorNumber?: number | null;
}

export class CreateRackDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  aisleId!: string;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  number!: number;
}
