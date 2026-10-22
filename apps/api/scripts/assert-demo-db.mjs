// Guard for every write to the demo database (migrations, seed, accounts).
// Connects with DATABASE_URL from apps/api/.env, asks PostgreSQL for
// current_database() and exits with an error unless it is the authorized
// demo database (RFID_DEMO_DATABASE, default "rfid_demo"). Prints only the
// database name, the table list and row counts; never the connection string.
//
// Usage (from apps/api): pnpm db:check
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env', quiet: true });

const expected = process.env.RFID_DEMO_DATABASE ?? 'rfid_demo';
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Falta DATABASE_URL en apps/api/.env');
  process.exit(1);
}

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const { rows } = await client.query('SELECT current_database() AS db');
  const actual = rows[0].db;
  if (actual !== expected) {
    console.error(`Destino rechazado: current_database() = "${actual}", se esperaba "${expected}".`);
    process.exitCode = 1;
  } else {
    const tables = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1",
    );
    console.log(`current_database() = ${actual} (autorizada)`);
    console.log(`Tablas en public: ${tables.rows.map((t) => t.table_name).join(', ') || '(ninguna)'}`);
    for (const name of ['users', 'assets']) {
      if (tables.rows.some((t) => t.table_name === name)) {
        const count = await client.query(`SELECT count(*)::int AS n FROM "${name}"`);
        console.log(`  ${name}: ${count.rows[0].n} filas`);
      }
    }
  }
} finally {
  await client.end();
}
