import "dotenv/config";
import path from "node:path";
import { defineConfig, env } from "prisma/config";

// Prisma 7 moved the connection URL out of schema.prisma. The URL here is used
// by the Prisma CLI (migrate / db push / introspection). The runtime client is
// constructed with a driver adapter — see src/lib/prisma.ts.
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    // `prisma migrate deploy` needs a direct (non-pooled) connection: an advisory lock does not survive Neon's
    // pooler. Set DIRECT_URL to the direct string and keep DATABASE_URL pooled for the app; with no DIRECT_URL
    // the CLI uses DATABASE_URL as before.
    url: process.env.DIRECT_URL || env("DATABASE_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
