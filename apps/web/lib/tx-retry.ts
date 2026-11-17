/**
 * Repete uma operação quando a base de dados recusa por conflito de concorrência
 * (transações Serializable: Prisma P2034 / PostgreSQL 40001). Útil ao emitir facturas
 * ou registar pagamentos em simultâneo.
 */
export async function retryOnConflict<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      const conflict = code === "P2034" || code === "40001";
      if (!conflict || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * attempt * (1 + Math.random())));
    }
  }
}
