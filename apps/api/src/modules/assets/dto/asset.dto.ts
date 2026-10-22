import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
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

// EPC as delivered by the UHF reader (hex text). Kept as text so leading
// zeros are preserved; no fixed length is imposed. The same normalization is
// applied when registering, searching and resolving reads.
export const normalizeEpc = (value: unknown) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export const EPC_PATTERN = /^[A-Z0-9]+$/;
export const EPC_MESSAGE = 'El EPC solo puede contener letras y números, sin espacios';

// Upper bound per request for the bulk reading screen: the client sends the
// newly read chips in small batches, never the whole session at once.
export const MAX_RESOLVE_EPCS = 200;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Optional text: trimmed, and an empty value is stored as null.
const optionalText = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export class CreateAssetDto {
  @Transform(({ value }: { value: unknown }) => normalizeEpc(value))
  @IsString()
  @IsNotEmpty({ message: 'El EPC es obligatorio' })
  @MaxLength(128)
  @Matches(EPC_PATTERN, { message: EPC_MESSAGE })
  epc!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El nombre del activo es obligatorio' })
  @MaxLength(120)
  name!: string;

  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string | null;

  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string | null;
}

// The EPC identifies the tag and is not editable.
export class UpdateAssetDto {
  @Transform(trim)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty({ message: 'El nombre del activo es obligatorio' })
  @MaxLength(120)
  name?: string;

  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string | null;

  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string | null;
}

export class UpdateAssetActiveDto {
  @IsBoolean()
  active!: boolean;
}

export const ASSET_STATUSES = ['all', 'active', 'inactive'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export class ListAssetsQueryDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @Transform(({ value }: { value: unknown }) => normalizeEpc(value))
  @IsOptional()
  @IsString()
  @MaxLength(128)
  epc?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;

  @IsOptional()
  @IsIn(ASSET_STATUSES, { message: 'status debe ser all, active o inactive' })
  status?: AssetStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

// Read-only lookup of many chips at once (bulk RFID reading). Nothing is
// created or changed.
export class ResolveEpcsDto {
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? value.map(normalizeEpc) : value,
  )
  @IsArray({ message: 'epcs debe ser una lista de códigos' })
  @ArrayMinSize(1, { message: 'Envía al menos un EPC' })
  @ArrayMaxSize(MAX_RESOLVE_EPCS, {
    message: `Se pueden consultar hasta ${MAX_RESOLVE_EPCS} EPC por solicitud`,
  })
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  @Matches(EPC_PATTERN, { each: true, message: EPC_MESSAGE })
  epcs!: string[];
}
