import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { AssetsModule } from './modules/assets/assets.module.js';

@Module({
  imports: [DatabaseModule, AuthModule, UsersModule, AssetsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
