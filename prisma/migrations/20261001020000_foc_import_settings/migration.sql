-- CreateTable
CREATE TABLE "FocImportSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "allowedProductLines" TEXT[] DEFAULT ARRAY['MOLECULAR LAB']::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FocImportSettings_pkey" PRIMARY KEY ("id")
);

