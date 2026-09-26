/**
 * One item, as the register draws it.
 *
 * Deliberately *not* a fat aggregate. The unit list, the custody trail, the
 * movement ledger and the open loans are four sibling procedures that all key
 * off this same `itemId`, so the item page is assembled from four round trips
 * rather than one. Do not merge them: a page that loads its units, its history
 * and its loans together cannot show a skeleton per panel, cannot refetch the
 * ledger without refetching the header, and pays for a teacher who only opened
 * the page to read the current value a join across four tables would have had to
 * assemble anyway.
 */
import { ORPCError } from "@orpc/server";
import {
  inventoryItem,
  inventoryItemIdSchema,
} from "@school-student-teacher-management/db/schema/inventory";
import { and, eq, isNull } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../index";
import { itemViewJoins, toItemView } from "./inventory-database";

/**
 * Fetch a single live item.
 *
 * A soft-deleted item is a **non-existent** item here, so the response is
 * `NOT_FOUND` rather than a row with a `deletedAt` on it. The reasoning is that
 * the retired record is a ledger entry, not a thing you can do anything to: every
 * write path in this feature refuses it (`getLockedItem` hides it), and
 * returning it from `getItem` would invite a client to render an edit form for
 * an item whose every save will fail. `listItems` with `includeDeleted` is the
 * one way to see retired records, and it hands the row back with `deletedAt` set
 * so the UI can mark it retired.
 *
 * The read is school-wide by design — the register is the school's asset
 * record, and "who else in this school holds a projector" is a question a
 * **storekeeper** is entitled to ask. A teacher's own scoped view is the
 * separate `listMyItems` procedure; nothing here needs to duplicate it, and a
 * read that quietly filtered itself by holder would make this endpoint's shape
 * depend on the caller's role, which is how a list page ends up rendering three
 * different tables from one component.
 *
 * **`adminProcedure`, not `requireInventoryPermission("read")`** — a deliberate
 * deviation from the obvious gate, and the reason is written down in two other
 * places in this repo.
 *
 * The gate changed because `requireInventoryPermission("read")` is
 * teacher-reachable: the `teacher` role holds `inventory: ["read"]`
 * (`packages/auth/src/permissions.ts`), and `requirePermission` in
 * `packages/api/src/index.ts` consults that statement for anybody outside
 * `ADMIN_ROLES`. A teacher can therefore pass that gate, and this procedure
 * hands back any item in the school on request — its name, description, SKU,
 * valuation, location, condition, and the names of its manager and its
 * current custodian. Being a single row rather than a list does not make it
 * less school-wide; it makes it a cheaper way to enumerate the same data one
 * `itemId` at a time.
 *
 * The scoping a teacher *is* entitled to is `listMyItems`, and for the history
 * of an item they hold it is `listCustodyHistory` — which scopes its own query
 * to the caller. What this endpoint now satisfies is the `teacher` statement's
 * contract in `packages/auth/src/permissions.ts`, which says `read` reaches no
 * school-wide register.
 */
export const getItem = adminProcedure
  .input(v.object({ itemId: inventoryItemIdSchema }))
  .handler(async ({ input, context }) => {
    const [row] = await itemViewJoins(context.db)
      .where(
        and(eq(inventoryItem.id, input.itemId), isNull(inventoryItem.deletedAt))
      )
      .limit(1);

    if (!row) {
      throw new ORPCError("NOT_FOUND", { message: "Item not found" });
    }

    return toItemView(row);
  });
