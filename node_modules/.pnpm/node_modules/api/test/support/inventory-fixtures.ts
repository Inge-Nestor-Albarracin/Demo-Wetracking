import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { UserRole } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/infrastructure/database/prisma.service.js';
import { createTestUser } from './e2e.js';

// Test catalog and locations for inventory e2e tests. Every record carries the
// run suffix and cleanup deletes by exact IDs. Bundles are only ever created
// with the test references, so they are found through those reference IDs.
export async function createInventoryFixtures(
  app: INestApplication<App>,
  suffix: string,
  roles: UserRole[] = ['ADMIN', 'WAREHOUSE', 'READ_ONLY'],
) {
  const prisma = app.get(PrismaService);
  const created = {
    users: [] as string[],
    families: [] as string[],
    references: [] as string[],
    finishes: [] as string[],
    branches: [] as string[],
    locations: [] as string[],
    aisles: [] as string[],
    racks: [] as string[],
  };

  const headers = {} as Record<UserRole, Record<string, string>>;
  const userIds = {} as Record<UserRole, string>;
  for (const role of roles) {
    const user = await createTestUser(app, role, suffix);
    created.users.push(user.id);
    headers[role] = user.headers;
    userIds[role] = user.id;
  }

  const family = async (key: string) => {
    const row = await prisma.productFamily.create({
      data: { code: `E2E-FAM${key}-${suffix}`, name: `Familia ${key}` },
    });
    created.families.push(row.id);
    return row.id;
  };
  const familyA = await family('A');
  const familyB = await family('B');

  const reference = async (key: string, familyId: string) => {
    const row = await prisma.reference.create({
      data: { code: `E2E-REF${key}-${suffix}`, description: `Ref ${key}`, familyId },
    });
    created.references.push(row.id);
    return row.id;
  };
  const referenceA = await reference('A', familyA);
  const referenceB = await reference('B', familyB);

  const finish = async (key: string) => {
    const row = await prisma.finish.create({
      data: { code: `E2E-FIN${key}-${suffix}`, description: `Acabado ${key}` },
    });
    created.finishes.push(row.id);
    return row.id;
  };
  const finishA = await finish('A');
  const finishB = await finish('B');

  const branch = await prisma.branch.create({
    data: { code: `E2E-BR-${suffix}`, name: 'Sucursal prueba' },
  });
  created.branches.push(branch.id);

  const location = async (key: string, active = true) => {
    const row = await prisma.inventoryLocation.create({
      data: {
        branchId: branch.id,
        code: `E2E-LOC${key}-${suffix}`,
        name: `Bodega ${key}`,
        active,
      },
    });
    created.locations.push(row.id);
    return row.id;
  };
  const aisle = async (inventoryLocationId: string, number: number) => {
    const row = await prisma.aisle.create({ data: { inventoryLocationId, number } });
    created.aisles.push(row.id);
    return row.id;
  };
  const rack = async (aisleId: string, number: number) => {
    const row = await prisma.rack.create({ data: { aisleId, number } });
    created.racks.push(row.id);
    return row.id;
  };

  const location1 = await location('1');
  const aisle1 = await aisle(location1, 1);
  const aisle2 = await aisle(location1, 2);
  const rack1 = await rack(aisle1, 1);
  const rack2 = await rack(aisle1, 2);
  const rack3 = await rack(aisle2, 1);
  const location2 = await location('2');
  const aisle4 = await aisle(location2, 4);
  const rack4 = await rack(aisle4, 1);
  const inactiveLocation = await location('X');
  const inactiveRack = await rack(await aisle(inactiveLocation, 9), 1);
  await prisma.inventoryLocation.update({
    where: { id: inactiveLocation },
    data: { active: false },
  });

  const ids = {
    branch: branch.id,
    familyA,
    familyB,
    referenceA,
    referenceB,
    finishA,
    finishB,
    location1,
    location2,
    inactiveLocation,
    aisle1,
    aisle2,
    aisle4,
    rack1,
    rack2,
    rack3,
    rack4,
    inactiveRack,
  };

  let epcCounter = 0;
  const register = async (
    overrides: Record<string, unknown> = {},
    role: UserRole = 'WAREHOUSE',
  ) => {
    epcCounter += 1;
    const res = await request(app.getHttpServer())
      .post('/inventory/bundles')
      .set(headers[role])
      .send({
        epc: `E2E${suffix}${String(epcCounter).padStart(4, '0')}`,
        referenceId: referenceA,
        finishId: finishA,
        quantity: 10,
        inventoryLocationId: location1,
        rackId: rack1,
        registrationType: 'INITIAL_STOCK',
        arrivalDatePrecision: 'UNKNOWN',
        ...overrides,
      });
    if (res.status !== 201) {
      throw new Error(`Fixture bundle failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body as { id: string; epc: string; quantity: number };
  };

  const cleanup = async () => {
    const bundles = await prisma.bundle.findMany({
      where: { referenceId: { in: created.references } },
      select: { id: true },
    });
    const bundleIds = bundles.map((b) => b.id);
    await prisma.inventoryMovement.deleteMany({ where: { bundleId: { in: bundleIds } } });
    await prisma.bundle.deleteMany({ where: { id: { in: bundleIds } } });
    await prisma.rack.deleteMany({ where: { id: { in: created.racks } } });
    await prisma.aisle.deleteMany({ where: { id: { in: created.aisles } } });
    await prisma.inventoryLocation.deleteMany({ where: { id: { in: created.locations } } });
    await prisma.branch.deleteMany({ where: { id: { in: created.branches } } });
    await prisma.reference.deleteMany({ where: { id: { in: created.references } } });
    await prisma.finish.deleteMany({ where: { id: { in: created.finishes } } });
    await prisma.productFamily.deleteMany({ where: { id: { in: created.families } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
    console.info('E2E records removed:', JSON.stringify({ ...created, bundles: bundleIds }));
  };

  return { prisma, ids, headers, userIds, register, cleanup };
}
