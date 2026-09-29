-- CreateTable
CREATE TABLE "FocActual" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "team" TEXT,
    "rep" TEXT,
    "accountName" TEXT NOT NULL,
    "materialNo" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revenueQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "soldQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "focCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "focQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bonusCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bonusQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tests" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "importedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FocActual_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FocActual_year_month_idx" ON "FocActual"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "FocActual_year_month_accountName_materialNo_productName_key" ON "FocActual"("year", "month", "accountName", "materialNo", "productName");
