import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AssetsController } from './assets.controller.js';
import { AssetsService } from './assets.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AssetsController],
  providers: [AssetsService],
})
export class AssetsModule {}
