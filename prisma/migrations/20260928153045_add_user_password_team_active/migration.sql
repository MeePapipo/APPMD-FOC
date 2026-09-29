-- CreateEnum
CREATE TYPE "Team" AS ENUM ('NORTH', 'SOUTH', 'PRIVATE', 'BUSINESS_PARTNER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "team" "Team";
