import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  // `migrations/meta/**` is Drizzle-generated: it is rewritten by `db:generate`,
  // so formatting it only produces churn that the next generate undoes.
  ignorePatterns: [
    ...ultracite.ignorePatterns,
    "packages/ui/**",
    "packages/db/src/migrations/meta/**",
  ],
});
