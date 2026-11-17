import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Password hashing with scrypt (built into Node, no native dependency).
// Format: scrypt$N$r$p$saltB64$hashB64 — parameters are stored so they can be raised later.
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

const opts = (n: number, r: number, p: number): ScryptOptions => ({ N: n, r, p, maxmem: 128 * n * r * 2 });

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, KEYLEN, opts(N, R, P));
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  // Always do comparable work, even for unknown users, to avoid timing-based user enumeration.
  if (!stored) {
    await scrypt(password.normalize("NFKC"), Buffer.alloc(16), KEYLEN, opts(N, R, P));
    return false;
  }
  const [scheme, n, r, p, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(
    password.normalize("NFKC"),
    Buffer.from(saltB64, "base64"),
    expected.length,
    opts(Number(n), Number(r), Number(p)),
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** True if the stored hash uses weaker parameters than the current ones and should be re-hashed on login. */
export function needsRehash(stored: string): boolean {
  const [, n, r, p] = stored.split("$");
  return Number(n) < N || Number(r) < R || Number(p) < P;
}

export type PasswordIssue = "too_short" | "too_long" | "too_common" | "needs_variety";
const COMMON = new Set(["password", "12345678", "123456789", "qwertyuiop", "11111111", "iloveyou", "senha123", "password1"]);

export function checkPasswordStrength(password: string): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  if (password.length < 10) issues.push("too_short");
  if (password.length > 200) issues.push("too_long");
  if (COMMON.has(password.toLowerCase())) issues.push("too_common");
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (classes < 3) issues.push("needs_variety");
  return issues;
}
