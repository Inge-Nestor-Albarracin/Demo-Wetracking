import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createE2eApp, createTestUser, uniqueSuffix } from './support/e2e.js';
import { createInventoryFixtures } from './support/inventory-fixtures.js';

const employees = ['WAREHOUSE', 'SALES', 'READ_ONLY'] as const;
const roles = ['ADMIN', ...employees] as const;
type Employee = (typeof employees)[number];
type Fixtures = Awaited<ReturnType<typeof createInventoryFixtures>>;
type TestUser = Awaited<ReturnType<typeof createTestUser>>;

// Audit of actual permissions, including same-role ID substitution. The
// cross-location test characterizes current global inventory access; it does
// not establish that this is the desired business policy.
describe('Roles and object authorization (e2e)', () => {
  const suffix = uniqueSuffix();
  let app: INestApplication<App>;
  let fx: Fixtures;
  const peers = {} as Record<Employee, TestUser>;
  const ownTasks = {} as Record<Employee, string>;
  const peerTasks = {} as Record<Employee, string>;
  const taskIds: string[] = [];
  let elsewhere: { id: string; epc: string };
  let second: { id: string };
  const http = () => request(app.getHttpServer());
  const taskBody = () => ({ title: `Auditoría ${suffix}`, dueAt: new Date(Date.now() + 3_600_000).toISOString() });
  const bundleBody = () => ({
    epc: `AUDIT${suffix}${randomUUID().replaceAll('-', '')}`,
    referenceId: fx.ids.referenceA, finishId: fx.ids.finishA, quantity: 10,
    inventoryLocationId: fx.ids.location1, rackId: fx.ids.rack1,
    registrationType: 'INITIAL_STOCK', arrivalDatePrecision: 'UNKNOWN',
  });

  beforeAll(async () => {
    app = await createE2eApp();
    fx = await createInventoryFixtures(app, suffix, [...roles]);
    for (const role of employees) {
      peers[role] = await createTestUser(app, role, `${suffix}PEER`);
      await fx.prisma.user.update({
        where: { id: fx.userIds[role] }, data: { defaultInventoryLocationId: fx.ids.location1 },
      });
      const mine = await http().post('/tasks').set(fx.headers[role]).send(taskBody()).expect(201);
      ownTasks[role] = mine.body.id;
      taskIds.push(mine.body.id);
      const theirs = await http().post('/tasks').set(peers[role].headers).send(taskBody()).expect(201);
      peerTasks[role] = theirs.body.id;
      taskIds.push(theirs.body.id);
    }
    elsewhere = await fx.register({ inventoryLocationId: fx.ids.location2, rackId: fx.ids.rack4 });
    second = await fx.register();
  }, 30_000);

  afterAll(async () => {
    if (fx) {
      await fx.prisma.task.deleteMany({ where: { id: { in: taskIds } } });
      // Clear only the test users' foreign keys before the fixture removes locations.
      await fx.prisma.user.updateMany({
        where: { id: { in: Object.values(fx.userIds) } }, data: { defaultInventoryLocationId: null },
      });
      const peerIds = Object.values(peers).map((user) => user.id);
      await fx.prisma.user.deleteMany({ where: { id: { in: peerIds } } });
      await fx.cleanup();
      expect(await fx.prisma.task.count({ where: { id: { in: taskIds } } })).toBe(0);
      expect(await fx.prisma.user.count({ where: { id: { in: [...Object.values(fx.userIds), ...peerIds] } } })).toBe(0);
      console.info('IDOR audit cleanup:', JSON.stringify({ tasks: taskIds, peers: peerIds }));
    }
    await app?.close();
  });

  it.each(employees)('%s cannot read, complete or assign a peer task by changing IDs', async (role) => {
    const target = peerTasks[role];
    const denied = await http().get(`/tasks/${target}`).set(fx.headers[role]).expect(404);
    const missing = await http().get(`/tasks/missing-${suffix}`).set(fx.headers[role]).expect(404);
    expect(denied.body).toEqual(missing.body);
    await http().get(`/tasks/${ownTasks[role]}`).set(peers[role].headers).expect(404);
    await http().patch(`/tasks/${target}/complete`).set(fx.headers[role])
      .send({ assigneeId: fx.userIds[role], userId: peers[role].id }).expect(404);
    await http().post('/tasks').set(fx.headers[role])
      .send({ ...taskBody(), assigneeId: peers[role].id }).expect(403);
    await http().get(`/tasks?assigneeId=${peers[role].id}`).set(fx.headers[role]).expect(403);
    await http().get(`/tasks/summary?assigneeId=${peers[role].id}`).set(fx.headers[role]).expect(403);
    for (const status of ['pending', 'completed', 'incomplete']) {
      const list = await http().get(`/tasks?status=${status}`).set(fx.headers[role]).expect(200);
      expect(list.body.items.every((t: { assigneeId: string }) => t.assigneeId === fx.userIds[role])).toBe(true);
    }
    const summary = await http().get('/tasks/summary').set(fx.headers[role]).expect(200);
    expect(summary.body).toMatchObject({ pending: 1, completed: 0, incomplete: 0 });
    const stored = await fx.prisma.task.findUniqueOrThrow({ where: { id: target } });
    expect(stored.assigneeId).toBe(peers[role].id);
    expect(stored.completedAt).toBeNull();
  });

  it('ADMIN can inspect team tasks but cannot complete another assignee task', async () => {
    for (const role of employees) {
      await http().get(`/tasks/${peerTasks[role]}`).set(fx.headers.ADMIN).expect(200);
      await http().patch(`/tasks/${peerTasks[role]}/complete`).set(fx.headers.ADMIN).expect(403);
      const summary = await http().get(`/tasks/summary?assigneeId=${peers[role].id}`).set(fx.headers.ADMIN).expect(200);
      expect(summary.body.pending).toBe(1);
    }
  });

  it.each(roles)('%s has global authenticated inventory, catalog and location reads', async (role) => {
    const routes = [
      `/inventory/bundles/${elsewhere.id}`, `/inventory/bundles/epc/${elsewhere.epc}`,
      `/inventory/bundles/${elsewhere.id}/movements`,
      `/inventory/bundles?inventoryLocationId=${fx.ids.location2}&referenceId=${fx.ids.referenceA}`,
      `/inventory/summary?inventoryLocationId=${fx.ids.location2}&referenceId=${fx.ids.referenceA}`,
      '/catalog/families', '/catalog/references', `/catalog/references/${fx.ids.referenceA}`, '/catalog/finishes',
      '/locations/branches', `/locations/branches/${fx.ids.branch}/inventory-locations`,
      `/locations/inventory-locations/${fx.ids.location2}/aisles`, `/locations/aisles/${fx.ids.aisle4}/racks`,
      '/health/database',
    ];
    for (const route of routes) await http().get(route).set(fx.headers[role]).expect(200);
    const me = await http().get(`/auth/me?userId=${fx.userIds.ADMIN}`).set(fx.headers[role]).expect(200);
    expect(me.body.id).toBe(fx.userIds[role]);
    expect(me.body.passwordHash).toBeUndefined();
    const detail = await http().get(`/inventory/bundles/${elsewhere.id}`).set(fx.headers[role]).expect(200);
    expect(detail.body.inventoryLocationId).toBe(fx.ids.location2);
    expect(Object.keys(detail.body.movements[0].performedBy).sort()).toEqual(['id', 'name', 'role']);
  });

  it.each(employees)('%s cannot administer users, catalogs or locations via direct HTTP', async (role) => {
    await http().get('/users').set(fx.headers[role]).expect(403);
    await http().post('/users').set(fx.headers[role]).send({ role: 'ADMIN' }).expect(403);
    for (const id of [fx.userIds[role], fx.userIds.ADMIN, `missing-${suffix}`]) {
      await http().patch(`/users/${id}/active`).set(fx.headers[role]).send({ active: false }).expect(403);
    }
    for (const [collection, id] of [
      ['references', fx.ids.referenceA], ['families', fx.ids.familyA], ['finishes', fx.ids.finishA],
    ]) {
      await http().post(`/catalog/${collection}`).set(fx.headers[role]).send({}).expect(403);
      await http().patch(`/catalog/${collection}/${id}`).set(fx.headers[role]).send({ active: false }).expect(403);
    }
    for (const collection of ['branches', 'inventory-locations', 'aisles', 'racks']) {
      await http().post(`/locations/${collection}`).set(fx.headers[role]).send({}).expect(403);
    }
    expect((await fx.prisma.user.findUniqueOrThrow({ where: { id: fx.userIds.ADMIN } })).active).toBe(true);
    expect((await fx.prisma.reference.findUniqueOrThrow({ where: { id: fx.ids.referenceA } })).active).toBe(true);
  });

  it.each(['SALES', 'READ_ONLY'] as const)('%s cannot mutate inventory even with valid object IDs', async (role) => {
    await http().post('/inventory/bundles').set(fx.headers[role]).send(bundleBody()).expect(403);
    await http().post('/inventory/bundles/batch').set(fx.headers[role])
      .send({ operationKey: randomUUID(), bundles: [bundleBody()] }).expect(403);
    await http().post(`/inventory/bundles/${elsewhere.id}/exit`).set(fx.headers[role])
      .send({ operationKey: randomUUID(), quantity: 1 }).expect(403);
    await http().post(`/inventory/bundles/${elsewhere.id}/transfer`).set(fx.headers[role])
      .send({ operationKey: randomUUID(), inventoryLocationId: fx.ids.location1, rackId: fx.ids.rack1 }).expect(403);
    await http().post(`/inventory/bundles/${elsewhere.id}/adjustments`).set(fx.headers[role])
      .send({ operationKey: randomUUID(), type: 'ADJUSTMENT_IN', quantity: 1, reason: 'Auditoría' }).expect(403);
    expect((await fx.prisma.bundle.findUniqueOrThrow({ where: { id: elsewhere.id } })).quantity).toBe(10);
  });

  it('rejects forged actor fields and WAREHOUSE adjustments', async () => {
    await http().post('/tasks').set(fx.headers.WAREHOUSE)
      .send({ ...taskBody(), createdById: fx.userIds.ADMIN }).expect(400);
    await http().post('/inventory/bundles').set(fx.headers.WAREHOUSE)
      .send({ ...bundleBody(), performedById: fx.userIds.ADMIN }).expect(400);
    await http().post(`/inventory/bundles/${elsewhere.id}/exit`).set(fx.headers.WAREHOUSE)
      .send({ operationKey: randomUUID(), quantity: 1, performedById: fx.userIds.ADMIN }).expect(400);
    await http().post(`/inventory/bundles/${elsewhere.id}/adjustments`).set(fx.headers.WAREHOUSE)
      .send({ operationKey: randomUUID(), type: 'ADJUSTMENT_IN', quantity: 1, reason: 'Auditoría' }).expect(403);
  });

  it('WAREHOUSE can exit and transfer outside its default location; replay binds actor and bundle', async () => {
    const operation = { operationKey: randomUUID(), quantity: 1 };
    const res = await http().post(`/inventory/bundles/${elsewhere.id}/exit`)
      .set(fx.headers.WAREHOUSE).send(operation).expect(201);
    expect(res.body.movement.performedById).toBe(fx.userIds.WAREHOUSE);
    expect(res.body.bundle.quantity).toBe(9);
    await http().post(`/inventory/bundles/${elsewhere.id}/exit`).set(peers.WAREHOUSE.headers).send(operation).expect(409);
    await http().post(`/inventory/bundles/${second.id}/exit`).set(fx.headers.WAREHOUSE).send(operation).expect(409);
    expect((await fx.prisma.bundle.findUniqueOrThrow({ where: { id: second.id } })).quantity).toBe(10);
    // Wrong rack/location association is rejected, even with a valid role.
    await http().post(`/inventory/bundles/${elsewhere.id}/transfer`).set(fx.headers.WAREHOUSE)
      .send({ operationKey: randomUUID(), inventoryLocationId: fx.ids.location1, rackId: fx.ids.rack4 }).expect(400);
    const moved = await http().post(`/inventory/bundles/${elsewhere.id}/transfer`).set(fx.headers.WAREHOUSE)
      .send({ operationKey: randomUUID(), inventoryLocationId: fx.ids.location1, rackId: fx.ids.rack1 }).expect(201);
    expect(moved.body.bundle.inventoryLocationId).toBe(fx.ids.location1);
    expect(moved.body.bundle.quantity).toBe(9);
  });

  it.each(employees)('%s can complete its own task, including READ_ONLY', async (role) => {
    const res = await http().patch(`/tasks/${ownTasks[role]}/complete`).set(fx.headers[role]).expect(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.assigneeId).toBe(fx.userIds[role]);
  });

  it('rechecks the current database role for an already-issued token', async () => {
    const user = peers.WAREHOUSE;
    await fx.prisma.user.update({ where: { id: user.id }, data: { role: 'READ_ONLY' } });
    const res = await http().get('/auth/me').set(user.headers).expect(200);
    expect(res.body.role).toBe('READ_ONLY');
    await http().post(`/inventory/bundles/${elsewhere.id}/exit`).set(user.headers)
      .send({ operationKey: randomUUID(), quantity: 1 }).expect(403);
  });

  it('requires a session for object reads and writes', async () => {
    for (const route of [
      '/users', '/auth/me', `/tasks/${ownTasks.WAREHOUSE}`, '/tasks/summary',
      `/inventory/bundles/${elsewhere.id}`, `/inventory/bundles/epc/${elsewhere.epc}`,
      `/inventory/bundles/${elsewhere.id}/movements`, '/inventory/summary',
      `/catalog/references/${fx.ids.referenceA}`, `/locations/aisles/${fx.ids.aisle4}/racks`,
    ]) await http().get(route).expect(401);
    await http().patch(`/tasks/${ownTasks.WAREHOUSE}/complete`).expect(401);
    await http().patch(`/users/${fx.userIds.ADMIN}/active`).send({ active: false }).expect(401);
    await http().post(`/inventory/bundles/${elsewhere.id}/exit`)
      .send({ operationKey: randomUUID(), quantity: 1 }).expect(401);
  });
});
