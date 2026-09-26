import type { QueryClient } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

/**
 * Every query key an inventory mutation can dirty, in one place.
 *
 * ## Why `input: {}` and not the caller's own input — **do not "optimise" this away**
 *
 * An oRPC query key is `[path, { input?, type }]`
 * (`generateOperationKey` in `@orpc/tanstack-query`), and TanStack's
 * `invalidateQueries({ queryKey })` does a **partial** deep match via
 * `partialMatchKey(filter, target)` from `@tanstack/query-core`: the *filter is the
 * subset*. It walks the filter's own keys and asks only "is this present and equal in
 * the target?" — keys the target has that the filter does not mention are ignored.
 *
 * So the `input` element of a filter is a **set of input keys to require**, not a set
 * to require *all* of. An **empty** `input: {}` declares no keys at all, and therefore
 * matches **every** input that procedure has ever been called with. That is the whole
 * point: the register on screen is filtered, the low-stock stat card is not, the
 * write-off dialog's item picker searched for "projector", and the tag register is
 * unfiltered — a write has to invalidate all of them. A key built from any one
 * caller's input would leave the rest of the feature showing numbers from before the
 * write.
 *
 * This is verified against the real `@tanstack/query-core` `partialMatchKey`, not
 * assumed. Three cases, all of which hold:
 *
 * 1. **The empty-`input` filter matches a filtered page and an unfiltered page.**
 *    `partialMatchKey({input:{}}, {input:{search:"abc",status:"borrowed"}}) === true`
 *    and `partialMatchKey({input:{}}, {input:{}}) === true`. The first element of each
 *    key is compared with `partialDeepEqual` and the path matches, so the empty
 *    `input` reaches every input shape.
 * 2. **A specific-input filter does NOT match a differently-filtered page.** The filter
 *    declares `input: { status: "borrowed" }`; a target with `input: { status: "damaged" }`
 *    has a *different* value at that key, so it does not match, and a target with
 *    `input: { search: "abc" }` does not even have the key. This is what makes the
 *    empty `input` necessary rather than merely convenient.
 * 3. **A differing path element never matches.** `items.list` and `items.get` share
 *    the first two path elements, and the wildcard still does not cross over, because
 *    the third element is compared by value.
 *
 * If someone "tidies" the `{}` into the current filter's input, or drops the `input`
 * key, or hand-writes `[["inventory","items","list"]]`, every one of the eleven
 * mutation handlers this module was written for goes back to invalidating one page of
 * one list — and the audit trail stops refreshing, which is the exact defect this file
 * exists to end. `ledger.auditLogs` is in **every** scope below for that reason.
 *
 * ## Why three of the twelve are built with `.key()` instead
 *
 * `queryOptions({ input: {} }).queryKey` is the form this feature already uses
 * (`inventory-page.tsx`) and it is used for the nine procedures whose inputs are all
 * optional. Three entries cannot use it, and each for a stated reason rather than a
 * preference:
 *
 * - `items.get` and `custody.history` have a **required** input, and
 *   `QueryKeyOptions<TInput>` types `input` as the full `TInput | SkipToken` — not
 *   `PartialDeep<TInput>` — so `input: {}` does not compile.
 * - `categories.list` takes no input at all, so its real keys have **no `input`
 *   element**, and a filter carrying `input: {}` would ask for a key the target does
 *   not have and match *nothing*. The mirror image of the trap above.
 *
 * `GeneralUtils.key` — documented by oRPC as *"Generate a **partial matching** key for
 * actions like revalidating queries"*, with `input` typed `PartialDeep<TInput>` —
 * handles all three and emits the identical `[path, { input, type }]` tuple by the
 * same `generateOperationKey`. Still derived from the router, no hand-written path
 * string, no cast.
 */
