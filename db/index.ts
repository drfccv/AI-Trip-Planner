import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const globalDatabase = globalThis as typeof globalThis & {
  lvjiSql?: ReturnType<typeof postgres>;
};

export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_REQUIRED");
  globalDatabase.lvjiSql ??= postgres(url, {
    max: Number(process.env.DATABASE_POOL_SIZE || 10),
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return globalDatabase.lvjiSql;
}

export function getDb() {
  const database = drizzle(getSql(), { schema });
  return Object.assign(database, {
    async batch(statements: Array<PromiseLike<unknown>>) {
      for (const statement of statements) await statement;
    },
  });
}
