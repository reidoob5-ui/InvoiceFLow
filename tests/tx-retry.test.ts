import { describe, expect, it } from "vitest";
import { retryOnConflict } from "@/lib/tx-retry";

describe("retryOnConflict", () => {
  it("repete em conflito de serialização e devolve o resultado", async () => {
    let calls = 0;
    const result = await retryOnConflict(async () => {
      calls++;
      if (calls < 3) throw Object.assign(new Error("conflict"), { code: "P2034" });
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("não repete outros erros", async () => {
    let calls = 0;
    await retryOnConflict(async () => { calls++; throw new Error("outro"); }).catch(() => undefined);
    expect(calls).toBe(1);
  });

  it("desiste depois do limite de tentativas", async () => {
    let calls = 0;
    await retryOnConflict(async () => { calls++; throw Object.assign(new Error("c"), { code: "40001" }); }, 3).catch(() => undefined);
    expect(calls).toBe(3);
  });
});
