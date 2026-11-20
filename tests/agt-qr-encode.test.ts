import { describe, expect, it } from "vitest";
import { qrMatrix, qrMinVersion } from "@/lib/agt/qr-encode";
import { qrUrl } from "@/lib/agt/qr";

// A descodificação real foi verificada com OpenCV (versões 1, 5, 7 e 10, incluindo UTF-8).
describe("QR encoder", () => {
  it("o URL da AGT usa versão 7 (45x45)", () => {
    const url = qrUrl("FT A2026/1", "5417012345");
    expect(qrMinVersion(new TextEncoder().encode(url).length)).toBe(7);
    const m = qrMatrix(url);
    expect(m.length).toBe(45);
    expect(m.every((r) => r.length === 45)).toBe(true);
  });
  it("tem os três padrões de localização e é determinístico", () => {
    const m = qrMatrix("InvoiceFlow");
    for (const [r, c] of [[0, 0], [0, m.length - 7], [m.length - 7, 0]] as const) {
      expect(m[r]![c]).toBe(true);
      expect(m[r + 3]![c + 3]).toBe(true);
      expect(m[r + 1]![c + 1]).toBe(false);
    }
    expect(JSON.stringify(qrMatrix("InvoiceFlow"))).toBe(JSON.stringify(m));
  });
  it("recusa texto acima da versão 10", () => {
    expect(() => qrMatrix("x".repeat(300))).toThrow(/demasiado longo/);
  });
});
