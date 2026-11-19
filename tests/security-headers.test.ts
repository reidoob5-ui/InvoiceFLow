import { describe, expect, it } from "vitest";
import nextConfig from "../apps/web/next.config";

describe("security headers", async () => {
  const rules = await nextConfig.headers!();
  const all = rules.find((r) => r.source === "/(.*)")!;
  const pages = rules.find((r) => r.source === "/((?!api/).*)")!;
  const value = (headers: { key: string; value: string }[], key: string) => headers.find((h) => h.key === key)?.value;

  it("forbids framing, sniffing and leaky referrers everywhere", () => {
    expect(value(all.headers, "X-Frame-Options")).toBe("DENY");
    expect(value(all.headers, "X-Content-Type-Options")).toBe("nosniff");
    expect(value(all.headers, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(value(all.headers, "Permissions-Policy")).toContain("camera=()");
  });

  it("applies a CSP to pages that blocks framing, plugins, foreign base URIs and form targets", () => {
    const csp = value(pages.headers, "Content-Security-Policy")!;
    for (const directive of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "connect-src 'self'"]) {
      expect(csp).toContain(directive);
    }
  });

  it("keeps the CSP off /api, so inline PDFs keep rendering", () => {
    expect(new RegExp(`^${pages.source.replace(/^\//, "\\/")}$`).test("/api/invoices/x/pdf")).toBe(false);
    expect(new RegExp(`^${pages.source.replace(/^\//, "\\/")}$`).test("/invoices/x")).toBe(true);
  });

  it("does not advertise the framework", () => expect(nextConfig.poweredByHeader).toBe(false));
});
