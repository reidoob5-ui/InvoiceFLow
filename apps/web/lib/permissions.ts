// Role-based access control. Roles map to a set of "resource:action" permissions.
// Every protected server operation must call `can()` / `assertCan()` — the UI hiding a button is not security.

export type Role = "OWNER" | "ADMIN" | "ACCOUNTANT" | "SALES" | "MEMBER" | "VIEWER";

export const RESOURCES = [
  "dashboard", "invoices", "quotes", "clients", "products", "payments", "expenses", "suppliers",
  "reports", "taxes", "settings", "team", "billing", "audit", "ai", "integrations", "fiscal",
] as const;
export type Resource = (typeof RESOURCES)[number];
export type Action = "read" | "write" | "delete" | "send";
export type Permission = `${Resource}:${Action}`;

const all = (r: Resource, actions: Action[] = ["read", "write", "delete", "send"]): Permission[] =>
  actions.map((a) => `${r}:${a}` as Permission);

const everything = RESOURCES.flatMap((r) => all(r));

const GRANTS: Record<Role, Set<Permission>> = {
  OWNER: new Set(everything),
  ADMIN: new Set(everything.filter((p) => p !== "billing:write" && p !== "billing:delete")),
  ACCOUNTANT: new Set<Permission>([
    ...all("dashboard", ["read"]),
    ...all("invoices", ["read", "write"]),
    ...all("quotes", ["read"]),
    ...all("clients", ["read"]),
    ...all("products", ["read"]),
    ...all("payments"),
    ...all("expenses"),
    ...all("suppliers"),
    ...all("reports", ["read"]),
    ...all("taxes"),
    ...all("audit", ["read"]),
    ...all("fiscal", ["read"]),
    ...all("ai", ["read", "write"]),
  ]),
  SALES: new Set<Permission>([
    ...all("dashboard", ["read"]),
    ...all("invoices", ["read", "write", "send"]),
    ...all("quotes"),
    ...all("clients", ["read", "write"]),
    ...all("products", ["read"]),
    ...all("payments", ["read"]),
    ...all("ai", ["read", "write"]),
  ]),
  MEMBER: new Set<Permission>([
    ...all("dashboard", ["read"]),
    ...all("invoices", ["read"]),
    ...all("quotes", ["read"]),
    ...all("clients", ["read"]),
    ...all("products", ["read"]),
    ...all("expenses", ["read", "write"]),
    ...all("ai", ["read"]),
  ]),
  // Read-only profile (used by the public demo account): can look at everything, change nothing.
  VIEWER: new Set<Permission>([
    ...(["dashboard", "invoices", "quotes", "clients", "products", "payments", "expenses", "suppliers", "reports", "taxes"] as Resource[]).flatMap((r) => all(r, ["read"])),
    ...all("ai", ["read"]),
  ]),
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return !!role && GRANTS[role]?.has(permission) === true;
}

export class ForbiddenError extends Error {
  constructor(permission: Permission) {
    super(`Forbidden: missing permission ${permission}`);
  }
}

export function assertCan(role: Role | null | undefined, permission: Permission): void {
  if (!can(role, permission)) throw new ForbiddenError(permission);
}

export const ROLES: Role[] = ["OWNER", "ADMIN", "ACCOUNTANT", "SALES", "MEMBER"];

/** Only an owner may grant or revoke OWNER; admins may manage everyone else. */
export function canAssignRole(actor: Role, target: Role): boolean {
  if (target === "OWNER") return actor === "OWNER";
  return actor === "OWNER" || actor === "ADMIN";
}
