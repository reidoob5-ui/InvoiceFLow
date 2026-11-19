import { describe, expect, it } from "vitest";
import { sanitizeProposal, type ClientOption, type ProductOption } from "../apps/web/lib/ai/draft";

const clients: ClientOption[] = [{ id: "c1", name: "Clínica Vida Nova", currency: "AOA" }];
const products: ProductOption[] = [
  { id: "p1", name: "Suporte técnico (hora)", unitPrice: 25000, currency: "AOA" },
  { id: "p2", name: "Licença anual (USD)", unitPrice: 400, currency: "USD" },
];

describe("AI invoice draft validation", () => {
  it("keeps a valid client and takes the price from the catalog, ignoring the model's price", () => {
    const r = sanitizeProposal({ clientId: "c1", lines: [{ productId: "p1", description: "x", quantity: 3, unitPrice: 1 }] }, clients, products, "AOA");
    expect(r.clientId).toBe("c1");
    expect(r.clientName).toBe("Clínica Vida Nova");
    expect(r.lines).toEqual([{ productId: "p1", description: "Suporte técnico (hora)", quantity: 3, unitPrice: 25000 }]);
    expect(r.question).toBeNull();
  });

  it("rejects client and product ids that are not in the organization's lists", () => {
    const r = sanitizeProposal({ clientId: "other-org-client", newClientName: "Cliente Novo", lines: [{ productId: "ghost", description: "Serviço avulso", quantity: 1, unitPrice: 5000 }] }, clients, products, "AOA");
    expect(r.clientId).toBeNull();
    expect(r.newClientName).toBe("Cliente Novo");
    expect(r.lines[0].productId).toBeNull();
    expect(r.lines[0].unitPrice).toBe(5000);
  });

  it("drops invalid lines and asks a question when nothing usable remains", () => {
    const r = sanitizeProposal({ clientId: "c1", lines: [{ description: "ok", quantity: -2, unitPrice: 10 }, { description: "", quantity: 1, unitPrice: 10 }, { description: "sem preço", quantity: 1 }] }, clients, products, "AOA");
    expect(r.lines).toHaveLength(0);
    expect(r.question).not.toBeNull();
  });

  it("forces the catalog currency and flags mixed currencies", () => {
    const usd = sanitizeProposal({ clientId: "c1", currency: "EUR", lines: [{ productId: "p2", description: "x", quantity: 1 }] }, clients, products, "AOA");
    expect(usd.currency).toBe("USD");
    const mixed = sanitizeProposal({ clientId: "c1", lines: [{ productId: "p1", description: "x", quantity: 1 }, { productId: "p2", description: "y", quantity: 1 }] }, clients, products, "AOA");
    expect(mixed.question).not.toBeNull();
  });

  it("falls back to the organization currency and ignores malformed terms", () => {
    const r = sanitizeProposal({ currency: "kwanza", paymentTermsDays: 9999, lines: [{ description: "Serviço", quantity: 2, unitPrice: 100 }] }, clients, products, "AOA");
    expect(r.currency).toBe("AOA");
    expect(r.paymentTermsDays).toBeNull();
  });
});
