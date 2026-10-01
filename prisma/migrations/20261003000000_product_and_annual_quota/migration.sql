-- DropIndex
DROP INDEX "FocActual_year_month_idx";

-- AlterTable
ALTER TABLE "FocImportSettings" ADD COLUMN     "formulaProducts" TEXT[] DEFAULT ARRAY['MOLECULAR LAB']::TEXT[],
ALTER COLUMN "allowedProductLines" SET DEFAULT ARRAY['MOLECULAR LAB', 'PATHOLOGY LAB', 'CORE LAB']::TEXT[];

-- AlterTable
ALTER TABLE "FocActual" ADD COLUMN     "annualQuota" DOUBLE PRECISION,
ADD COLUMN     "product" TEXT;

