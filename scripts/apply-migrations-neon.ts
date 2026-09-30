/**
 * Applies prisma/migrations/*\/migration.sql to a Neon database over a
 * WebSocket on port 443, for networks where `prisma migrate deploy` can't reach
 * Neon's Postgres port. It also records each migration in `_prisma_migrations`
 * (same checksum Prisma uses), so a later `prisma migrate deploy` from a normal
 * network sees them as already applied instead of re-running them.
 *
 * Migrations already recorded are skipped, so rerunning is safe.
 *
 * Run: DATABASE_URL=<neon url> npm run apply-migrations-neon
 */
import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL to the Neon connection string.");
neonConfig.webSocketConstructor = ws;

const dir = path.join(process.cwd(), "prisma", "migrations");
const names = readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

async function main() {
  const pool = new Pool({ connectionString: url });
  const db = await pool.connect();
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )`);
    const done = new Set(
      (await db.query(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`)).rows.map(
        (r) => r.migration_name as string,
      ),
    );
    for (const name of names) {
      if (done.has(name)) {
        console.log(`skip   ${name} (already applied)`);
        continue;
      }
      const sql = readFileSync(path.join(dir, name, "migration.sql"), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      await db.query("BEGIN");
      try {
        await db.query(sql);
        await db.query(
          `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
           VALUES ($1, $2, now(), $3, 1)`,
          [randomUUID(), checksum, name],
        );
        await db.query("COMMIT");
        console.log(`apply  ${name}`);
      } catch (e) {
        await db.query("ROLLBACK");
        throw new Error(`Migration ${name} failed and was rolled back: ${(e as Error).message}`);
      }
    }
  } finally {
    db.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
