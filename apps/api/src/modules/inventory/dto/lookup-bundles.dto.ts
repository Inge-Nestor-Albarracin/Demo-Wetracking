import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { EPC_PATTERN, normalizeEpc } from './register-bundle.dto.js';

// Upper bound per request for the bulk reading screen: the client sends the
// newly read chips in small batches, never the whole session at once.
export const MAX_LOOKUP_EPCS = 200;

// Read-only lookup of many chips at once (bulk RFID reading). Nothing is
// created or changed: reading a chip never adds stock.
export class LookupBundlesDto {
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? value.map(normalizeEpc) : value,
  )
  @IsArray({ message: 'epcs debe ser una lista de códigos' })
  @ArrayMinSize(1, { message: 'Envía al menos un EPC' })
  @ArrayMaxSize(MAX_LOOKUP_EPCS, {
    message: `Se pueden consultar hasta ${MAX_LOOKUP_EPCS} EPC por solicitud`,
  })
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  @Matches(EPC_PATTERN, {
    each: true,
    message: 'El EPC solo puede contener letras y números, sin espacios',
  })
  epcs!: string[];
}
