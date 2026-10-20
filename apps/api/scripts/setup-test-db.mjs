// Prepares the dedicated PostgreSQL database used by the e2e/concurrency/load
// tests. Never touches the development database's data:
//   1. If apps/api/.env.test has no TEST_DATABASE_URL, derives one from
//      DATABASE_URL (same server and credentials) with database name
//      "<dev database>_e2e_test" and writes it to .env.test (git-ignored).
//   2. Creates that database if it does not exist (CREATE DATABASE only; no
//      DROP, TRUNCATE or reset).
// Migrations are applied by the test global setup, once per run.
// The connection string is never printed.
//
// Usage (from apps/api): pnpm test:db:setup
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import dotenv from 'dotenv';
import pg from 'pg';

const ENV_TEST = '.env.test';
dotenv.config({ path: '.env', quiet: true });
const fileVars = existsSync(ENV_TEST) ? dotenv.parse(readFileSync(ENV_TEST)) : {};

let testUrl = process.env.TEST_DATABASE_URL ?? fileVars.TEST_DATABASE_URL;
if (!testUrl) {
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL en apps/api/.env para derivar la base de pruebas.');
    process.exit(1);
  }
  const url = new URL(process.env.DATABASE_URL);
  const devName = decodeURIComponent(url.pathname.slice(1));
  url.pathname = `/${devName}_e2e_test`;
  testUrl = url.toString();
  const existing = existsSync(ENV_TEST) ? readFileSync(ENV_TEST, 'utf8') : '';
  writeFileSync(
    ENV_TEST,
    `${existing}${existing && !existing.endsWith('\n') ? '\n' : ''}` +
      '# Dedicated test database (git-ignored). Tests refuse any other database.\n' +
      `TEST_DATABASE_URL=${testUrl}\n`,
  );
  console.log(`TEST_DATABASE_URL escrito en ${ENV_TEST} (valor no mostrado).`);
}

const target = new URL(testUrl);
const testName = decodeURIComponent(target.pathname.slice(1));
if (!/^[A-Za-z0-9_]+_test$/.test(testName)) {
  console.error('El nombre de la base de pruebas debe terminar en "_test" y usar solo letras, números y _.');
  process.exit(1);
}

// Connect to the server's maintenance database to create the test database.
const admin = new URL(testUrl);
admin.pathname = '/postgres';
const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [testName]);
if (found.rowCount === 0) {
  await client.query(`CREATE DATABASE "${testName}"`);
  console.log(`Base de pruebas creada: ${testName}`);
} else {
  console.log(`Base de pruebas existente: ${testName}`);
}
await client.end();
