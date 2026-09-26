import { ORPCError } from "@orpc/server";
import { normalizeInventoryKey } from "@school-student-teacher-management/db/constants/inventory";
import { inventoryCategory } from "@school-student-teacher-management/db/schema/inventory";
import * as v from "valibot";

import { requireInventoryPermission } from "../../index";
import {
  getInventoryActor,
  insertInventoryAuditLog,
  iso,
} from "./inventory-database";

/**
 * The same pattern the column's own `inventory_category_color_hex` CHECK
 * enforces, declared at the input layer so a bad swatch is a validation message
 * in the dialog rather than a constraint violation from the driver. The `u`
 * flag is house style; it changes nothing about a hex string.
 */
const CATEGORY_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/u;

/**
 * The colour a category gets when the caller does not choose one.
 *
 * `#6366F1` is not an arbitrary neutral: it is the `.default()` on
 * `inventoryCategory.color` **and** the colour `DEFAULT_INVENTORY_CATEGORIES`
 * gives its catch-all `Other` entry, so a category created without a swatch is
 * indistinguishable from the seeded one a storekeeper would have picked. It is
 * written explicitly rather than left to the column default so that the value
 * in the audit row's `after` and the value in the response are the same string
 * the caller can rely on, even if the column default is ever changed.
 */
const DEFAULT_CATEGORY_COLOR = "#6366F1";

/**
 * Add one category to the store's taxonomy.
 *
 * **How the duplicate is caught, and why it is not the `try`/`catch` used
 * elsewhere in the API.** This repo's other create procedures
 * (`staff/create-staff.ts`, `staff/periods/assign-class-period.ts`) insert
 * normally and then match the driver's error text on the constraint name
 * (`staff_nic_unique`, …) to turn a raw `23505` into a `CONFLICT`. That works,
 * but it is a *last* line of defence: the request is reported as a failure and
 * only the failure's prose is rescued, and it depends on the driver continuing
 * to put the constraint name in the message.
 *
 * Here the conflict is part of the statement. `onConflictDoNothing({ target:
 * inventoryCategory.normalizedName })` emits a real `on conflict
 * ("normalized_name") do nothing` — which the `inventory_category_normalized_name_unique`
 * constraint satisfies as an inference specification — and `.returning()` comes
 * back **empty** when the loser of the race lost. An empty return set is
 * therefore an unambiguous, race-free answer to "does this name already
 * exist?", and the same single round trip produces the id and `createdAt` the
 * response needs. Drizzle 0.45.2 supports the `target` form cleanly, so nothing
 * is lost by preferring it.
 *
 * The category is named in the message because the picker renders it inline
 * next to the field the storekeeper is filling in: "A category called IT
 * Equipment already exists" tells them which of the two entries to merge into,
 * where a generic conflict leaves them comparing two pickers by hand.
 *
 * The insert and the audit row share one transaction: an audit trail that
 * records a category nobody can see is worse than no audit trail, and a
 * category nobody audited is a row the change log cannot explain.
 */
export const createCategory = requireInventoryPermission("create")
  .input(
    v.object({
      name: v.pipe(v.string(), v.minLength(1), v.maxLength(80)),
      color: v.optional(v.pipe(v.string(), v.regex(CATEGORY_COLOR_PATTERN))),
    })
  )
  .handler(async ({ input, context }) => {
    const actor = await getInventoryActor(context);

    /**
     * `minLength(1)` admits a single space, and the normalized form of `"   "`
     * is the empty string — which the database CHECK
     * (`inventory_category_name_not_blank`) would reject as a raw constraint
     * violation, and which the unique index would also treat as a duplicate of
     * any other blank name. Normalizing first and refusing an empty result
     * catches both at the point where the message can still be useful.
     */
    const normalizedName = normalizeInventoryKey(input.name);
    if (!normalizedName) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Enter a name for the category",
      });
    }

    const color = input.color ?? DEFAULT_CATEGORY_COLOR;
    const id = crypto.randomUUID();

    return context.db.transaction(async (tx) => {
      const [record] = await tx
        .insert(inventoryCategory)
        .values({ id, name: input.name, normalizedName, color })
        .onConflictDoNothing({ target: inventoryCategory.normalizedName })
        .returning({
          id: inventoryCategory.id,
          name: inventoryCategory.name,
          normalizedName: inventoryCategory.normalizedName,
          color: inventoryCategory.color,
          createdAt: inventoryCategory.createdAt,
        });

      if (!record) {
        throw new ORPCError("CONFLICT", {
          message: `A category called ${input.name} already exists`,
        });
      }

      await insertInventoryAuditLog(tx, {
        actor,
        action: "category.create",
        entityType: "inventory_category",
        entityId: record.id,
        before: null,
        after: {
          name: record.name,
          normalizedName: record.normalizedName,
          color: record.color,
        },
      });

      return {
        id: record.id,
        name: record.name,
        normalizedName: record.normalizedName,
        color: record.color,
        createdAt: iso(record.createdAt),
      };
    });
  });
