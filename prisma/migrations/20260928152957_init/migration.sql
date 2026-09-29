-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "System" AS ENUM ('S6800', 'S5800', 'S4800');

-- CreateEnum
CREATE TYPE "Driver" AS ENUM ('BATCH', 'TEST');

-- CreateEnum
CREATE TYPE "LineSource" AS ENUM ('CALCULATED', 'MANUAL');

-- CreateEnum
CREATE TYPE "ForecastStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('SUBMITTED', 'VOID');

-- CreateTable
CREATE TABLE "MasterAssay" (
    "id" TEXT NOT NULL,
    "system" "System" NOT NULL,
    "code" TEXT NOT NULL,
    "srcRow" INTEGER NOT NULL,
    "batchRow" INTEGER,
    "batchLabel" TEXT,
    "category" TEXT,
    "materialNo" TEXT NOT NULL,
    "dkshCode" TEXT,
    "description" TEXT NOT NULL,
    "usageType" TEXT,
    "usageGroup" TEXT,
    "packText" TEXT,
    "packSize" INTEGER NOT NULL,
    "unitText" TEXT,
    "price" DOUBLE PRECISION,
    "pricePerTest" DOUBLE PRECISION,
    "testsPerBatchDefault" INTEGER,
    "negCode" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterAssay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterItem" (
    "id" TEXT NOT NULL,
    "system" "System" NOT NULL,
    "srcRow" INTEGER,
    "group" TEXT NOT NULL,
    "category" TEXT,
    "materialNo" TEXT NOT NULL,
    "dkshCode" TEXT,
    "description" TEXT NOT NULL,
    "usageType" TEXT,
    "usageGroup" TEXT,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "onDemand" BOOLEAN NOT NULL DEFAULT false,
    "packText" TEXT,
    "packSize" INTEGER NOT NULL,
    "consumption" DOUBLE PRECISION NOT NULL,
    "coverage" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitText" TEXT,
    "price" DOUBLE PRECISION,
    "priceText" TEXT,
    "driver" "Driver" NOT NULL,
    "appliesTo" TEXT[],
    "appliesToAll" BOOLEAN NOT NULL DEFAULT false,
    "weights" JSONB,
    "srcFormula" TEXT,
    "fixNote" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdditionalFocItem" (
    "id" TEXT NOT NULL,
    "materialNo" TEXT NOT NULL,
    "dkshCode" TEXT,
    "description" TEXT NOT NULL,
    "packSize" INTEGER NOT NULL,
    "unitText" TEXT,
    "price" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdditionalFocItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TpbSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "floor6800" INTEGER NOT NULL DEFAULT 24,
    "floor5800" INTEGER NOT NULL DEFAULT 6,
    "method" TEXT,
    "asOf" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TpbSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TpbEntry" (
    "id" TEXT NOT NULL,
    "system" "System" NOT NULL,
    "code" TEXT NOT NULL,
    "tpb" DOUBLE PRECISION NOT NULL,
    "confidence" TEXT NOT NULL,
    "monthsWithData" TEXT,
    "totalRuns" INTEGER,
    "totalSamples" INTEGER,
    "notes" TEXT,
    "asOf" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TpbEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "province" TEXT,
    "salesRepEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "createdById" TEXT,
    "createdByEmail" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "deductStock" BOOLEAN NOT NULL DEFAULT false,
    "revenue" DECIMAL(14,2) NOT NULL,
    "focValue" DECIMAL(14,2) NOT NULL,
    "focPct" DECIMAL(7,4) NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "editedById" TEXT,
    "editedByEmail" TEXT,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionAssayInput" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "system" "System" NOT NULL,
    "assayCode" TEXT NOT NULL,
    "tests" INTEGER NOT NULL,

    CONSTRAINT "SubmissionAssayInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionReagent" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "assayCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "materialNo" TEXT NOT NULL,
    "dkshCode" TEXT,
    "systems" "System"[],
    "tests" INTEGER NOT NULL,
    "packSize" INTEGER NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION,
    "lineValue" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "SubmissionReagent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionLine" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "materialNo" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "unitText" TEXT,
    "source" "LineSource" NOT NULL DEFAULT 'CALCULATED',
    "driver" "Driver",
    "systems" "System"[],
    "calculatedQty" DOUBLE PRECISION NOT NULL,
    "stockOnHand" DOUBLE PRECISION,
    "afterStockQty" DOUBLE PRECISION,
    "adjustedQty" DOUBLE PRECISION,
    "adjustComment" TEXT,
    "finalQty" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION,
    "lineValue" DECIMAL(14,2) NOT NULL,
    "onDemand" BOOLEAN NOT NULL DEFAULT false,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnualForecast" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "ForecastStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdByEmail" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedByEmail" TEXT,
    "decidedAt" TIMESTAMP(3),
    "adminComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnualForecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastLine" (
    "id" TEXT NOT NULL,
    "forecastId" TEXT NOT NULL,
    "system" "System" NOT NULL,
    "assayCode" TEXT NOT NULL,
    "annualTests" INTEGER NOT NULL,

    CONSTRAINT "ForecastLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quota" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "materialNo" TEXT NOT NULL,
    "allottedQty" DOUBLE PRECISION NOT NULL,
    "forecastId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MasterAssay_system_idx" ON "MasterAssay"("system");

-- CreateIndex
CREATE UNIQUE INDEX "MasterAssay_system_code_key" ON "MasterAssay"("system", "code");

-- CreateIndex
CREATE INDEX "MasterItem_materialNo_idx" ON "MasterItem"("materialNo");

-- CreateIndex
CREATE INDEX "MasterItem_system_idx" ON "MasterItem"("system");

-- CreateIndex
CREATE UNIQUE INDEX "MasterItem_system_materialNo_key" ON "MasterItem"("system", "materialNo");

-- CreateIndex
CREATE UNIQUE INDEX "AdditionalFocItem_materialNo_key" ON "AdditionalFocItem"("materialNo");

-- CreateIndex
CREATE UNIQUE INDEX "TpbEntry_system_code_key" ON "TpbEntry"("system", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Account_accountNumber_key" ON "Account"("accountNumber");

-- CreateIndex
CREATE INDEX "Account_accountName_idx" ON "Account"("accountName");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Submission_accountNumber_idx" ON "Submission"("accountNumber");

-- CreateIndex
CREATE INDEX "Submission_createdByEmail_idx" ON "Submission"("createdByEmail");

-- CreateIndex
CREATE INDEX "Submission_year_idx" ON "Submission"("year");

-- CreateIndex
CREATE INDEX "Submission_createdAt_idx" ON "Submission"("createdAt");

-- CreateIndex
CREATE INDEX "SubmissionAssayInput_submissionId_idx" ON "SubmissionAssayInput"("submissionId");

-- CreateIndex
CREATE INDEX "SubmissionReagent_submissionId_idx" ON "SubmissionReagent"("submissionId");

-- CreateIndex
CREATE INDEX "SubmissionLine_submissionId_idx" ON "SubmissionLine"("submissionId");

-- CreateIndex
CREATE INDEX "SubmissionLine_materialNo_idx" ON "SubmissionLine"("materialNo");

-- CreateIndex
CREATE UNIQUE INDEX "AnnualForecast_accountId_year_key" ON "AnnualForecast"("accountId", "year");

-- CreateIndex
CREATE INDEX "ForecastLine_forecastId_idx" ON "ForecastLine"("forecastId");

-- CreateIndex
CREATE UNIQUE INDEX "Quota_accountId_year_materialNo_key" ON "Quota"("accountId", "year", "materialNo");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionAssayInput" ADD CONSTRAINT "SubmissionAssayInput_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionReagent" ADD CONSTRAINT "SubmissionReagent_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionLine" ADD CONSTRAINT "SubmissionLine_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualForecast" ADD CONSTRAINT "AnnualForecast_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualForecast" ADD CONSTRAINT "AnnualForecast_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastLine" ADD CONSTRAINT "ForecastLine_forecastId_fkey" FOREIGN KEY ("forecastId") REFERENCES "AnnualForecast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quota" ADD CONSTRAINT "Quota_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

