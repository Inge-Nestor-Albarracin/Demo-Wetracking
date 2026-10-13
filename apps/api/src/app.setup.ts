import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';

// Shared by main.ts and the e2e tests so both validate requests identically.
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
}
