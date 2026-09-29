import { randomInt } from "node:crypto";

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O — easy to misread when relayed by phone/chat
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const ALL = UPPER + LOWER + DIGITS;

function pick(chars: string): string {
  return chars[randomInt(chars.length)];
}

/** A random password an admin can hand a locked-out rep — always satisfies
 * `passwordPolicy.ts` (one upper, one lower, one digit, 8+ chars) by
 * construction, not by chance. Ambiguous characters (0/O, 1/l/I) are
 * excluded since this is read aloud or typed from a chat message, not
 * copy-pasted. */
export function generateTempPassword(): string {
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  const rest = Array.from({ length: 7 }, () => pick(ALL));
  const chars = [...required, ...rest];
  // Fisher-Yates, so the three required characters aren't always up front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
