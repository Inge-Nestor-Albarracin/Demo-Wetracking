import {
  BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Roles } from '../auth/auth.metadata.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { AssetsService } from './assets.service.js';
import {
  CreateAssetDto,
  EPC_PATTERN,
  ListAssetsQueryDto,
  normalizeEpc,
  ResolveEpcsDto,
  UpdateAssetActiveDto,
  UpdateAssetDto,
} from './dto/asset.dto.js';

// Reads: any authenticated user (RolesGuard default).
// Register and resolve reads: ADMIN and OPERATOR.
// Edit and activate/deactivate: ADMIN only (RolesGuard default for writes).
@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Roles('ADMIN', 'OPERATOR')
  @Post()
  create(@Body() dto: CreateAssetDto, @Req() request: AuthenticatedRequest) {
    if (!request.user) throw new UnauthorizedException();
    return this.assetsService.create(dto, request.user.id);
  }

  @Get()
  list(@Query() query: ListAssetsQueryDto) {
    return this.assetsService.list(query);
  }

  @Roles('ADMIN', 'OPERATOR')
  @Post('resolve')
  @HttpCode(HttpStatus.OK)
  resolve(@Body() dto: ResolveEpcsDto) {
    return this.assetsService.resolve(dto.epcs);
  }

  @Get('by-epc/:epc')
  findByEpc(@Param('epc') raw: string) {
    const epc = normalizeEpc(raw) as string;
    if (!EPC_PATTERN.test(epc) || epc.length > 128) {
      throw new BadRequestException('El EPC solo puede contener letras y números, sin espacios');
    }
    return this.assetsService.findByEpc(epc);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.assetsService.findById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAssetDto) {
    return this.assetsService.update(id, dto);
  }

  @Patch(':id/active')
  setActive(@Param('id') id: string, @Body() dto: UpdateAssetActiveDto) {
    return this.assetsService.setActive(id, dto.active);
  }
}
