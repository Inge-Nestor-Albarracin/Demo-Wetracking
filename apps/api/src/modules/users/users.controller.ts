import { Body, Controller, Get, Param, Patch, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../auth/auth.metadata.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { CreateUserDto, UpdateUserActiveDto } from './dto/user.dto.js';
import { UsersService } from './users.service.js';

@Roles('ADMIN')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list() {
    return this.usersService.list();
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id/active')
  setActive(
    @Param('id') id: string,
    @Body() dto: UpdateUserActiveDto,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!request.user) throw new UnauthorizedException();
    return this.usersService.setActive(id, dto.active, request.user.id);
  }
}
