import {
  DEFAULT_INVENTORY_CATEGORIES,
  normalizeInventoryKey,
} from "@school-student-teacher-management/db/constants/inventory";
import { inventoryCategory } from "@school-student-teacher-management/db/schema/inventory";
import { inArray } from "drizzle-orm";

import { adminOnlyProcedure } from "../../index";
import {
  getInventoryActor,
  insertInventoryAuditLog,
} from "./inventory-database";

/**
 * The keys a run reconciles against: the eight seeded categories, normalized
 * with the same function the API writes `normalizedName` with.
 *
 * Recomputing rather than reading `entry.normalizedName` is deliberate even
 * though the constant pre-computes it. That pre-computed field is the reason the
 * constant's own comment warns that "a seeder that lowercases differently from
 * `normalizeInventoryKey` writes a category the API will then refuse to
 * re-create" — and the only way a seeder cannot drift from the API is to call
 * the API's function instead of trusting a literal that has to be kept in step
 * by hand. All eight currently agree, so this changes nothing today; it is here
 * so that adding a ninth entry with a trailing space cannot break the store.
 */
const SEED_KEYS = DEFAULT_INVENTORY_CATEGORIES.map((entry) =>
  normalizeInventoryKey(entry.name)
);

/**
 * Seed the eight default store categories.
 *
 * **This closes a real gap.** `DEFAULT_INVENTORY_CATEGORIES` has been in
 * `db/constants/inventory.ts` since the schema landed, and its own doc comment
 * says it exists "so a school never starts with an empty category picker" — but
 * nothing ever read it. A fresh install therefore had an empty taxonomy, the
 * item form's category picker had nothing to offer, and the first thing any
 * storekeeper did was type the eight categories in by hand, one dialog at a
 * time, with hand-picked colours that would then disagree with the constants.
 * The constant is the school-appropriate default list; this is the only
 * procedure that puts it in the database.
 *
 * **The upsert skips, it never overwrites.** `onConflictDoNothing({ target:
 * inventoryCategory.normalizedName })` is the whole reason re-running this is
 * safe: an administrator who has already recoloured `Furniture` keeps their
 * choice, and a category a school has renamed to `Computing` keeps that name.
 * A `do update set color = excluded.color` would quietly repaint the school the
 * first time anybody clicked the button a second time, which is the one thing a
 * seeder must never do.
 *
 * `categories` is read back inside the same transaction rather than assembled
 * from the constants, so the response reports what is actually in the table —
 * including the id and the colour of rows that were already there — and the UI
 * can drop the list straight into its picker cache. The caller can then tell
 * "8 categories ready" from "nothing to do" by `created` without a second read.
 *
 * One transaction for the insert, the read-back and the audit row: a seeder that
 * committed half its list would leave the store in a state no later run could
 * describe, since the second run would report a count that does not match what
 * the first one did.
 */

export const seedCategories = adminOnlyProcedure.handler(
  async ({ context }) => {
    const actor = await getInventoryActor(context);

    return context.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(inventoryCategory)
        .values(
          DEFAULT_INVENTORY_CATEGORIES.map((entry) => ({
            id: crypto.randomUUID(),
            name: entry.name,
            normalizedName: normalizeInventoryKey(entry.name),
            color: entry.color,
          }))
        )
        .onConflictDoNothing({ target: inventoryCategory.normalizedName })
        .returning({
          id: inventoryCategory.id,
          normalizedName: inventoryCategory.normalizedName,
        });

      // The read-back must follow the insert — it is the only way to learn the
      // ids and the (possibly administrator-changed) colours of the rows that
      // were already present. The two are therefore sequential by
      // construction, which is exactly what the disabled rule objects to, and
      // batching them into one `Promise.all` would be a lie: a concurrent run
      // that committed between the two statements would leave a key counted as
      // `skipped` while missing from `categories` entirely.
      // oxlint-disable-next-line react-doctor/server-sequential-independent-await -- must observe the insert's effect
      const existing = await tx
        .select({
          id: inventoryCategory.id,
          name: inventoryCategory.name,
          normalizedName: inventoryCategory.normalizedName,
          color: inventoryCategory.color,
        })
        .from(inventoryCategory)
        .where(inArray(inventoryCategory.normalizedName, SEED_KEYS));

      /**
       * Reported in the order `DEFAULT_INVENTORY_CATEGORIES` declares rather
       * than in whatever order Postgres returned, so the picker's options are
       * the same sequence on every machine and after every run. A row whose
       * `normalizedName` matched a seed key but whose `name` an administrator
       * has since edited is reported under the key it matched, with the name it
       * actually has — which is the point of reading the table rather than
       * echoing the constant.
       */
      const byKey = new Map(
        existing.map((row) => [row.normalizedName, row] as const)
      );
      const categories = SEED_KEYS.flatMap((key) => {
        const row = byKey.get(key);
        if (!row) {
          return [];
        }

        return [{ id: row.id, name: row.name, color: row.color }];
      });

      // `inserted` can never exceed the number of seed keys: one value per key,
      // and a duplicate key inside a single `values` list is a statement the
      // database refuses outright rather than silently skipping.
      const created = inserted.length;
      const skipped = SEED_KEYS.length - created;

      await insertInventoryAuditLog(tx, {
        actor,
        action: "category.seed",
        entityType: "inventory_category",
        entityId: "batch",
        before: null,
        after: { created, skipped },
      });

      return { created, skipped, categories };
    });
  }
);
