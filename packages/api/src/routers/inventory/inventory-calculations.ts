/**
 * The pure half of the inventory service layer: the derivations every procedure
 * in `routers/inventory/` needs and none of them should re-derive.
 *
 * Nothing here reads the database, which is the point. `calculateItemStatus`
 * decides which badge an item wears, and that decision is made in three places
 * — the list view, the detail view, and the SQL that filters a list — so it has
 * to exist once. A list page whose filter and whose rendered badge disagree is
 * the kind of bug a school trusts its storebook on, so the two implementations
 * of that ladder are written adjacent to each other and both are covered by the
 * note on `itemStatusExpression`.
 *
 * The types here (`InventoryCounters`, `InventoryItemStatus`) are re-declared
 * rather than imported from `packages/db` on purpose: a counter pair is a
 * value a caller can hold in a form field before it has ever been a row, and
 * `inventoryItem`'s inferred select type is a table with twenty other columns
 * on it. The database-side shapes are derived from these in
 * `inventory-database.ts` instead.
 */
import { inventoryItem } from "@school-student-teacher-management/db/schema/inventory";
import { sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

/** How many times `generateSku` re-rolls before it gives up and returns anyway. */
const SKU_COLLISION_RETRIES = 10;

/**
 * The two counters `inventoryItem` carries, and nothing else.
 *
 * `qty` is on hand, `borrowedQty` is out. Whether the out figure may exceed
 * `qty` is a database fact — the `inventory_item_counters_within_qty` CHECK says
 * no — which is why `calculateAvailableQuantity` still floors at zero: a counter
 * pair that arrives from a request body rather than from a row has not been
 * through that constraint, and a negative "3 available" is a worse failure than
 * an undercount.
 *
 * There is no `reservedQty`. The source app had one and this port has no
 * reservation workflow that outlives the request that created it, so it survived
 * as a column, a CHECK, two ledger columns, a status branch and a SQL branch —
 * all of it describing a state nothing could reach. See the note on
 * `calculateItemStatus`.
 */
export interface InventoryCounters {
  qty: number;
  borrowedQty: number;
}

export type InventoryItemStatus =
  | "out_of_stock"
  | "borrowed"
  | "damaged"
  | "available";

/**
 * Leading and trailing whitespace is dropped without collapsing the interior,
 * because two names that differ only in case are the same thing to a teacher
 * ("Projector" / "projector") but a free-text note keeps whatever spacing its
 * author typed. `normalizeLabel` is the other half of that pair.
 */
export const normalizeText = (value: string): string => value.trim();

/**
 * Whitespace runs collapsed to a single space.
 *
 * This is the display form, used for the strings a human compares or a
 * uniqueness index is written against — an item name, a category name, an
 * asset tag. Collapsing is what stops a stray double space typed into a name
 * field from becoming a second category, and the rule is deliberately the same
 * one `normalizeInventoryKey` applies before lowercasing, so a key written by a
 * seeder and a key written by a request normalize identically.
 */
export const normalizeLabel = (value: string): string =>
  value.trim().replaceAll(/\s+/gu, " ");

/** The free-and-clear count: on hand, less everything already out on loan. */
export const calculateAvailableQuantity = (
  counters: InventoryCounters
): number => Math.max(0, counters.qty - counters.borrowedQty);

/**
 * Derive the display status. Order is meaningful and deliberate:
 * qty 0 wins over everything (nothing on hand is a different fact from
 * "some are away"); then borrowed; then a damaged condition on what remains;
 * otherwise available.
 *
 * The subtlety the order encodes is that the damaged check comes **last**,
 * after the counters. An item that is both damaged *and* borrowed reads as
 * borrowed: the store already knows something is wrong with it, and a second
 * badge on top tells the user nothing they can act on. The `qty === 0` test
 * comes first for the same reason one notch stronger — "we have none" is the
 * answer to every question a user has about this row, whatever else is true
 * of it.
 *
 * `borrowedQty` occupies the slot `reservedQty` used to hold, and the source
 * app's `reserved` badge is gone with the counter: a school with no reservation
 * workflow cannot show it, and a badge nothing can ever display is a state
 * nobody should be asked to reason about.
 */
export const calculateItemStatus = (
  counters: InventoryCounters,
  condition: string
): InventoryItemStatus => {
  if (counters.qty === 0) {
    return "out_of_stock";
  }

  if (counters.borrowedQty > 0) {
    return "borrowed";
  }

  if (condition === "Damaged") {
    return "damaged";
  }

  return "available";
};

/**
 * A SQL fragment mirroring `calculateItemStatus`, for use in a WHERE clause.
 *
 * WARNING: this is a deliberate duplicate of the TypeScript function above.
 * PostgreSQL cannot call back into it, so the ladder is written twice and the
 * two must change together. If the TS order ever moves — damaged ahead of
 * borrowed, say, or a fifth arm added to one and not the other — this
 * expression has to move in the same commit, or the filtered list stops
 * agreeing with the badges it renders. The two arms and their order are the
 * contract; nothing else about either implementation is.
 *
 * The arms must also keep the status literals exactly as spelled in
 * `InventoryItemStatus`, because that union is the type `InventoryItemView`
 * carries to the web app.
 *
 * It qualifies its columns as `inventory_item`, so it belongs in a query whose
 * `FROM` is `inventoryItem` un-aliased; a caller that reaches for
 * `alias(inventoryItem, ...)` has to rewrite the expression by hand.
 */
export const itemStatusExpression = (): SQL =>
  sql`case
    when ${inventoryItem.qty} = 0 then 'out_of_stock'
    when ${inventoryItem.borrowedQty} > 0 then 'borrowed'
    when ${inventoryItem.condition} = 'Damaged' then 'damaged'
    else 'available'
  end`;

/**
 * One five-digit roll. Module scope so `generateSku` does not rebuild a closure
 * on every call, and named so the shape of a SKU is in one place.
 */
const rollSkuDigits = (): string =>
  `INV-${String(Math.floor(10_000 + Math.random() * 90_000))}`;

/**
 * `INV-` plus five digits, the shape the source app's storebook used and the
 * one a school's existing spreadsheets already assume. It is the same shape
 * `inventory_item_sku_format` CHECK accepts, so a generated SKU can never be
 * refused by the database for its format.
 *
 * The digits are random rather than sequential because a SKU is an identifier,
 * not a rank: two storekeepers creating items in the same second must not
 * collide. A caller that genuinely wants a sequence should count rows, not
 * re-roll this.
 *
 * `exists` is an optional collision probe and the caller owns the question,
 * because only the caller has the database: this function is pure, so it
 * cannot know whether `INV-47182` is already on file. Supplying `exists` turns
 * a rare unique-index violation into a silent re-roll. It is called at most
 * `SKU_COLLISION_RETRIES` times, and the last candidate is returned regardless
 * — after that the `inventory_item_sku_unique` index is the authority, and a
 * caller that would rather see that error than a loop should omit `exists` and
 * let the insert fail. The `sku` is expected to already be upper-case, which
 * `inventory_item_sku_upper` requires.
 */
export const generateSku = (
  exists?: (candidate: string) => boolean
): string => {
  let candidate = rollSkuDigits();

  for (let attempt = 0; attempt < SKU_COLLISION_RETRIES; attempt += 1) {
    if (!exists || !exists(candidate)) {
      return candidate;
    }

    candidate = rollSkuDigits();
  }

  return candidate;
};

const toIsoDate = (value: Date): string => value.toISOString().slice(0, 10);

/** Today as an ISO `YYYY-MM-DD` string, in UTC. */
export const todayIsoDate = (): string => toIsoDate(new Date());

/**
 * A date `days` from `from` (today when omitted), as an ISO `YYYY-MM-DD`
 * string in UTC.
 *
 * The arithmetic is done on a UTC-anchored instant and re-sliced, rather than
 * with `setDate` on a local-time `Date`. Both give the right answer on a fixed
 * offset, but only this one is right in a zone that observes daylight saving,
 * where `setDate` can land on the previous calendar day — and the stored format
 * is a bare date with no offset to correct the mistake afterwards.
 */
export const addDaysIsoDate = (days: number, from?: string): string => {
  const base = from === undefined ? new Date() : new Date(`${from}T00:00:00Z`);
  return toIsoDate(new Date(base.getTime() + days * 86_400_000));
};
