/**
 * Ensures the fixed super-admin account exists — a plain seeded User row
 * (role ADMIN, a real bcrypt passwordHash) with no special-cased auth code
 * path; it signs in through the normal "credentials" provider like any
 * self-registered rep. Idempotent: safe to run on every deploy/seed.
 *
 * Run: npm run seed:admin
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const ADMIN_EMAIL = "appmd@roche.com";
const ADMIN_PASSWORD = "Admin001";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    create: { email: ADMIN_EMAIL, name: "Admin", role: "ADMIN", passwordHash },
    update: { role: "ADMIN", passwordHash, active: true },
  });
  console.log(`Upserted fixed admin ${ADMIN_EMAIL}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
