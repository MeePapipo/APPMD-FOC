import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const allowedDomains = (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const devAuth = process.env.DEV_AUTH === "true";

/** Exported so the self-registration API route can reuse the same domain gate. */
export function emailAllowed(email?: string | null): boolean {
  if (!email) return false;
  if (allowedDomains.length === 0) return true;
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && allowedDomains.includes(domain);
}

/**
 * A value copied straight from .env.example (e.g. `<TENANT_ID>`) is worse than a
 * missing one: Auth.js still registers the provider, then the OIDC discovery
 * fetch hits an invalid tenant URL, Microsoft answers with an HTML error page,
 * and the user gets `SyntaxError: Unexpected token '<'` → error=Configuration.
 */
const isPlaceholder = (v?: string) =>
  !v || /[<>]|your-|xxx|placeholder|changeme|TENANT_ID|CLIENT_ID/i.test(v);

/** True when the Entra app registration is filled in for real. */
export const entraConfigured =
  !isPlaceholder(process.env.AUTH_MICROSOFT_ENTRA_ID_ID) &&
  !isPlaceholder(process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET) &&
  !isPlaceholder(process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER);

const providers: Provider[] = [];
if (entraConfigured) {
  providers.push(MicrosoftEntraID);
} else {
  console.warn(
    "[auth] Microsoft Entra ID is not configured (AUTH_MICROSOFT_ENTRA_ID_ID/_SECRET/_ISSUER " +
      "are missing or still placeholders) — SSO is hidden." +
      (devAuth ? " Using dev login." : " Set DEV_AUTH=true to sign in locally."),
  );
}

// Self-registered email+password login. Distinct from the "dev" bypass below
// — this one actually checks a password and is always available, regardless
// of DEV_AUTH/Entra config, since it's the fallback for reps with no Entra
// account.
providers.push(
  Credentials({
    id: "credentials",
    name: "Email and password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    authorize: async (creds) => {
      const email = String(creds?.email ?? "").trim().toLowerCase();
      const password = String(creds?.password ?? "");
      if (!email || !password) return null;
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.active || !user.passwordHash) return null;
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return null;
      return { id: user.id, email: user.email, name: user.name };
    },
  }),
);

// Dev-only email login so the app runs without a live Entra tenant.
// Guarded by DEV_AUTH — never enable in production.
if (devAuth) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev login",
      credentials: { email: { label: "Email", type: "email" } },
      authorize: async (creds) => {
        const email = String(creds?.email ?? "").trim().toLowerCase();
        if (!email || !emailAllowed(email)) return null;
        return { id: email, email, name: email.split("@")[0] };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  callbacks: {
    async signIn({ user }) {
      return emailAllowed(user.email);
    },
    async jwt({ token, user }) {
      // Only touch the DB on initial sign-in; role is then carried in the JWT.
      if (user?.email) {
        const email = user.email.toLowerCase();
        const isSeedAdmin = adminEmails.includes(email);
        const dbUser = await prisma.user.upsert({
          where: { email },
          create: {
            email,
            name: user.name ?? null,
            role: isSeedAdmin ? "ADMIN" : "USER",
            lastLoginAt: new Date(),
            loginCount: 1,
          },
          update: {
            ...(isSeedAdmin ? { role: "ADMIN" as const } : {}),
            lastLoginAt: new Date(),
            loginCount: { increment: 1 },
          },
        });
        token.role = dbUser.role;
        token.uid = dbUser.id;
        token.email = email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? session.user.id;
        session.user.role = (token.role as "USER" | "ADMIN") ?? "USER";
      }
      return session;
    },
  },
});
