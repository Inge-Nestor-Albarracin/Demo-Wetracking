/*
  Warnings:

  - You are about to drop the `products` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_finishId_fkey";

-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_referenceId_fkey";

-- DropTable
DROP TABLE "products";
