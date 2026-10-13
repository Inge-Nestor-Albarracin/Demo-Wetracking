import { readFileSync, appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

const file = fileURLToPath(new URL('../.env', import.meta.url));
const content = readFileSync(file, 'utf8');
const configured = parse(content).JWT_SECRET;
if (configured !== undefined) {
  if (configured.length < 32) {
    throw new Error('JWT_SECRET ya existe pero es demasiado corto. Corrígelo antes de iniciar');
  }
  console.log('JWT_SECRET ya estaba configurado; no se modificó.');
} else {
  appendFileSync(file, `\nJWT_SECRET=${randomBytes(32).toString('hex')}\n`, { encoding: 'utf8' });
  console.log('JWT_SECRET creado en .env; su valor no se muestra.');
}
