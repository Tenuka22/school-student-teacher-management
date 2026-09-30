/**
 * What a teacher may *ask for*: items already in a colleague's hands, rather
 * than sitting free on the shelf.
 *
 * This is the second half of self-service custody, alongside
 * `listTakeableItems`. That catalogue is deliberately narrow about who holds
 * what — see its own doc comment — because browsing it answers "what is free
 * right now" and naming the holder of every other item would turn one read
 * into a roster of colleagues and their belongings. This catalogue answers a
 * different question — "who do I have to ask for this" — and the holder's
 * name is not incidental to that question, it *is* the answer: a teacher
 * cannot usefully raise a request without knowing whose custody they are
 * `custodianName` is selected here and nowhere else in the
 * teacher-reachable surface, and the disclosure is exactly as wide as the
 * action it serves: one name, for one item, that the caller is about to send
 * a request naming. Now that caller identity is represented as a user.id
 * rather than a staff.id, every authenticated user can raise a custody request.
 */
import {
  inventoryCategory,
  inventoryItem,
} from "@school-student-teacher-management/db/schema/inventory";
import { staff } from "@school-student-teacher-management/db/schema/staff";
import { and, eq, ilike, isNotNull, isNull, ne, or } from "drizzle-orm";
import {
  integer,
  maxLength,
  maxValue,
  minValue,
  number,
  object,
  optional,
  pipe,
  string,
} from "valibot";

import { requireInventoryPermission } from "../../index";
import { getInventoryActor } from "./inventory-database";

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/** Same escape as `listTakeableItems` — see that file for why it is needed. */
const escapeLikePattern = (value: string): string =>
  value.replaceAll(/[\\%_]/gu, (character) => `\\${character}`);

export const listRequestableItems = requireInventoryPermission("read")
  .input(
    object({
      search: optional(pipe(string(), maxLength(120))),
      limit: optional(
        pipe(number(), integer(), minValue(1), maxValue(MAX_LIMIT))
      ),
    })
  )
  .handler(async ({ input, context }) => {
    const actor = await getInventoryActor(context);

    const { staffId } = actor;
    const limit = input.limit ?? DEFAULT_LIMIT;
    const search = input.search?.trim();

    const rows = await context.db
      .select({
        id: inventoryItem.id,
        sku: inventoryItem.sku,
        name: inventoryItem.name,
        categoryName: inventoryCategory.name,
        categoryColor: inventoryCategory.color,
        condition: inventoryItem.condition,
        custodianStaffId: inventoryItem.custodianStaffId,
        custodianName: staff.name,
      })
      .from(inventoryItem)
      .innerJoin(
        inventoryCategory,
        eq(inventoryItem.categoryId, inventoryCategory.id)
      )
      .innerJoin(staff, eq(inventoryItem.custodianStaffId, staff.id))
      .where(
        and(
          isNull(inventoryItem.deletedAt),
          eq(inventoryItem.borrowable, true),
          isNotNull(inventoryItem.custodianStaffId),
          ne(inventoryItem.custodianStaffId, staffId),
          search
            ? or(
                ilike(inventoryItem.name, `%${escapeLikePattern(search)}%`),
                ilike(inventoryItem.sku, `%${escapeLikePattern(search)}%`)
              )
            : undefined
        )
      )
      .orderBy(inventoryItem.name)
      .limit(limit);

    return { items: rows };
  });
