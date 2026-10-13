import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Roles } from '../auth/auth.metadata.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { RegisterBundleDto } from './dto/register-bundle.dto.js';
import { InventoryService } from './inventory.service.js';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  // The responsible user always comes from the session, never from the body.
  @Roles('ADMIN', 'WAREHOUSE')
  @Post('bundles')
  registerBundle(
    @Body() dto: RegisterBundleDto,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!request.user) throw new UnauthorizedException();
    return this.inventory.registerBundle(dto, request.user);
  }

  @Get('bundles/epc/:epc')
  getBundleByEpc(@Param('epc') epc: string) {
    return this.inventory.getBundleByEpc(epc);
  }

  @Get('bundles/:id')
  getBundle(@Param('id') id: string) {
    return this.inventory.getBundle(id);
  }
}
