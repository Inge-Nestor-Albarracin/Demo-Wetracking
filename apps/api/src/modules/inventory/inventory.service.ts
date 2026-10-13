import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { SafeUser } from '../auth/auth.types.js';
import {
  EPC_PATTERN,
  normalizeEpc,
  type RegisterBundleDto,
} from './dto/register-bundle.dto.js';

// Calendar used to decide what "today" is for physical arrival dates.
const BUSINESS_TIME_ZONE = 'America/Bogota';

const bundleDetailInclude = {
  reference: {
    include: {
      family: { select: { id: true, code: true, name: true, active: true } },
    },
  },
  finish: true,
  inventoryLocation: {
    include: {
      branch: { select: { id: true, code: true, name: true, active: true } },
    },
  },
  rack: {
    include: {
      aisle: {
        select: { id: true, number: true, floorNumber: true, active: true },
      },
    },
  },
  movements: {
    orderBy: { occurredAt: 'asc' },
    include: {
      performedBy: { select: { id: true, name: true, role: true } },
    },
  },
} satisfies Prisma.BundleInclude;

type Tx = Prisma.TransactionClient;

interface ArrivalData {
  arrivalDatePrecision: RegisterBundleDto['arrivalDatePrecision'];
  arrivalDate: Date | null;
  arrivalYear: number | null;
  arrivalMonth: number | null;
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  // Creates the bundle and its first movement atomically. The bundle keeps
  // the physical arrival (exact, month or unknown); the movement's
  // occurredAt is the moment it was registered in the system.
  async registerBundle(dto: RegisterBundleDto, user: SafeUser) {
    const arrival = this.parseArrival(dto);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.requireNewEpc(tx, dto.epc);
        await this.requireActiveReference(tx, dto.referenceId);
        await this.requireActiveFinish(tx, dto.finishId);
        await this.requireActiveRackInLocation(
          tx,
          dto.rackId,
          dto.inventoryLocationId,
        );

        const registeredAt = new Date();
        const bundle = await tx.bundle.create({
          data: {
            epc: dto.epc,
            referenceId: dto.referenceId,
            finishId: dto.finishId,
            quantity: dto.quantity,
            inventoryLocationId: dto.inventoryLocationId,
            rackId: dto.rackId,
            ...arrival,
            notes: dto.notes || null,
          },
        });

        await tx.inventoryMovement.create({
          data: {
            bundleId: bundle.id,
            type: dto.registrationType,
            quantity: dto.quantity,
            quantityBefore: 0,
            quantityAfter: dto.quantity,
            destinationLocationId: dto.inventoryLocationId,
            destinationRackId: dto.rackId,
            occurredAt: registeredAt,
            performedById: user.id,
            operationKey: `bundle-registration:${randomUUID()}`,
          },
        });

        return tx.bundle.findUniqueOrThrow({
          where: { id: bundle.id },
          include: bundleDetailInclude,
        });
      });
    } catch (error: unknown) {
      // A concurrent request with the same EPC committed first.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Ya existe un paquete con ese EPC');
      }

      throw error;
    }
  }

  async getBundle(id: string) {
    const bundle = await this.prisma.bundle.findUnique({
      where: { id },
      include: bundleDetailInclude,
    });

    if (!bundle) {
      throw new NotFoundException('El paquete no existe');
    }

    return bundle;
  }

  // Exact lookup. Reading an EPC never creates or changes inventory.
  async getBundleByEpc(rawEpc: string) {
    const epc = normalizeEpc(rawEpc) as string;

    if (!EPC_PATTERN.test(epc) || epc.length > 128) {
      throw new BadRequestException(
        'El EPC solo puede contener letras y números, sin espacios',
      );
    }

    const bundle = await this.prisma.bundle.findUnique({
      where: { epc },
      include: bundleDetailInclude,
    });

    if (!bundle) {
      throw new NotFoundException('No hay un paquete registrado con ese EPC');
    }

    return bundle;
  }

  private parseArrival(dto: RegisterBundleDto): ArrivalData {
    const today = todayIn(BUSINESS_TIME_ZONE);
    const hasDate = dto.arrivalDate !== undefined;
    const hasMonth =
      dto.arrivalYear !== undefined || dto.arrivalMonth !== undefined;

    switch (dto.arrivalDatePrecision) {
      case 'EXACT': {
        if (!hasDate || hasMonth) {
          throw new BadRequestException(
            'Con llegada exacta envía solo arrivalDate (AAAA-MM-DD)',
          );
        }
        const date = new Date(`${dto.arrivalDate}T00:00:00.000Z`);
        if (
          Number.isNaN(date.getTime()) ||
          date.toISOString().slice(0, 10) !== dto.arrivalDate
        ) {
          throw new BadRequestException('arrivalDate no es una fecha válida');
        }
        if (dto.arrivalDate! > today) {
          throw new BadRequestException(
            'La fecha de llegada no puede ser futura',
          );
        }
        return {
          arrivalDatePrecision: 'EXACT',
          arrivalDate: date,
          arrivalYear: null,
          arrivalMonth: null,
        };
      }
      case 'MONTH': {
        if (
          hasDate ||
          dto.arrivalYear === undefined ||
          dto.arrivalMonth === undefined
        ) {
          throw new BadRequestException(
            'Con llegada mensual envía solo arrivalYear y arrivalMonth',
          );
        }
        const month = `${dto.arrivalYear}-${String(dto.arrivalMonth).padStart(2, '0')}`;
        if (month > today.slice(0, 7)) {
          throw new BadRequestException(
            'El mes de llegada no puede ser futuro',
          );
        }
        return {
          arrivalDatePrecision: 'MONTH',
          arrivalDate: null,
          arrivalYear: dto.arrivalYear,
          arrivalMonth: dto.arrivalMonth,
        };
      }
      case 'UNKNOWN': {
        if (hasDate || hasMonth) {
          throw new BadRequestException(
            'Con llegada desconocida no envíes fecha, año ni mes',
          );
        }
        return {
          arrivalDatePrecision: 'UNKNOWN',
          arrivalDate: null,
          arrivalYear: null,
          arrivalMonth: null,
        };
      }
    }
  }

  private async requireNewEpc(tx: Tx, epc: string) {
    const existing = await tx.bundle.findUnique({
      where: { epc },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Ya existe un paquete con ese EPC');
    }
  }

  private async requireActiveReference(tx: Tx, id: string) {
    const reference = await tx.reference.findUnique({ where: { id } });
    if (!reference) throw new NotFoundException('La referencia no existe');
    if (!reference.active) {
      throw new BadRequestException('La referencia está inactiva');
    }
  }

  private async requireActiveFinish(tx: Tx, id: string) {
    const finish = await tx.finish.findUnique({ where: { id } });
    if (!finish) throw new NotFoundException('El color no existe');
    if (!finish.active) throw new BadRequestException('El color está inactivo');
  }

  private async requireActiveRackInLocation(
    tx: Tx,
    rackId: string,
    inventoryLocationId: string,
  ) {
    const location = await tx.inventoryLocation.findUnique({
      where: { id: inventoryLocationId },
      include: { branch: { select: { active: true } } },
    });
    if (!location) throw new NotFoundException('La ubicación no existe');
    if (!location.active || !location.branch.active) {
      throw new BadRequestException('La ubicación o su sucursal está inactiva');
    }

    const rack = await tx.rack.findUnique({
      where: { id: rackId },
      include: {
        aisle: {
          select: { active: true, inventoryLocationId: true },
        },
      },
    });
    if (!rack) throw new NotFoundException('El burro no existe');
    if (rack.aisle.inventoryLocationId !== inventoryLocationId) {
      throw new BadRequestException(
        'El burro no pertenece a la ubicación seleccionada',
      );
    }
    if (!rack.active || !rack.aisle.active) {
      throw new BadRequestException('El burro o su pasillo está inactivo');
    }
  }
}

function todayIn(timeZone: string): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
