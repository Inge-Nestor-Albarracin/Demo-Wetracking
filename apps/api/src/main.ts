import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  configureApp(app);

  app.enableShutdownHooks();

  // RFID Demo: port 3001 by default so it never collides with the original API.
  await app.listen(
    Number(process.env.PORT ?? 3001),
    process.env.HOST ?? '0.0.0.0',
  );
}

void bootstrap();
