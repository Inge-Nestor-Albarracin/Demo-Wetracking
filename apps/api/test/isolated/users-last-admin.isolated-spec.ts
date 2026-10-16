import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../src/infrastructure/database/prisma.service.js';
import { UsersService } from '../../src/modules/users/users.service.js';

// Runs ONLY against the isolated test database: it deactivates administrators,
// which must never happen on the development or production database.
const dbName = decodeURIComponent(new URL(process.env.DATABASE_URL ?? 'x:/').pathname.slice(1));
if (!dbName.endsWith('_isolated_test') || process.env.ISOLATED_TEST_DB !== dbName) {
  throw new Error('Esta prueba solo se ejecuta contra la base aislada (pnpm test:isolated)');
}

describe('Last active administrator under concurrency (isolated DB)', () => {
  const prisma = new PrismaService();
  const users = new UsersService(prisma);
  const created: string[] = [];

  const admin = async (label: string) => {
    const user = await prisma.user.create({
      data: {
        name: `Admin ${label}`,
        email: `isolated-${label}-${randomBytes(4).toString('hex')}@test.local`,
        passwordHash: 'not-used',
        role: 'ADMIN',
      },
    });
    created.push(user.id);
    return user.id;
  };

  const activeAdmins = () => prisma.user.count({ where: { role: 'ADMIN', active: true } });

  beforeAll(async () => {
    await prisma.$connect();
    // Start from a database without other active admins.
    await prisma.user.updateMany({ where: { role: 'ADMIN', active: true }, data: { active: false } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: created } } });
    await prisma.$disconnect();
  });

  it('two admins deactivating each other at the same time leave one active admin', async () => {
    for (let round = 0; round < 15; round += 1) {
      const a = await admin(`a${round}`);
      const b = await admin(`b${round}`);
      const results = await Promise.allSettled([
        users.setActive(b, false, a),
        users.setActive(a, false, b),
      ]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(BadRequestException);
      expect(await activeAdmins()).toBe(1);
      // Leave no active admin for the next round.
      await prisma.user.updateMany({ where: { id: { in: [a, b] } }, data: { active: false } });
    }
  }, 60000);

  it('several concurrent deactivations never drop below one active admin', async () => {
    const ids = await Promise.all(['x', 'y', 'z', 'w'].map((l) => admin(l)));
    const actor = await admin('actor');
    // The actor (also an admin) tries to deactivate all the others at once,
    // and each of them tries to deactivate the actor.
    await Promise.allSettled([
      ...ids.map((id) => users.setActive(id, false, actor)),
      ...ids.map((id) => users.setActive(actor, false, id)),
    ]);
    expect(await activeAdmins()).toBeGreaterThanOrEqual(1);
  }, 60000);
});
