/**
 * Loads a backup made by backup-neon.ts into a PostgreSQL database whose schema
 * already exists (run `prisma migrate deploy` first). Every table in the backup
 * is loaded in one transaction; foreign keys are not checked while loading
 * (session_replication_role = replica, needs a superuser or equivalent), and the
 * result is compared against manifest.json before COMMIT, so a bad load rolls back.
 *
 * Tables must be empty. `_prisma_migrations` is skipped: migrate deploy owns it.
 *
 * Run: DATABASE_URL=<target url> npm run restore-backup -- <backup dir>
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
const dir = process.argv[2];
if (!url || !dir) throw new Error("Usage: DATABASE_URL=<url> npm run restore-backup -- <backup dir>");

const manifest: { rowCounts: Record<string, number> } = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));

async function main() {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    for (const [table, expected] of Object.entries(manifest.rowCounts)) {
      if (table === "_prisma_migrations") continue;
      const { rows: cols } = await client.query<{ column_name: string; data_type: string }>(
        "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
        [table],
      );
      if (!cols.length) throw new Error(`Table ${table} is in the backup but not in the target schema`);
      const types = new Map(cols.map((c) => [c.column_name, c.data_type]));
      const lines = readFileSync(path.join(dir, `${table}.jsonl`), "utf8").split("\n").filter(Boolean);
      for (const line of lines) {
        const row = JSON.parse(line) as Record<string, unknown>;
        const keys = Object.keys(row);
        const unknown = keys.filter((k) => !types.has(k));
        if (unknown.length) throw new Error(`${table}: column(s) not in target schema: ${unknown.join(", ")}`);
        // pg turns JS arrays into Postgres arrays; json/jsonb columns need the text form instead.
        const values = keys.map((k) => {
          const v = row[k];
          return v !== null && typeof v === "object" && /json/.test(types.get(k)!) ? JSON.stringify(v) : v;
        });
        await client.query(
          `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`,
          values,
        );
      }
      const { rows } = await client.query<{ n: string }>(`SELECT count(*) AS n FROM "${table}"`);
      const got = Number(rows[0].n);
      if (got !== expected) throw new Error(`${table}: loaded ${got} rows, backup manifest says ${expected}`);
      console.log(`${table}: ${got}`);
    }
    await client.query("COMMIT");
    console.log("\nRestore committed; every table matches the manifest.");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
