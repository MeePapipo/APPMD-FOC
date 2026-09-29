// Starts a userland PostgreSQL (embedded-postgres) for local dev / verification.
// No sudo/docker required. Data lives in .pgdata (gitignored). Ctrl+C to stop.
import EmbeddedPostgres from "embedded-postgres";

const PORT = Number(process.env.PGPORT ?? 5432);
const pg = new EmbeddedPostgres({
  databaseDir: "./.pgdata",
  user: "postgres",
  password: "postgres",
  port: PORT,
  persistent: true,
});

const { existsSync } = await import("node:fs");
if (!existsSync("./.pgdata/PG_VERSION")) {
  console.log("Initialising cluster...");
  await pg.initialise();
}
await pg.start();
try {
  await pg.createDatabase("focwebapp");
  console.log("Created database 'focwebapp'.");
} catch {
  console.log("Database 'focwebapp' already exists.");
}
console.log(`PostgreSQL ready on port ${PORT}. DATABASE_URL=postgresql://postgres:postgres@localhost:${PORT}/focwebapp?schema=public`);

process.on("SIGINT", async () => {
  await pg.stop();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await pg.stop();
  process.exit(0);
});
// keep alive
setInterval(() => {}, 1 << 30);
