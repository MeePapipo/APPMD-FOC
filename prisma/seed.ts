// Entry point Prisma CLI calls after `migrate dev`/`migrate reset` (see
// prisma.config.ts's migrations.seed). Delegates to the real import scripts.
// Each uses its own PrismaClient instance (see scripts/*.ts), so importing
// both here runs them independently rather than racing on a shared connection.
import "../scripts/import-foc-excel";
import "../scripts/seed-admin";
