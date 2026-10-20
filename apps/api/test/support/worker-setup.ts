// Runs in every test worker before the test file (and therefore before the
// application and PrismaService are imported). Points DATABASE_URL at the
// validated test database; later `import 'dotenv/config'` calls cannot
// replace it because dotenv never overrides existing variables.
import { resolveTestDatabase } from './test-database.js';

const db = resolveTestDatabase();
process.env.DATABASE_URL = db.url;
process.env.E2E_TEST_DATABASE_NAME = db.name;
