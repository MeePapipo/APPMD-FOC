-- AlterTable
ALTER TABLE "TpbSettings" ADD COLUMN     "accountFloorRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
ADD COLUMN     "accountMinRuns" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "accountWindowMonths" INTEGER NOT NULL DEFAULT 4;

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "tpbBasis" JSONB;

-- CreateTable
CREATE TABLE "AlertSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "overPct6800" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "overPct5800" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "minOverUnits" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "systemClass" TEXT NOT NULL,
    "labName" TEXT,
    "accountId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstrumentUsageMonth" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "assayCode" TEXT NOT NULL,
    "runs" INTEGER NOT NULL,
    "samples" INTEGER NOT NULL,

    CONSTRAINT "InstrumentUsageMonth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Instrument_accountId_idx" ON "Instrument"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_serial_systemClass_key" ON "Instrument"("serial", "systemClass");

-- CreateIndex
CREATE INDEX "InstrumentUsageMonth_month_idx" ON "InstrumentUsageMonth"("month");

-- CreateIndex
CREATE UNIQUE INDEX "InstrumentUsageMonth_instrumentId_month_assayCode_key" ON "InstrumentUsageMonth"("instrumentId", "month", "assayCode");

-- AddForeignKey
ALTER TABLE "Instrument" ADD CONSTRAINT "Instrument_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstrumentUsageMonth" ADD CONSTRAINT "InstrumentUsageMonth_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

