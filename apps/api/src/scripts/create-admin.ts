import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { hashPassword } from '../infrastructure/security/password.js';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Falta DATABASE_URL');
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!name || name.length > 100 || !email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Nombre o correo inválidos');
  }
  if (!password || password.length < 12 || password.length > 128) {
    throw new Error('La contraseña debe tener entre 12 y 128 caracteres');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    if (await prisma.user.count({ where: { role: 'ADMIN' } })) {
      throw new Error('Ya existe un administrador. Crea otras cuentas desde el API autenticado');
    }
    const user = await prisma.user.create({
      data: { name, email, passwordHash: await hashPassword(password), role: 'ADMIN' },
      select: { id: true, name: true, email: true, role: true },
    });
    console.log('Administrador creado:', user);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof Error && !('code' in error)) console.error(error.message);
  else console.error('No se pudo crear el administrador; verifica conexión y correo no duplicado');
  process.exitCode = 1;
});