export const inventoryQueryKeys = {
  /** The register list — filtered, paged, and also the unfiltered stat source. */
  items: orpc.inventory.items.list.queryOptions({ input: {} }).queryKey,
  /**
   * The item detail read. **Built with `.key()` rather than
   * `queryOptions(...).queryKey`, and the reason is the type, not a preference.**
   *
   * `items.get` takes a *required* `itemId`, and `QueryKeyOptions<TInput>` in
   * `@orpc/tanstack-query` types `input` as the full `TInput | SkipToken` — not
   * `PartialDeep<TInput>`, as `OperationKeyOptions` does — so `input: {}` does not
   * typecheck here and a wildcard could not be written through `queryOptions`.
   *
   * `GeneralUtils.key` is the API oRPC provides for exactly this: its own doc reads
   * *"Generate a **partial matching** key for actions like revalidating queries"*,
   * its `input` is `PartialDeep<TInput>`, and it emits the identical key —
   * `[[...path], { input: {}, type: "query" }]` — by the same
   * `generateOperationKey`. No hand-written path string, and no cast.
   */
  item: orpc.inventory.items.get.key({ input: {}, type: "query" }),
  /** The tag register, for one item or for the school. */
  units: orpc.inventory.units.list.queryOptions({ input: {} }).queryKey,
  /**
   * Takes no input at all, so its real keys carry **no `input` element** and a
   * filter carrying `input: {}` would match nothing — the mirror image of the trap
   * above, and the reason this one is commented rather than left to be inferred.
   * `.key({ type: "query" })` omits `input` because `generateOperationKey` drops a
   * `state.input` that is `undefined`. Every other procedure here is called with an
   * input object, so every other entry carries the empty one.
   */
  categories: orpc.inventory.categories.list.key({ type: "query" }),
  /** The picker source, shared by every manager/custodian/borrower field. */
  assignableStaffOptions: orpc.inventory.options.assignableStaff.queryOptions({
    input: {},
  }).queryKey,
  /** Open and closed loans, filtered by borrower, item, status and overdue. */
  borrows: orpc.inventory.borrows.list.queryOptions({ input: {} }).queryKey,
  /** Permanent issues out. */
  issues: orpc.inventory.issues.list.queryOptions({ input: {} }).queryKey,
  /** Write-offs, including the certificates on a pending one. */
  disposals: orpc.inventory.disposals.list.queryOptions({ input: {} }).queryKey,
  /** The counter ledger — the before/after pair on every movement. */
  transactions: orpc.inventory.ledger.transactions.queryOptions({
    input: {},
  }).queryKey,
  /**
   * The change log. **Every** scope invalidates it: `ledger-views.tsx` promises that
   * every create, edit and lifecycle step writes a row here, and a clerk who raises a
   * write-off and switches to the Change log must see the row they just created.
   */
  auditLogs: orpc.inventory.ledger.auditLogs.queryOptions({ input: {} })
    .queryKey,
  /** `itemId` is required — `.key()` for the same reason as `item` above. */
  custodyHistory: orpc.inventory.custody.history.key({
    input: {},
    type: "query",
  }),
  /** A teacher's own holdings, on the teacher portal. */
  myItems: orpc.inventory.custody.myItems.queryOptions({ input: {} }).queryKey,
} as const;

/**
 * What a mutation changed, which is what decides what has to be re-read.
 *
 * A *scope*, not a procedure name: `custody.transfer` and `custody.assignManager` are
 * two procedures and one scope, because a screen does not care which was called — it
 * cares that accountability moved. Ten scopes cover the eleven dialog-level handlers
 * (`disposalDecision` is approve / finalize / cancel, three procedures and one scope,
 * because none of them touches anything the others do not).
 */
export type InventoryMutationScope =
  | "item"
  | "stock"
  | "unit"
  | "category"
  | "custody"
  | "issue"
  | "borrow"
  | "return"
  | "disposal"
  | "disposalDecision";

/**
 * The exact key set each scope dirties, written out per scope rather than computed.
 *
 * A hand-written table is the point. The obvious "clever" version — invalidate
 * everything, every time — would be correct and would also refetch the whole feature
 * (nine list procedures, four tables each) on every keystroke-adjacent write, on the
 * school's LAN, and would make the invalidation cost invisible. Listing each scope
 * means the cost of a write is readable, and a scope that grows a new consequence is a
 * one-line edit here rather than a bug on a screen.
 *
 * ## The question each entry has to answer, and the audit that asked it
 *
 * One question per scope, and it is the same one every time: **does the procedure
 * this scope names change a key the scope does not list?** A key the scope omits is
 * the only kind of mistake this table can make, because every key here exists to be
 * invalidated and an omission is invisible — the screen that needed it is the one
 * that goes stale.
 *
 * Asked of all ten scopes against the procedures in
 * `packages/api/src/routers/inventory/`, it found exactly one omission, in `item`,
 * and it is recorded there. `custody` was the other candidate and is already
 * complete: `releaseCustody` nulls `custodianStaffId`, which is precisely what
 * `custody.myItems` filters on (`list-my-items.ts` matches
 * `managerStaffId = me OR custodianStaffId = me`), and `custodyHistory` is in the
 * same scope because all four custody procedures write a history row. The scopes
 * that leave both out are the ones that genuinely touch neither: `stock`, `unit`,
 * `issue`, `borrow`, `return`, `disposal` and `disposalDecision` move quantities
 * and unit statuses, and none of them writes a `managerStaffId` or a
 * `custodianStaffId` — which is why `updateItem` refusing those two columns is
 * documented as a safety property and not a limitation.
 */
const SCOPE_KEYS: Record<
  InventoryMutationScope,
  readonly (keyof typeof inventoryQueryKeys)[]
