// RFID Demo seed: two local accounts (ADMIN and OPERATOR) and ten fictitious
// assets. Safe to run again: existing accounts and assets (matched by email
// and EPC) are left untouched, so nothing is duplicated or overwritten.
//
// Passwords come from DEMO_ADMIN_PASSWORD / DEMO_OPERATOR_PASSWORD (12-128
// chars). When one is missing for a NEW account, a random password is
// generated and written only to apps/api/.env.demo-credentials (git-ignored).
// Passwords are never printed. Only scrypt hashes reach the database.
//
// Usage (from apps/api): pnpm db:seed
import 'dotenv/config';
import { appendFileSync, chmodSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type UserRole } from '../generated/prisma/client.js';
import { hashPassword } from '../infrastructure/security/password.js';

const CREDENTIALS_FILE = '.env.demo-credentials';

interface DemoAccount {
  role: UserRole;
  name: string;
  email: string;
  password?: string;
}

// Fictitious tags: hex EPCs with the demo prefix D3E0. One asset is
// registered as inactive to show that a read still finds it.
const ASSETS = [
  { epc: 'D3E000000000000000000001', name: 'Computador portátil de demostración', category: 'Tecnología', location: 'Sala de demostración', description: 'Equipo de prueba para lecturas RFID' },
  { epc: 'D3E000000000000000000002', name: 'Monitor de 24 pulgadas', category: 'Tecnología', location: 'Sala de demostración' },
  { epc: 'D3E000000000000000000003', name: 'Silla ergonómica', category: 'Mobiliario', location: 'Oficina 1' },
  { epc: 'D3E000000000000000000004', name: 'Silla ergonómica', category: 'Mobiliario', location: 'Oficina 2', description: 'Mismo nombre que otro activo: cada EPC es un objeto distinto' },
  { epc: 'D3E000000000000000000005', name: 'Escritorio modular', category: 'Mobiliario', location: 'Oficina 1' },
  { epc: 'D3E000000000000000000006', name: 'Taladro inalámbrico', category: 'Herramientas', location: 'Taller' },
  { epc: 'D3E000000000000000000007', name: 'Caja de herramientas', category: 'Herramientas', location: 'Taller' },
  { epc: 'D3E000000000000000000008', name: 'Proyector portátil', category: 'Equipos', location: 'Sala de reuniones' },
  { epc: 'D3E000000000000000000009', name: 'Caja de archivo', category: 'Almacenamiento', location: 'Archivo' },
  { epc: 'D3E00000000000000000000A', name: 'Impresora de etiquetas', category: 'Equipos', location: 'Bodega de demostración', description: 'Registro desactivado para la demostración', active: false },
];

function account(role: UserRole, prefix: string, defaults: { name: string; email: string }): DemoAccount {
  return {
    role,
    name: process.env[`${prefix}_NAME`]?.trim() || defaults.name,
    email: (process.env[`${prefix}_EMAIL`]?.trim() || defaults.email).toLowerCase(),
    password: process.env[`${prefix}_PASSWORD`],
  };
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Falta DATABASE_URL');
  const expected = process.env.RFID_DEMO_DATABASE ?? 'rfid_demo';

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    // Stop before any write unless connected to the authorized database.
    const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    if (db !== expected) throw new Error(`Destino rechazado: ${db} (se esperaba ${expected})`);
    console.log(`current_database() = ${db}`);

    const accounts = [
      account('ADMIN', 'DEMO_ADMIN', { name: 'Administrador Demo', email: 'admin@rfid-demo.local' }),
      account('OPERATOR', 'DEMO_OPERATOR', { name: 'Operador Demo', email: 'operador@rfid-demo.local' }),
    ];

    let adminId: string | undefined;
    for (const item of accounts) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email) || item.email.length > 254) {
        throw new Error(`Correo inválido para la cuenta ${item.role}`);
      }
      const existing = await prisma.user.findUnique({ where: { email: item.email } });
      if (existing) {
        console.log(`Cuenta existente sin cambios: ${item.email} (${existing.role})`);
        if (item.role === 'ADMIN') adminId = existing.id;
        continue;
      }
      let password = item.password;
      const generated = !password;
      if (!password) password = randomBytes(18).toString('base64url');
      if (password.length < 12 || password.length > 128) {
        throw new Error(`La contraseña de ${item.role} debe tener entre 12 y 128 caracteres`);
      }
      const user = await prisma.user.create({
        data: { name: item.name, email: item.email, passwordHash: await hashPassword(password), role: item.role },
      });
      if (item.role === 'ADMIN') adminId = user.id;
      if (generated) {
        const isNew = !existsSync(CREDENTIALS_FILE);
        appendFileSync(
          CREDENTIALS_FILE,
          `${isNew ? '# Cuentas locales de RFID Demo (no versionar ni compartir)\n' : ''}` +
            `# ${item.role} creado ${new Date().toISOString()}\n` +
            `${item.role}_EMAIL=${item.email}\n${item.role}_PASSWORD=${password}\n`,
          { encoding: 'utf8' },
        );
        if (isNew) chmodSync(CREDENTIALS_FILE, 0o600);
        console.log(`Cuenta creada: ${item.email} (${item.role}); contraseña guardada en ${CREDENTIALS_FILE}`);
      } else {
        console.log(`Cuenta creada: ${item.email} (${item.role}) con la contraseña indicada`);
      }
    }
    if (!adminId) throw new Error('No se encontró la cuenta ADMIN de la demo');

    let created = 0;
    for (const { active, ...asset } of ASSETS) {
      const exists = await prisma.asset.findUnique({ where: { epc: asset.epc }, select: { id: true } });
      if (exists) continue;
      await prisma.asset.create({ data: { ...asset, active: active ?? true, createdById: adminId } });
      created += 1;
    }
    const total = await prisma.asset.count();
    console.log(`Activos de ejemplo creados: ${created}; ya existentes: ${ASSETS.length - created}; total en la base: ${total}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'No se pudo preparar la demo');
  process.exitCode = 1;
});
