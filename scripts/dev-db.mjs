// Local PostgreSQL for development without Docker (uses the embedded-postgres package).
// Usage: npm run db:local   -> starts Postgres on port 5432 (data kept in .pgdata/)
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

const dataDir = process.env.PGDATA_DIR ?? new URL("../.pgdata", import.meta.url).pathname;
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "postgres",
  port: Number(process.env.PGPORT ?? 5432),
  persistent: true,
});

if (!existsSync(dataDir)) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase("invoiceflow");
} catch {
  /* database already exists */
}
console.log("PostgreSQL ready: postgresql://postgres:postgres@localhost:" + (process.env.PGPORT ?? 5432) + "/invoiceflow");

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