> = {
  /**
   * `item` — create, edit, or delete an item line. The register, the detail read, the
   * tag register, both ledger tabs and the category list (a deleted item can take a
   * category's last line with it, so the category counts are re-read), and the
   * write-off list (an item with history cannot be hard-deleted, and asking about its
   * certificates has to give the new answer).
   *
   * **`myItems` and `custodyHistory` are here for `items.create`, and for nothing
   * else in this scope.** It is the only one of the three item procedures that
   * touches either, and it does both in the one call: `createItem` accepts a
   * `custodianStaffId` and, when it is given, inserts the **first**
   * `inventoryCustodyHistory` row for the item in the same transaction as the item
   * itself. So creating an item that is handed straight to a teacher changes what
   * that teacher's `custody.myItems` returns *and* writes a row onto the admin's own
   * `custody.history` sheet — and both of those were left showing the school as it
   * was a moment ago, which is the exact failure the `custody` scope below already
   * handled for a transfer and nobody carried across.
   *
   * `updateItem` cannot reach either one, and that is deliberate rather than an
   * oversight: it refuses `managerStaffId` and `custodianStaffId` precisely *because*
   * the history row is the record of those two columns, so a "create" is the only
   * way a new line arrives with a holder attached.
   */
  item: [
    "items",
    "item",
    "myItems",
    "units",
    "transactions",
    "auditLogs",
    "categories",
    "disposals",
    "custodyHistory",
  ],

  /**
   * `stock` — `stockIn` / `stockOut`. The two counters and everything derived from
   * them change; the category counts do not, and no write-off was created, so
   * `categories` and `disposals` are left alone.
   */
  stock: ["items", "item", "units", "transactions", "auditLogs"],

  /**
   * `unit` — a single tagged unit's status, condition or location. `unit` and `item`
   * are re-read first because the unit list is always scoped to an item, and `items`
   * because a unit's status feeds the item's `availableQty` and therefore its badge.
   */
  unit: ["units", "item", "items", "transactions", "auditLogs"],

  /**
   * `category` — create, rename, recolour or remove a category. The category list and
   * the register both move (a rename has to reach every row that names it). No unit,
   * no write-off, no loan.
   */
  category: ["categories", "items", "transactions", "auditLogs"],

  /**
   * `custody` — transfer, assignManager, take, release. The register and the detail
   * read because the two current pointers are columns on the item; `myItems` because a
   * teacher's own holdings change the moment the item changes hands; `custodyHistory`
   * because every one of these writes a history row. The ledger tabs are in because
   * these are audited and counted movements.
   */
  custody: [
    "items",
    "item",
    "myItems",
    "custodyHistory",
    "transactions",
    "auditLogs",
  ],

  /**
   * `issue` — a permanent issue out. The register (it leaves the store), the detail
   * read, the tag register (issued units leave the available pool), and the issue
   * list, which is the only place a new issue row is visible.
   */
  issue: ["items", "item", "units", "issues", "transactions", "auditLogs"],

  /**
   * `borrow` — `borrows.create`. Same shape as `issue` with `borrows` in place of
   * `issues`: `qty` is untouched, so the register's *availability* changes but the
   * line count does not, and the loan itself is only visible on `borrows.list`.
   */
  borrow: ["items", "item", "units", "borrows", "transactions", "auditLogs"],

  /**
   * `return` — `borrows.return`. Identical key set to `borrow` on purpose: a return is
   * the same fact arriving from the other direction, and an asymmetric table here
   * would be a bug waiting to be written.
   */
  return: ["items", "item", "units", "borrows", "transactions", "auditLogs"],

  /**
   * `disposal` — raise a write-off. The register (it is on its way out), the detail
   * read, the tag register (the units are claimed off the shelf) and the disposal list
   * where the pending row and its certificates now exist.
   */
  disposal: [
    "items",
    "item",
    "units",
    "disposals",
    "transactions",
    "auditLogs",
  ],

  /**
   * `disposalDecision` — approve, finalize or cancel. Same key set as `disposal`: a
   * decision changes the disposal's state and the item's, and nothing here reaches a
   * loan or an issue.
   */
  disposalDecision: [
    "items",
    "item",
    "units",
    "disposals",
    "transactions",
    "auditLogs",
  ],
};

/**
 * Invalidate everything a mutation of `scope` made stale.
 *
 * Returns `Promise.all` over the scope's keys so a caller can `await` the whole set
 * before it toasts or closes a dialog. The promises run **concurrently** and the
 * result is a plain `void[]` rather than a resolved summary: the only two things a
 * caller can do with it are await it and ignore it, and anything richer would be
 * invented surface. `invalidateQueries` does not reject on a failed refetch — the
 * `QueryCache` `onError` in `@/utils/orpc` toasts those — so nothing here throws.
 *
 * The eleven dialog-level handlers this exists for each declared their own list, and
 * **not one of them included `auditLogs`**. A clerk who raised a write-off, switched
 * to the Change log and found no row had been told the truth about a screen that
 * promises otherwise. `ledger-views.tsx` says the trail is complete; this is what
 * makes that sentence true.
 *
 * The `void[]` is `Promise.all`'s own element type over `invalidateQueries`, which
 * resolves `Promise<void>` per key. `no-invalid-void-type` objects to `void` in a
 * generic argument, and it is right to in general — but here the array is returned
 * purely to be awaited, its length is never read, and widening it to a result the
 * caller has no use for would be inventing surface.
 */
export const invalidateInventory = (
  queryClient: QueryClient,
  scope: InventoryMutationScope
  // oxlint-disable-next-line typescript/no-invalid-void-type -- Promise.all's element type over invalidateQueries; returned only so a caller can await the whole set
): Promise<void[]> =>
  Promise.all(
    SCOPE_KEYS[scope].map((name) =>
      queryClient.invalidateQueries({ queryKey: inventoryQueryKeys[name] })
    )
  );
