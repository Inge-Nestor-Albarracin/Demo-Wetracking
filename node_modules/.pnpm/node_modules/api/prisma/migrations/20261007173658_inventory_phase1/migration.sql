-- CreateEnum
CREATE TYPE "InventoryLocationType" AS ENUM ('WAREHOUSE', 'RETAIL_STORE');

-- CreateEnum
CREATE TYPE "ArrivalDatePrecision" AS ENUM ('EXACT', 'MONTH', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('INITIAL_STOCK', 'ENTRY', 'EXIT', 'TRANSFER', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'WAREHOUSE', 'SALES', 'READ_ONLY');

-- AlterTable
ALTER TABLE "aisles" ADD COLUMN     "floorNumber" INTEGER;

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "address" TEXT;

-- AlterTable
ALTER TABLE "warehouses" ADD COLUMN     "type" "InventoryLocationType" NOT NULL DEFAULT 'WAREHOUSE';

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'READ_ONLY',
    "defaultInventoryLocationId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bundles" (
    "id" TEXT NOT NULL,
    "epc" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "finishId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "inventoryLocationId" TEXT NOT NULL,
    "rackId" TEXT,
    "arrivalDate" DATE,
    "arrivalYear" INTEGER,
    "arrivalMonth" INTEGER,
    "arrivalDatePrecision" "ArrivalDatePrecision" NOT NULL DEFAULT 'UNKNOWN',
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "quantityBefore" INTEGER NOT NULL,
    "quantityAfter" INTEGER NOT NULL,
    "sourceLocationId" TEXT,
    "destinationLocationId" TEXT,
    "sourceRackId" TEXT,
    "destinationRackId" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "performedById" TEXT NOT NULL,
    "reason" TEXT,
    "operationKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_defaultInventoryLocationId_idx" ON "users"("defaultInventoryLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "bundles_epc_key" ON "bundles"("epc");

-- CreateIndex
CREATE INDEX "bundles_referenceId_finishId_inventoryLocationId_idx" ON "bundles"("referenceId", "finishId", "inventoryLocationId");

-- CreateIndex
CREATE INDEX "bundles_finishId_idx" ON "bundles"("finishId");

-- CreateIndex
CREATE INDEX "bundles_inventoryLocationId_idx" ON "bundles"("inventoryLocationId");

-- CreateIndex
CREATE INDEX "bundles_rackId_idx" ON "bundles"("rackId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_movements_operationKey_key" ON "inventory_movements"("operationKey");

-- CreateIndex
CREATE INDEX "inventory_movements_bundleId_occurredAt_idx" ON "inventory_movements"("bundleId", "occurredAt");

-- CreateIndex
CREATE INDEX "inventory_movements_performedById_idx" ON "inventory_movements"("performedById");

-- CreateIndex
CREATE INDEX "inventory_movements_type_occurredAt_idx" ON "inventory_movements"("type", "occurredAt");

-- CreateIndex
CREATE INDEX "inventory_movements_sourceLocationId_idx" ON "inventory_movements"("sourceLocationId");

-- CreateIndex
CREATE INDEX "inventory_movements_destinationLocationId_idx" ON "inventory_movements"("destinationLocationId");

-- CreateIndex
CREATE INDEX "inventory_movements_sourceRackId_idx" ON "inventory_movements"("sourceRackId");

-- CreateIndex
CREATE INDEX "inventory_movements_destinationRackId_idx" ON "inventory_movements"("destinationRackId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_defaultInventoryLocationId_fkey" FOREIGN KEY ("defaultInventoryLocationId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundles" ADD CONSTRAINT "bundles_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "references"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundles" ADD CONSTRAINT "bundles_finishId_fkey" FOREIGN KEY ("finishId") REFERENCES "finishes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundles" ADD CONSTRAINT "bundles_inventoryLocationId_fkey" FOREIGN KEY ("inventoryLocationId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundles" ADD CONSTRAINT "bundles_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "racks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "bundles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_sourceRackId_fkey" FOREIGN KEY ("sourceRackId") REFERENCES "racks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_destinationRackId_fkey" FOREIGN KEY ("destinationRackId") REFERENCES "racks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public.bundles
ADD CONSTRAINT bundles_quantity_nonnegative
CHECK (quantity >= 0);

ALTER TABLE public.bundles
ADD CONSTRAINT bundles_epc_normalized
CHECK (
    length(epc) > 0
    AND epc = upper(btrim(epc))
);

ALTER TABLE public.bundles
ADD CONSTRAINT bundles_arrival_date_consistent
CHECK (
    CASE "arrivalDatePrecision"
        WHEN 'EXACT' THEN
            "arrivalDate" IS NOT NULL
            AND "arrivalYear" IS NULL
            AND "arrivalMonth" IS NULL
        WHEN 'MONTH' THEN
            "arrivalDate" IS NULL
            AND "arrivalYear" IS NOT NULL
            AND "arrivalYear" BETWEEN 1 AND 9999
            AND "arrivalMonth" IS NOT NULL
            AND "arrivalMonth" BETWEEN 1 AND 12
        WHEN 'UNKNOWN' THEN
            "arrivalDate" IS NULL
            AND "arrivalYear" IS NULL
            AND "arrivalMonth" IS NULL
        ELSE false
    END
);

ALTER TABLE public.inventory_movements
ADD CONSTRAINT inventory_movements_quantities_valid
CHECK (
    quantity > 0
    AND "quantityBefore" >= 0
    AND "quantityAfter" >= 0
);

ALTER TABLE public.inventory_movements
ADD CONSTRAINT inventory_movements_balance_consistent
CHECK (
    CASE type
        WHEN 'INITIAL_STOCK' THEN
            "quantityBefore" = 0
            AND "quantityAfter" = quantity
        WHEN 'ENTRY' THEN
            "quantityAfter" = "quantityBefore" + quantity
        WHEN 'ADJUSTMENT_IN' THEN
            "quantityAfter" = "quantityBefore" + quantity
        WHEN 'EXIT' THEN
            "quantityAfter" = "quantityBefore" - quantity
        WHEN 'ADJUSTMENT_OUT' THEN
            "quantityAfter" = "quantityBefore" - quantity
        WHEN 'TRANSFER' THEN
            "quantityAfter" = "quantityBefore"
            AND quantity = "quantityBefore"
        ELSE false
    END
);