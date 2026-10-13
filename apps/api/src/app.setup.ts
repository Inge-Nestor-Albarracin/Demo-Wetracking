import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';

// Local Vite dev server. Override with CORS_ORIGIN (comma-separated list).
const DEFAULT_CORS_ORIGIN = 'http://localhost:5173';

export function corsOrigins(): string[] {
  return (process.env.CORS_ORIGIN ?? DEFAULT_CORS_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

// Shared by main.ts and the e2e tests so both validate requests identically.
export function configureApp(app: INestApplication): void {
  // The token travels in the Authorization header; no cookies are used.
  app.enableCors({
    origin: corsOrigins(),
    methods: ['GET', 'POST', 'PATCH'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: false,
    maxAge: 600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
}
