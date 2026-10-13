import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CatalogService } from './catalog.service.js';
import { CreateReferenceDto } from './dto/create-reference.dto.js';
import { UpdateReferenceDto } from './dto/update-reference.dto.js';
import { CreateFinishDto } from './dto/create-finish.dto.js';
import { UpdateFinishDto } from './dto/update-finish.dto.js';
import {
  CreateFamilyDto,
  ListFamiliesQueryDto,
  ListReferencesQueryDto,
  UpdateFamilyDto,
} from './dto/family.dto.js';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Post('references')
  createReference(@Body() dto: CreateReferenceDto) {
    return this.catalog.createReference(dto);
  }

  @Get('references')
  listReferences(@Query() query: ListReferencesQueryDto) {
    return this.catalog.listReferences(query);
  }

  @Get('references/:id')
  getReference(@Param('id') id: string) {
    return this.catalog.getReference(id);
  }

  @Patch('references/:id')
  updateReference(
    @Param('id') id: string,
    @Body() dto: UpdateReferenceDto,
  ) {
    return this.catalog.updateReference(id, dto);
  }

  @Get('families')
  listFamilies(@Query() query: ListFamiliesQueryDto) {
    return this.catalog.listFamilies(query);
  }

  @Post('families')
  createFamily(@Body() dto: CreateFamilyDto) {
    return this.catalog.createFamily(dto);
  }

  @Patch('families/:id')
  updateFamily(
    @Param('id') id: string,
    @Body() dto: UpdateFamilyDto,
  ) {
    return this.catalog.updateFamily(id, dto);
  }

  @Get('finishes')
  listFinishes() {
    return this.catalog.listFinishes();
  }

  @Post('finishes')
  createFinish(@Body() dto: CreateFinishDto) {
    return this.catalog.createFinish(dto);
  }

  @Patch('finishes/:id')
  updateFinish(
    @Param('id') id: string,
    @Body() dto: UpdateFinishDto,
  ) {
    return this.catalog.updateFinish(id, dto);
  }
}
