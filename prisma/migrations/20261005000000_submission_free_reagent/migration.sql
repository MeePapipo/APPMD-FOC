-- Main reagent given free with an order (it is run on the instrument, so it earns the same supporting items).
ALTER TABLE "SubmissionAssayInput" ADD COLUMN "freeTests" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SubmissionReagent" ADD COLUMN "freeQty" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "SubmissionReagent" ADD COLUMN "freeTests" INTEGER NOT NULL DEFAULT 0;
