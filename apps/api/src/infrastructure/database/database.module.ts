import { Module } from '@nestjs/common';
import { DatabaseController } from './database.controller.js';
import { PrismaService } from './prisma.service.js';

@Module({
  controllers: [DatabaseController],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}