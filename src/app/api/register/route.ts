import { z } from "zod";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emailAllowed } from "@/auth";
import { passwordSchema } from "@/lib/passwordPolicy";

const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().min(3).max(254).email(),
  team: z.enum(["NORTH", "SOUTH", "PRIVATE", "BUSINESS_PARTNER", "THAI_RED_CROSS"]),
  password: passwordSchema,
});

export async function POST(request: Request) {
  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  }

  const { name, team, password } = parsed.data;
  // Normalized separately from the schema (not relied on for uniqueness) so
  // it can't drift from src/auth.ts's jwt callback, which always lowercases
  // before its own upsert — a case-variant duplicate here would otherwise be
  // a silent duplicate-account bug.
  const email = parsed.data.email.trim().toLowerCase();

  if (!emailAllowed(email)) {
    return Response.json(
      { error: "Registration is restricted to authorized Roche accounts." },
      { status: 400 },
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return Response.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    await prisma.user.create({ data: { name, email, team, passwordHash } });
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      return Response.json({ error: "An account with this email already exists." }, { status: 409 });
    }
    console.error("register failed", cause);
    return Response.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
