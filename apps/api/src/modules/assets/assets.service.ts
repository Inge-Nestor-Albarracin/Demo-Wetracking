import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type {
  CreateAssetDto,
  ListAssetsQueryDto,
  UpdateAssetDto,
} from './dto/asset.dto.js';

const ASSET_SELECT = {
  id: true, epc: true, name: true, description: true, category: true,
  location: true, active: true, createdAt: true, updatedAt: true,
  createdBy: { select: { id: true, name: true } },
} as const;

const DEFAULT_PAGE_SIZE = 20;

const isKnownError = (error: unknown, code: string) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  // One asset per EPC. Concurrent requests with the same EPC are decided by
  // the unique constraint: one succeeds, the others receive a 409 that points
  // to the existing asset (never overwritten).
  async create(dto: CreateAssetDto, userId: string) {
    try {
      return await this.prisma.asset.create({
        data: {
          epc: dto.epc,
          name: dto.name,
          description: dto.description ?? null,
          category: dto.category ?? null,
          location: dto.location ?? null,
          createdById: userId,
        },
        select: ASSET_SELECT,
      });
    } catch (error: unknown) {
      if (isKnownError(error, 'P2002')) {
        const existing = await this.prisma.asset.findUnique({
          where: { epc: dto.epc },
          select: { id: true, name: true, active: true },
        });
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: 'Ese EPC ya está registrado en otro activo',
          existingAsset: existing,
        });
      }
      throw error;
    }
  }

  // Filters run on the whole table. `filtered` uses exactly the same
  // conditions as `items`; `totals` covers every registered asset.
  async list(query: ListAssetsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where: Prisma.AssetWhereInput = {
      ...(query.name && { name: { contains: query.name, mode: 'insensitive' } }),
      ...(query.epc && { epc: { contains: query.epc } }),
      ...(query.category && { category: { contains: query.category, mode: 'insensitive' } }),
      ...(query.location && { location: { contains: query.location, mode: 'insensitive' } }),
      ...(query.status === 'active' && { active: true }),
      ...(query.status === 'inactive' && { active: false }),
    };

    const [items, filteredByStatus, totalsByStatus] = await this.prisma.$transaction([
      this.prisma.asset.findMany({
        where,
        select: ASSET_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.asset.groupBy({ by: ['active'], where, _count: { _all: true }, orderBy: { active: 'asc' } }),
      this.prisma.asset.groupBy({ by: ['active'], _count: { _all: true }, orderBy: { active: 'asc' } }),
    ]);

    const summarize = (groups: { active: boolean; _count: { _all: number } }[]) => {
      const active = groups.find((g) => g.active)?._count._all ?? 0;
      const inactive = groups.find((g) => !g.active)?._count._all ?? 0;
      return { total: active + inactive, active, inactive };
    };
    const filtered = summarize(filteredByStatus as { active: boolean; _count: { _all: number } }[]);

    return {
      items,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(filtered.total / pageSize)),
      filtered,
      totals: summarize(totalsByStatus as { active: boolean; _count: { _all: number } }[]),
    };
  }

  async findById(id: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id }, select: ASSET_SELECT });
    if (!asset) throw new NotFoundException('El activo no existe');
    return asset;
  }

  async findByEpc(epc: string) {
    const asset = await this.prisma.asset.findUnique({ where: { epc }, select: ASSET_SELECT });
    if (!asset) throw new NotFoundException('No hay un activo registrado con ese EPC');
    return asset;
  }

  // Bulk reading: read-only. Inactive assets are returned with their status;
  // unknown EPCs are only reported, never registered.
  async resolve(epcs: string[]) {
    const unique = [...new Set(epcs)];
    const found = await this.prisma.asset.findMany({
      where: { epc: { in: unique } },
      select: ASSET_SELECT,
    });
    const known = new Set(found.map((asset) => asset.epc));
    return { found, unknown: unique.filter((epc) => !known.has(epc)) };
  }

  async update(id: string, dto: UpdateAssetDto) {
    try {
      return await this.prisma.asset.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.category !== undefined && { category: dto.category }),
          ...(dto.location !== undefined && { location: dto.location }),
        },
        select: ASSET_SELECT,
      });
    } catch (error: unknown) {
      if (isKnownError(error, 'P2025')) throw new NotFoundException('El activo no existe');
      throw error;
    }
  }

  async setActive(id: string, active: boolean) {
    try {
      return await this.prisma.asset.update({ where: { id }, data: { active }, select: ASSET_SELECT });
    } catch (error: unknown) {
      if (isKnownError(error, 'P2025')) throw new NotFoundException('El activo no existe');
      throw error;
    }
  }
}
