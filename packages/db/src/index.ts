import { drizzle } from "drizzle-orm/node-postgres";

import type { DatabaseConfig } from "./config";
import * as schema from "./schema";

export const createDb = (env: DatabaseConfig) =>
  drizzle(env.DATABASE_URL, { schema });

export type Database = ReturnType<typeof createDb>;
