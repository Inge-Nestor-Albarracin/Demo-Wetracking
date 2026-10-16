// Runs tests that need a database of their own (e.g. deactivating every
// administrator). Never touches the development database:
//   1. Derives "<dev database>_isolated_test" from DATABASE_URL in apps/api/.env.
//   2. Creates it if missing and applies the migrations (prisma migrate deploy).
//   3. Runs vitest with vitest.config.isolated.ts against that database.
// The connection string is never printed.
//
// Usage (from apps/api): pnpm test:isolated
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const source = process.env.DATABASE_URL;
if (!source) {
  console.error('Falta DATABASE_URL en apps/api/.env');
  process.exit(1);
}

const url = new URL(source);
const devName = decodeURIComponent(url.pathname.slice(1));
const testName = `${devName}_isolated_test`;
if (!/^[A-Za-z0-9_]+$/.test(testName)) {
  console.error('Nombre de base de datos no admitido para la base aislada');
  process.exit(1);
}
const testUrl = new URL(source);
testUrl.pathname = `/${testName}`;

const client = new pg.Client({ connectionString: source });
await client.connect();
const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [testName]);
if (exists.rowCount === 0) {
  // Identifier validated above; CREATE DATABASE does not accept parameters.
  await client.query(`CREATE DATABASE "${testName}"`);
  console.log(`Base aislada creada: ${testName}`);
} else {
  console.log(`Base aislada existente: ${testName}`);
}
await client.end();

const env = { ...process.env, DATABASE_URL: testUrl.toString(), ISOLATED_TEST_DB: testName };
const run = (args) => {
  const result = spawnSync('pnpm', args, { env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(['exec', 'prisma', 'migrate', 'deploy']);
run(['exec', 'vitest', 'run', '--config', './vitest.config.isolated.ts']);
