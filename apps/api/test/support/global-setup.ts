// Runs once per vitest run, before any worker: validates the test database,
// confirms it with current_database() and applies the migrations once.
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { resolveTestDatabase } from './test-database.js';

export default async function setup() {
  const db = resolveTestDatabase();

  const client = new pg.Client({ connectionString: db.url });
  try {
    await client.connect();
  } catch {
    throw new Error(
      `[base de pruebas] No se pudo conectar a "${db.name}" en ${db.host}. Ejecuta "pnpm test:db:setup".`,
    );
  }
  const { rows } = await client.query<{ current_database: string }>('SELECT current_database()');
  await client.end();
  if (rows[0]?.current_database !== db.name) {
    throw new Error(`[base de pruebas] current_database() no coincide con "${db.name}". Se detiene.`);
  }

  // DATABASE_URL is overridden only for this child; prisma.config.ts loads
  // .env with dotenv, which never overrides an existing variable.
  const result = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: db.url },
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(`[base de pruebas] prisma migrate deploy falló:\n${(result.stderr || result.stdout).replaceAll(db.url, '<TEST_DATABASE_URL>')}`);
  }
  console.log(`[base de pruebas] ${db.name} en ${db.host}: migraciones al día.`);
}
