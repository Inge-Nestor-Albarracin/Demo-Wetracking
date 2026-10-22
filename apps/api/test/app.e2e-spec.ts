import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/infrastructure/database/prisma.service.js';
import { createE2eApp, createTestUser, uniqueSuffix } from './support/e2e.js';

describe('AppController (e2e)', () => {
  const suffix = uniqueSuffix();
  let app: INestApplication<App>;
  let userId: string | undefined;
  let headers: Record<string, string>;

  beforeAll(async () => {
    app = await createE2eApp();
    const user = await createTestUser(app, 'OPERATOR', suffix);
    userId = user.id;
    headers = user.headers;
  });

  afterAll(async () => {
    if (app && userId) {
      await app.get(PrismaService).user.deleteMany({ where: { id: userId } });
    }
    await app?.close();
  });

  it('/ (GET) requires a session', () => {
    return request(app.getHttpServer()).get('/').expect(401);
  });

  it('/ (GET) with a session', () => {
    return request(app.getHttpServer())
      .get('/')
      .set(headers)
      .expect(200)
      .expect('Hello World!');
  });
});
