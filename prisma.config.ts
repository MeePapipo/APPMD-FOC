import "dotenv/config";
import path from "node:path";
import { defineConfig, env } from "prisma/config";

// Prisma 7 moved the connection URL out of schema.prisma. The URL here is used
// by the Prisma CLI (migrate / db push / introspection). The runtime client is
// constructed with a driver adapter — see src/lib/prisma.ts.
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
