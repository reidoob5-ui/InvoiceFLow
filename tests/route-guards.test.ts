import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static guard for the API surface. It cannot prove isolation (the integration tests do that), but it
 * fails the build the moment someone adds a route that skips authentication, authorization or tenant
 * scoping WITHOUT consciously adding it to one of the exception lists below.
 */
const API_DIR = join(process.cwd(), "apps/web/app/api");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? routeFiles(full) : name === "route.ts" ? [full] : [];
  });
}
const routes = routeFiles(API_DIR).map((file) => ({
  path: relative(API_DIR, file).split(sep).join("/").replace(/\/route\.ts$/, ""),
  source: readFileSync(file, "utf8"),
}));

// Routes that intentionally run WITHOUT a user session, each with its own substitute protection.
const NO_SESSION: Record<string, string> = {
  "auth/login": "credential check + lockout + rate limit",
  "auth/logout": "clears the caller's own cookie",
  "auth/register": "public sign-up",
  "demo": "public read-only demo: per-IP rate limit, opens a VIEWER-only session on a fictional company",
  "cron/daily": "constant-time Bearer CRON_SECRET, fails closed",
  "public/exchange-rates": "public, read-only, no tenant data",
  "public/invoices/[token]/pdf": "unguessable >=192-bit token",
  "public/invoices/[token]/notice": "unguessable >=192-bit token; only creates a PENDING notice (no balance change), capped per invoice",
  "agt-sim/[service]": "homologation simulator: 404 unless AGT_SIMULATOR=1, stateless, no tenant data",
  "webhooks/paddle": "HMAC signature verification + idempotency",
  "webhooks/proxypay": "provider-side re-verification + idempotency",
};
// Session-only routes that act on the caller's own account, not on tenant data.
const NO_ROLE_CHECK: Record<string, string> = {
  "auth/2fa/disable": "own account", "auth/2fa/setup": "own account", "auth/2fa/verify": "own account",
  "auth/me": "own profile", "organizations": "own memberships / creating an own organization",
  "organizations/switch": "verifies ACTIVE membership of the target organization",
  "team/invitations/accept": "token + invited e-mail must match the session user",
};
const NO_ORG_SCOPE: Record<string, string> = { "auth/2fa/setup": "own account", "auth/me": "own profile" };

describe("API route guards", () => {
  it("finds the API routes", () => expect(routes.length).toBeGreaterThan(40));

  it("every route authenticates unless it is a documented public/system endpoint", () => {
    const offenders = routes.filter((r) => !r.source.includes("getCurrentSession") && !r.source.includes("requirePlatformAdmin") && !(r.path in NO_SESSION)).map((r) => r.path);
    expect(offenders).toEqual([]);
  });

  it("every authenticated route checks a role/permission unless it only touches the caller's own account", () => {
    const offenders = routes
      .filter((r) => r.source.includes("getCurrentSession") && !/assertCan|\bcan\(/.test(r.source) && !(r.path in NO_ROLE_CHECK))
      .map((r) => r.path);
    expect(offenders).toEqual([]);
  });

  it("every authenticated route scopes by organization unless it is on the account-only list", () => {
    const offenders = routes
      .filter((r) => r.source.includes("getCurrentSession") && !r.source.includes("organizationId") && !(r.path in NO_ORG_SCOPE))
      .map((r) => r.path);
    expect(offenders).toEqual([]);
  });

  it("the exception lists contain no stale entries", () => {
    const paths = new Set(routes.map((r) => r.path));
    for (const list of [NO_SESSION, NO_ROLE_CHECK, NO_ORG_SCOPE]) {
      for (const key of Object.keys(list)) expect(paths.has(key), `exception for a route that no longer exists: ${key}`).toBe(true);
    }
  });

  it("every /admin route is restricted to platform administrators", () => {
    const admin = routes.filter((r) => r.path.startsWith("admin/"));
    expect(admin.length).toBeGreaterThan(2);
    expect(admin.filter((r) => !r.source.includes("requirePlatformAdmin") || r.source.includes("getCurrentSession")).map((r) => r.path)).toEqual([]);
  });

  it("only the vault routes may run without the admin vault being open", () => {
    const open = routes.filter((r) => r.path.startsWith("admin/") && /unlocked:\s*false/.test(r.source)).map((r) => r.path).sort();
    expect(open).toEqual(["admin/vault/lock", "admin/vault/setup", "admin/vault/unlock"]);
  });

  it("admin pages are gated by the vault", () => {
    const dir = join(process.cwd(), "apps/web/app/admin");
    const page = readFileSync(join(dir, "page.tsx"), "utf8");
    expect(page).toContain('gateAdminPage("unlocked")');
    expect(readFileSync(join(dir, "unlock/page.tsx"), "utf8")).toContain('gateAdminPage("any")');
  });

  it("manual payment confirmation is reachable only from admin routes", () => {
    const callers = routes.filter((r) => /confirmManualPayment\(/.test(r.source)).map((r) => r.path);
    expect(callers).toEqual(["admin/billing/payments/[id]"]);
  });

  it("no route trusts an organization id sent by the browser", () => {
    // The tenant must come from the session. Reading it from the body/query/params is the classic IDOR.
    // Only genuine reads count: `body.organizationId`, `searchParams.get("organizationId")`, or destructuring it
    // from the body / route params. (`prepareInvoiceLines(body.lines, organizationId)` is fine: the id is the session's.)
    const readsTenantFromClient = new RegExp(
      [
        String.raw`\b(?:body|params|query)\??\.(?:organizationId|orgId)\b`,
        String.raw`searchParams\.get\(\s*["'](?:organizationId|orgId)["']\s*\)`,
        String.raw`\{[^}]*\b(?:organizationId|orgId)\b[^}]*\}\s*=\s*(?:await\s+)?(?:context\.params|params|body)\b`,
      ].join("|"),
    );
    const offenders = routes
      .filter((r) => r.source.includes("getCurrentSession") && r.path !== "organizations/switch")
      .filter((r) => readsTenantFromClient.test(r.source))
      .map((r) => r.path);
    expect(offenders).toEqual([]);
    // ...and the guard itself must be able to catch the bug it exists for.
    expect(readsTenantFromClient.test("const organizationId = body.organizationId;")).toBe(true);
    expect(readsTenantFromClient.test('const o = request.nextUrl.searchParams.get("organizationId")')).toBe(true);
    expect(readsTenantFromClient.test("const { organizationId } = await context.params;")).toBe(true);
    expect(readsTenantFromClient.test("prepareInvoiceLines(body.lines, organizationId, currency)")).toBe(false);
  });

  it("every state-changing route on a fiscal document runs in a Serializable transaction", () => {
    for (const path of ["invoices/[id]/issue", "invoices/[id]/void", "invoices/[id]/credit-note", "invoices/[id]/payments", "invoices/[id]"]) {
      const route = routes.find((r) => r.path === path)!;
      expect(route.source, path).toMatch(/isolationLevel:\s*"Serializable"/);
    }
  });
});
