// Starts the API against the dedicated TEST database for manual/browser QA
// (never the development database). Same checks as the automated tests:
// TEST_DATABASE_URL from the environment or .env.test, local host, name
// ending in "_test", different from DATABASE_URL, and current_database()
// confirmed before starting. Builds first, then runs dist/main.
//
// Usage (from apps/api): pnpm start:test-db   (PORT defaults to 3101)
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import dotenv from 'dotenv';
import pg from 'pg';

const fileVars = existsSync('.env.test') ? dotenv.parse(readFileSync('.env.test')) : {};
const devVars = existsSync('.env') ? dotenv.parse(readFileSync('.env')) : {};
const raw = process.env.TEST_DATABASE_URL ?? fileVars.TEST_DATABASE_URL;
const stop = (message) => {
  console.error(`[base de pruebas] ${message}`);
  process.exit(1);
};
if (!raw) stop('Falta TEST_DATABASE_URL (ejecuta "pnpm test:db:setup").');
const url = new URL(raw);
const name = decodeURIComponent(url.pathname.slice(1));
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)) stop(`Host no permitido: ${url.hostname}`);
if (!/^[A-Za-z0-9_]+_test$/.test(name)) stop(`"${name}" no es una base de pruebas.`);
if (devVars.DATABASE_URL && decodeURIComponent(new URL(devVars.DATABASE_URL).pathname.slice(1)) === name) {
  stop('TEST_DATABASE_URL coincide con la base de desarrollo.');
}

const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
const { rows } = await client.query('SELECT current_database()');
await client.end();
if (rows[0]?.current_database !== name) stop('current_database() no coincide.');

const env = { ...process.env, DATABASE_URL: url.toString(), PORT: process.env.PORT ?? '3101' };
const migrate = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { env, stdio: 'ignore', shell: process.platform === 'win32' });
if (migrate.status !== 0) stop('prisma migrate deploy falló.');
const build = spawnSync('pnpm', ['build'], { env, stdio: 'ignore', shell: process.platform === 'win32' });
if (build.status !== 0) stop('La compilación falló.');

console.log(`API de pruebas sobre "${name}" en el puerto ${env.PORT}.`);
const child = spawn('node', ['dist/main.js'], { env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
// Stop the API together with this launcher (Ctrl+C or the parent ending).
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    child.kill();
    process.exit(0);
  });
}
process.on('exit', () => child.kill());
