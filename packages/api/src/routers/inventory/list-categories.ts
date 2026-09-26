import { inventoryCategory } from "@school-student-teacher-management/db/schema/inventory";
import { asc } from "drizzle-orm";

import { requireInventoryPermission } from "../../index";
import { iso } from "./inventory-database";

/**
 * Every category in the store, name first, whether or not anything uses it.
 *
 * **Unused categories are included on purpose.** The item form's picker is the
 * only consumer of this list, and a category nobody has used yet is exactly the
 * one a storekeeper is about to need: filtering to "categories currently in
 * use" would make the picker unable to offer the category an item is being
 * created *into*, and the set would shrink every time the last item of a kind
 * was retired — a list whose contents depend on the current contents of the
 * store cannot be used to change the contents of the store.
 *
 * **The colour comes back with the row, not from a second endpoint.** The one
 * thing a category badge renders is `name` and `color`, and both live on this
 * row, so returning them together is a fact about this table rather than a
 * decision. There is deliberately no palette endpoint: a separate one could
 * disagree with the rows (a colour changed on the category, a swatch not
 * re-registered) and a badge that renders a colour the category no longer
 * carries is worse than no badge.
 *
 * `normalizedName` is returned although the UI only needs it as the dedupe key
 * behind a "you already have this" check, because it is the exact string the
 * unique index is written against and a client that recomputes it differently
 * would offer a duplicate the server then refuses.
 */
export const listCategories = requireInventoryPermission("read").handler(
  async ({ context }) => {
    const rows = await context.db
      .select({
        id: inventoryCategory.id,
        name: inventoryCategory.name,
        normalizedName: inventoryCategory.normalizedName,
        color: inventoryCategory.color,
        createdAt: inventoryCategory.createdAt,
      })
      .from(inventoryCategory)
      .orderBy(asc(inventoryCategory.name));

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      normalizedName: row.normalizedName,
      color: row.color,
      createdAt: iso(row.createdAt),
    }));
  }
);
