// Guard for every test that writes data: it may only reach the dedicated test
// database. Used by the vitest global setup (once per run) and by the worker
// setup (before any application module is imported).
import { existsSync, readFileSync } from 'node:fs';
import dotenv from 'dotenv';

const DEFAULT_ALLOWED_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'];

export interface TestDatabase {
  url: string;
  name: string;
  host: string;
}

function fail(message: string): never {
  throw new Error(`[base de pruebas] ${message}`);
}

// Reads TEST_DATABASE_URL from the environment or apps/api/.env.test (never
// from .env), then checks host, name and that it is not the dev database.
export function resolveTestDatabase(): TestDatabase {
  const fileVars = existsSync('.env.test') ? dotenv.parse(readFileSync('.env.test')) : {};
  const devVars = existsSync('.env') ? dotenv.parse(readFileSync('.env')) : {};
  const raw = process.env.TEST_DATABASE_URL ?? fileVars.TEST_DATABASE_URL;
  if (!raw) {
    fail('Falta TEST_DATABASE_URL. Ejecuta "pnpm test:db:setup" o defínela; las pruebas no se ejecutan contra DATABASE_URL.');
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    fail('TEST_DATABASE_URL no es una URL válida.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) fail('TEST_DATABASE_URL debe ser PostgreSQL.');

  const allowed = (process.env.TEST_DATABASE_ALLOWED_HOSTS ?? fileVars.TEST_DATABASE_ALLOWED_HOSTS)
    ?.split(',')
    .map((h) => h.trim())
    .filter(Boolean) ?? DEFAULT_ALLOWED_HOSTS;
  if (!allowed.includes(url.hostname)) {
    fail(`Host no permitido para pruebas: ${url.hostname}. Permitidos: ${allowed.join(', ')}.`);
  }

  const name = decodeURIComponent(url.pathname.slice(1));
  if (!/^[A-Za-z0-9_]+_test$/.test(name) || /prod/i.test(name)) {
    fail(`El nombre "${name}" no identifica una base de pruebas (debe terminar en "_test").`);
  }

  const devUrl = devVars.DATABASE_URL;
  if (devUrl) {
    const dev = new URL(devUrl);
    if (dev.hostname === url.hostname && dev.port === url.port && decodeURIComponent(dev.pathname.slice(1)) === name) {
      fail('TEST_DATABASE_URL apunta a la misma base que DATABASE_URL (desarrollo).');
    }
  }

  return { url: url.toString(), name, host: url.hostname };
}
