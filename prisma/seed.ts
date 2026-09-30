// Entry point Prisma CLI calls after `migrate dev`/`migrate reset` (see
// prisma.config.ts's migrations.seed). Delegates to the real import scripts.
// Each uses its own PrismaClient instance (see scripts/*.ts), so importing
// both here runs them independently rather than racing on a shared connection.
//
// import-foc-excel reads ~/foc-excel/data, so this only works on the dev
// machine. To load a production DB (Neon), run `npm run copy-reference-data`
// from the dev machine instead — it also carries over admin-console edits and
// FocActual imports, which this seed knows nothing about.
import "../scripts/import-foc-excel";
import "../scripts/seed-admin";
