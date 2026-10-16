/**
 * Full data backup of a Neon database over a WebSocket on port 443, for networks
 * where pg_dump can't reach Neon's Postgres port. Every table in the public
 * schema is written as one JSON-lines file, plus a manifest with row counts so
 * the backup can be checked against the live database.
 *
 * The backup holds real user data (password hashes included): it goes outside
 * the repo, in a 0700 directory with 0600 files. Never commit it.
 *
 * Run: DATABASE_URL=<neon url> NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt npm run backup-neon
 * Optional: BACKUP_DIR=<dir> (default ~/foc-backups/neon-<timestamp>)
 */
import "dotenv/config";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL to the Neon connection string.");
neonConfig.webSocketConstructor = ws;

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dir = process.env.BACKUP_DIR ?? path.join(os.homedir(), "foc-backups", `neon-${stamp}`);

async function main() {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const pool = new Pool({ connectionString: url });
  const db = await pool.connect();
  try {
    // One snapshot for every table, so rows stay consistent with each other.
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const { rows: tables } = await db.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );
    const manifest: Record<string, number> = {};
    for (const { tablename } of tables) {
      const { rows } = await db.query(`SELECT * FROM "${tablename}"`);
      const file = path.join(dir, `${tablename}.jsonl`);
      writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""), { mode: 0o600 });
      manifest[tablename] = rows.length;
      console.log(`${tablename}: ${rows.length}`);
    }
    await db.query("COMMIT");
    const mf = path.join(dir, "manifest.json");
    writeFileSync(mf, JSON.stringify({ takenAt: new Date().toISOString(), rowCounts: manifest }, null, 2), { mode: 0o600 });
    chmodSync(dir, 0o700);
    console.log(`\nBackup written to ${dir}`);
  } finally {
    db.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
