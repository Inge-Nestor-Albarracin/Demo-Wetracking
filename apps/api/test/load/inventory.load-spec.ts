import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../../src/infrastructure/database/prisma.service.js';
import { ledgerProblems } from '../support/concurrency.js';
import { createE2eApp, uniqueSuffix } from '../support/e2e.js';
import { createInventoryFixtures } from '../support/inventory-fixtures.js';

// Bounded load test against the local test database, over real HTTP. Each
// virtual user is a separate client (own IP behind the trusted proxy, like
// one tablet each), mixes reads and writes on temporary data, and only
// retries what the protocol allows (503 + Retry-After, same operationKey).
// Results are printed; they describe THIS computer, not the production VPS.

const LEVELS = [5, 10, 25];
const DURATION_MS = Number(process.env.LOAD_DURATION_MS ?? 15000);
const THINK_MS = 150; // keeps each client under the 120 req/min throttle
const BUNDLES_PER_LEVEL = 8; // shared by all users: exits contend for them
const INITIAL_QUANTITY = 40;

type Kind = 'summary' | 'list' | 'byEpc' | 'exit' | 'batch';
interface Sample {
  kind: Kind;
  status: number;
  ms: number;
  attempts: number;
}

const percentile = (values: number[], p: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Bounded load (5, 10 and 25 virtual users)', () => {
  const suffix = uniqueSuffix();
  let app: INestApplication<App>;
  let fx: Awaited<ReturnType<typeof createInventoryFixtures>>;
  let baseUrl = '';
  const report: Record<string, unknown>[] = [];

  beforeAll(async () => {
    process.env.TRUST_PROXY = '1';
    app = await createE2eApp();
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    fx = await createInventoryFixtures(app, suffix, ['ADMIN', 'WAREHOUSE']);
  }, 60000);

  afterAll(async () => {
    await fx?.cleanup();
    await app?.close();
    delete process.env.TRUST_PROXY;
  }, 120000);

  it('keeps inventory rules under concurrent reads and writes', async () => {
    const prisma = app.get(PrismaService);
    const pg = await prisma.$queryRaw<{ server_version: string }[]>`SHOW server_version`;
    report.push({
      entorno: {
        so: `${os.type()} ${os.release()}`,
        cpu: `${os.cpus()[0]?.model} × ${os.cpus().length}`,
        memoriaGB: Math.round(os.totalmem() / 2 ** 30),
        node: process.version,
        postgres: pg[0]?.server_version,
        poolMax: Math.min(50, Math.max(1, Number(process.env.DATABASE_POOL_MAX) || 10)),
        duracionPorNivelMs: DURATION_MS,
        pausaEntreSolicitudesMs: THINK_MS,
        nota: 'API y PostgreSQL en el mismo equipo de desarrollo; no representa el VPS.',
      },
    });

    for (const users of LEVELS) {
      // Fresh bundles for this level, created through the batch endpoint.
      const seed = Array.from({ length: BUNDLES_PER_LEVEL }, (_, i) => ({
        epc: `E2EL${suffix}${users}X${i}`,
        referenceId: fx.ids.referenceA,
        finishId: fx.ids.finishA,
        quantity: INITIAL_QUANTITY,
        inventoryLocationId: fx.ids.location1,
        rackId: fx.ids.rack1,
        registrationType: 'INITIAL_STOCK',
        arrivalDatePrecision: 'UNKNOWN',
      }));
      const seeded = await fetch(`${baseUrl}/inventory/bundles/batch`, {
        method: 'POST',
        headers: { ...fx.headers.ADMIN, 'Content-Type': 'application/json', 'X-Forwarded-For': `10.40.${users}.250` },
        body: JSON.stringify({ operationKey: randomUUID(), bundles: seed }),
      });
      expect(seeded.status).toBe(201);
      const bundles = ((await seeded.json()) as { bundles: { id: string; epc: string }[] }).bundles;

      const samples: Sample[] = [];
      const exitsApplied = new Map<string, number>();
      const unexpected: string[] = [];
      const deadline = Date.now() + DURATION_MS;
      let epcCounter = 0;

      const send = async (kind: Kind, ipHeader: string, path: string, init?: { method: string; body: unknown }) => {
        const started = performance.now();
        let attempts = 0;
        for (;;) {
          attempts += 1;
          const res = await fetch(`${baseUrl}${path}`, {
            method: init?.method ?? 'GET',
            headers: { ...fx.headers.WAREHOUSE, 'Content-Type': 'application/json', 'X-Forwarded-For': ipHeader },
            body: init ? JSON.stringify(init.body) : undefined,
          });
          const text = await res.text();
          // Protocol retry only: 503 means "not applied, resend unchanged".
          if (res.status === 503 && attempts < 4) {
            await sleep(Number(res.headers.get('retry-after') ?? 1) * 1000);
            continue;
          }
          const sample = { kind, status: res.status, ms: performance.now() - started, attempts };
          samples.push(sample);
          return { status: res.status, text };
        }
      };

      const worker = async (index: number) => {
        const ipHeader = `10.41.${users}.${index + 1}`;
        while (Date.now() < deadline) {
          const roll = Math.random();
          const bundle = bundles[Math.floor(Math.random() * bundles.length)];
          if (roll < 0.45) {
            const r = await send('summary', ipHeader, `/inventory/summary?branchId=${fx.ids.branch}`);
            if (r.status !== 200) unexpected.push(`summary ${r.status}`);
          } else if (roll < 0.65) {
            const r = await send('list', ipHeader, `/inventory/bundles?branchId=${fx.ids.branch}&pageSize=25`);
            if (r.status !== 200) unexpected.push(`list ${r.status}`);
          } else if (roll < 0.8) {
            const r = await send('byEpc', ipHeader, `/inventory/bundles/epc/${bundle.epc}`);
            if (r.status !== 200) unexpected.push(`byEpc ${r.status}`);
          } else if (roll < 0.97) {
            const quantity = 1 + Math.floor(Math.random() * 3);
            const r = await send('exit', ipHeader, `/inventory/bundles/${bundle.id}/exit`, {
              method: 'POST',
              body: { operationKey: randomUUID(), quantity },
            });
            if (r.status === 201) exitsApplied.set(bundle.id, (exitsApplied.get(bundle.id) ?? 0) + quantity);
            else if (r.status !== 409) unexpected.push(`exit ${r.status} ${r.text.slice(0, 80)}`);
          } else {
            epcCounter += 1;
            const r = await send('batch', ipHeader, '/inventory/bundles/batch', {
              method: 'POST',
              body: { operationKey: randomUUID(), bundles: [{ ...seed[0], epc: `E2EL${suffix}${users}N${index}x${epcCounter}`, quantity: 5 }] },
            });
            if (r.status !== 201) unexpected.push(`batch ${r.status}`);
          }
          await sleep(THINK_MS);
        }
      };
      await Promise.all(Array.from({ length: users }, (_, i) => worker(i)));

      // Inventory rules after the level.
      const rows = await prisma.bundle.findMany({ where: { id: { in: bundles.map((b) => b.id) } } });
      const negative = rows.filter((b) => b.quantity < 0).length;
      const mismatches = rows.filter((b) => b.quantity !== INITIAL_QUANTITY - (exitsApplied.get(b.id) ?? 0)).length;
      const ledger = await ledgerProblems(prisma, bundles.map((b) => b.id));

      const byKind: Record<string, unknown> = {};
      for (const kind of ['summary', 'list', 'byEpc', 'exit', 'batch'] as Kind[]) {
        const list = samples.filter((s) => s.kind === kind);
        if (list.length === 0) continue;
        byKind[kind] = {
          solicitudes: list.length,
          medianaMs: Math.round(percentile(list.map((s) => s.ms), 50)),
          p95Ms: Math.round(percentile(list.map((s) => s.ms), 95)),
          estados: list.reduce<Record<number, number>>((acc, s) => ({ ...acc, [s.status]: (acc[s.status] ?? 0) + 1 }), {}),
        };
      }
      const all = samples.map((s) => s.ms);
      const levelReport = {
        usuarios: users,
        solicitudes: samples.length,
        porSegundo: Math.round((samples.length / DURATION_MS) * 1000),
        medianaMs: Math.round(percentile(all, 50)),
        p95Ms: Math.round(percentile(all, 95)),
        reintentos503: samples.filter((s) => s.attempts > 1).length,
        conflictosEsperados409: samples.filter((s) => s.kind === 'exit' && s.status === 409).length,
        erroresInesperados: unexpected.length,
        detalleInesperados: [...new Set(unexpected)].slice(0, 5),
        saldosNegativos: negative,
        saldosQueNoCuadran: mismatches,
        historialesInvalidos: ledger.length,
        porTipo: byKind,
      };
      report.push(levelReport);

      // Written per level so the evidence survives even if a later level fails.
      mkdirSync('test-results', { recursive: true });
      writeFileSync('test-results/load-report.json', JSON.stringify(report, null, 2));

      expect(unexpected).toEqual([]);
      expect(negative).toBe(0);
      expect(mismatches).toBe(0);
      expect(ledger).toEqual([]);
    }
  }, 300000);
});
