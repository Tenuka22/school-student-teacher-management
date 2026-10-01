"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@school-student-teacher-management/ui/components/alert-dialog";
import { Checkbox } from "@school-student-teacher-management/ui/components/checkbox";
import {
  Table,
  TableBody,
  TableCaption,
} from "@school-student-teacher-management/ui/components/table";
import { useCallback, useMemo, useState } from "react";

import { QueryErrorPanel } from "@/components/query-error-panel";
import {
  ReclaimCustodyDialog,
  TransferOwnershipDialog,
} from "@/components/staff/inventory/custody-dialogs";
import {
  RegisterEmptyState,
  RegisterStaleNotice,
} from "@/components/staff/inventory/inventory-register-states";
import { InventoryRow } from "@/components/staff/inventory/inventory-row";
import {
  buildRegisterCaption,
  RegisterTableHeader,
  RegisterTableSkeleton,
  SORT_SCOPE_NOTE_ID,
  SORT_SCOPE_NOTE,
} from "@/components/staff/inventory/inventory-table-frame";
import type {
  SortKey,
  SortState,
} from "@/components/staff/inventory/inventory-table-frame";
import type { InventoryItemView } from "@/components/staff/inventory/inventory-types";
import { formatApiErrorMessage } from "@/lib/api-error";

/**
 * The register, as a table — the state machine, and the four dialogs its row
 * menu raises.
 *
 * ## What is split out of this file, and along which seams
 *
 * The component below used to be 300 lines of one function, and every one of the
 * arguments that made it long belonged to a different concern:
 *
 * - **Row and cell rendering** — `inventory-row.tsx`. The nine columns and the
 *   decision each of six of them carries.
 * - **The table's frame** — `inventory-table-frame.tsx`. The column order, the two
 *   sort controls, the sort-scope note, and the placeholder that reserves the
 *   same layout while the register is being read.
 * - **The states that are not the table** — `inventory-register-states.tsx`. The
 *   two empty states, the stale-rows notice, and the selection bar.
 * - **The retire/restore dialogs and their targets** — `useRegisterDialogs` and
 *   `RegisterDialogs` below. Two `AlertDialog`s, two pieces of open state and the
 *   four handlers that connect them, which is a self-contained unit and was
 *   thirty lines of the table's body.
 *
 * What is left is what is genuinely the table's own: which state it is in, which
 * rows it draws, and the four dialogs the row menu opens.
 */

export interface InventoryTableProps {
  items: InventoryItemView[] | undefined;
  totalCount: number | undefined;
  isLoading: boolean;
  /** Whether a filter is narrowing the list — decides which empty state is honest. */
  isFiltered: boolean;
  error: unknown;
  onRetry: () => void;
  /**
   * Whether a retry is actually in flight, so the error panel's button can report
   * progress rather than inviting a second click on a request already running.
   */
  isRetrying?: boolean;
  onClearFilters: () => void;
  /** False on a fresh install, which is when "seed the categories" is the right first action. */
  hasCategories: boolean;
  isSeedPending: boolean;
  onSeedCategories: () => void;
  onCreateItem: () => void;
  /**
   * The table's subject, in the app's own words, with the academic year it
   * addresses — `"Inventory register, academic year 2027"`.
   *
   * It goes in the `<caption>` and nowhere else. The page's `<h1>` and the pane's
   * `<h2>` are both outside the table and both change with the pane, and a table
   * navigated cell by cell is given neither.
   */
  registerLabel?: string;
  /**
   * The filters in force, as a sentence — "No filters are applied.", or
   * "Filtered by search “projector”, status Borrowed, one custodian's items."
   *
   * Optional, and the default is the unfiltered sentence, so a caller that knows
   * nothing about the page's filter state still gets an honest name. It is a
   * sentence rather than a clause because it appears in two places at once — the
   * table's caption and the no-results state — and a fragment that reads correctly
   * after one of them reads wrong after the other. It is also printed in the
   * no-results state, which is why it is one prop rather than two: the caption and
   * the empty state must not be able to disagree about what is narrowing the list.
   */
  filterSummary?: string;
  onOpenItem: (item: InventoryItemView) => void;
  onViewCustody: (item: InventoryItemView) => void;
  onTransferCustody: (item: InventoryItemView) => void;
  onAssignManager: (item: InventoryItemView) => void;
  onTransferOwnership: (item: InventoryItemView) => void;
  onReclaimCustody: (item: InventoryItemView) => void;
  onTakeItem: (item: InventoryItemView) => void;
  onReleaseCustody: (item: InventoryItemView) => void;
  /** Whether the caller's role holds `inventory: ["take"]` — see `InventoryRowProps`. */
  canSelfServe: boolean;
  onEditItem: (item: InventoryItemView) => void;
  /**
   * Resolves on success and **rejects on a refusal** — a unit still borrowed, issued
   * or awaiting disposal — which is a documented outcome, not an exceptional one. The
   * table catches it (see `useRegisterDialogs`) and the page's mutation handler toasts
   * the server's sentence; this prop is passed straight through rather than wrapped in a
   * `void`-returning shim, because the dialog's confirm handler needs to know the
   * promise can reject.
   */
  onRetireItem: (item: InventoryItemView) => Promise<void>;
  /** Disables the confirm button while the write is in flight. */
  isRetirePending: boolean;
  /**
   * The inverse. **Rejects** for the same documented reason `onRetireItem` does —
   * a live item under the same SKU is a real outcome, and the page's mutation
   * observer toasts the server's sentence.
   */
  onRestoreItem: (item: InventoryItemView) => Promise<void>;
  isRestorePending: boolean;
  /** Live rows this reader has ticked for the QR label sheet — see the table's own doc comment. */
  selectedIds: Set<string>;
  /** Every live row's id on this page, for "select all". */
  selectableIds: string[];
  onToggleSelect: (itemId: string) => void;
  onToggleSelectAll: () => void;
}

/**
 * The destructive confirmation, and it lives with the table because the row menu
 * is what raises it.
 *
 * `items.remove` is a **soft** delete, and the copy says so: the row leaves the
 * working register and every ledger row that describes it — its unit movements,
 * its custody trail, its borrow history — stays in the database, because an
 * asset register that can lose a row is not an asset register. The server also
 * refuses outright while any unit is borrowed, issued or disposed, and it names
 * the offending asset tag when it does, so the dialog promises a retirement and
 * the refusal is a message about a specific device rather than a surprise.
 */
const RetireItemDialog = ({
  item,
  isPending,
  onCancel,
  onConfirm,
}: {
  item: InventoryItemView | null;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) => (
  <AlertDialog
    open={item !== null}
    onOpenChange={(open) => {
      if (!open) {
        onCancel();
      }
    }}
  >
    <AlertDialogContent className="sm:max-w-md">
      <AlertDialogTitle>Retire {item?.name ?? "this item"}</AlertDialogTitle>
      <AlertDialogDescription>
        {item ? (
          <>
            <span className="font-mono text-xs">{item.sku}</span> — {item.qty}{" "}
            unit(s) will leave the working register. Nothing is deleted: the
            movement ledger, the custody trail and every loan of this item stay
            on file and remain auditable. An item cannot be retired while any of
            its units is borrowed, issued or awaiting disposal — the server will
            say which one.
          </>
        ) : null}
      </AlertDialogDescription>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          onClick={onConfirm}
          disabled={isPending}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {isPending ? "Retiring..." : "Retire item"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

/**
 * The restore confirmation, and it is an `AlertDialog` for the same reason the
 * retirement one is — **the write is reversible in the other direction too, and
 * that is the whole reason to ask.**
 *
 * A storekeeper who has just turned "Show retired" on is looking at a row that is
 * off the register, and restoring it puts it straight back into the working set:
 * it becomes lendable, issuable, editable and countable again, in front of
 * everyone else using the register. So the dialog states the two things that
 * change — the row comes back, and nothing about its history, counters or
 * responsibilities was lost while it was out — and it names what the server
 * refuses: a restore whose SKU has meanwhile been taken by a live line.
 *
 * **It asks for no reason, and that is `restore-item.ts`'s decision, not an
 * omission here.** There is nothing in this flow to justify: the ledger already
 * carries who retired the item, when, who restored it and when, and the change log
 * carries the full before/after pair. A text box whose value would be "restored" on
 * every invocation is a field nobody reads.
 */
const RestoreItemDialog = ({
  item,
  isPending,
  onCancel,
  onConfirm,
}: {
  item: InventoryItemView | null;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) => (
  <AlertDialog
    open={item !== null}
    onOpenChange={(open) => {
      if (!open) {
        onCancel();
      }
    }}
  >
    <AlertDialogContent className="sm:max-w-md">
      <AlertDialogTitle>
        Put {item?.name ?? "this item"} back on the register
      </AlertDialogTitle>
      <AlertDialogDescription>
        {item ? (
          <>
            <span className="font-mono text-xs">{item.sku}</span> — {item.qty}{" "}
            unit(s) and the {item.categoryName.toLowerCase()} it belongs to
            return to the working register with everything they had: the same
            manager and custodian, the same asset tags, the same counted
            quantity. It can be lent, issued, written off and edited again from
            that moment, and the retirement and this restore both stay in the
            change log. The server will refuse if the same code has meanwhile
            been given to a live item.
          </>
        ) : null}
      </AlertDialogDescription>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm} disabled={isPending}>
          {isPending ? "Restoring..." : "Restore to the register"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

/**
 * The two ends of the retirement flow: their targets, their confirms, and the two
 * `AlertDialog`s that are the only way to reach them.
 *
 * **Why a hook and not four pieces of state in the table's body.** The two
 * dialogs are opened by a row menu, so their subject has to be the row the menu was
 * opened from rather than a second copy taken from the page — which would be a fresh
 * stale snapshot, and would mount a retire for an item the reader had already
 * navigated away from. Held together, that pairing is the whole of the state; split
 * across the table's body it is four `useState`s whose connection is the reader's
 * job to see, which is how a confirmation ends up confirming a different row from
 * the one whose menu raised it.
 *
 * `open` is *derived* from the target rather than held beside it: a `null` target is
 * exactly a closed dialog, so there is no second piece of state to fall out of step
 * and no way to reach a mounted dialog for no item.
 */
const useRegisterDialogs = ({
  onRetireItem,
  isRetirePending,
  onRestoreItem,
  isRestorePending,
}: Pick<
  InventoryTableProps,
  "onRetireItem" | "isRetirePending" | "onRestoreItem" | "isRestorePending"
>) => {
  const [retireTarget, setRetireTarget] = useState<InventoryItemView | null>(
    null
  );
  const [restoreTarget, setRestoreTarget] = useState<InventoryItemView | null>(
    null
  );

  /**
   * The writes themselves, wrapped so a refusal cannot escape as an unhandled
   * rejection.
   *
   * **`items.remove` refuses while any unit is borrowed, issued or awaiting disposal,
   * and a refusal is the documented common case** — it is what a storekeeper retiring
   * a projector in the middle of term will hit. `mutateAsync` rejects, the page's
   * `onError` has already toasted the sentence naming the offending asset tag, and
   * nothing else wants the rejection. `void` on the bare promise put an unhandled
   * rejection on the console for every one of them, which is how a *normal* outcome
   * ends up looking like a bug in the error reporting.
   *
   * `try`/`catch` rather than `.catch()` on the call, because `prefer-await-to-then`
   * is right about the readable form here; and no `finally`, because the React
   * Compiler cannot analyse a `finally` with no `catch` beside it — there is no
   * cleanup to do in the first place.
   */
  const retire = useCallback(
    async (item: InventoryItemView) => {
      try {
        await onRetireItem(item);
      } catch {
        // Reported by the page's mutation observer. See above.
      }
    },
    [onRetireItem]
  );

  /**
   * The restore write, wrapped for the identical reason as `retire` above: a
   * `CONFLICT` on the SKU is a documented outcome rather than an exceptional one,
   * `mutateAsync` rejects, the page's `onError` has already toasted the sentence
   * naming the live line that holds the code, and nothing else wants the rejection.
   */
  const restore = useCallback(
    async (item: InventoryItemView) => {
      try {
        await onRestoreItem(item);
      } catch {
        // Reported by the page's mutation observer.
      }
    },
    [onRestoreItem]
  );

  /**
   * Confirm and close.
   *
   * The dialog closes on the click rather than on the mutation settling, and that
   * is deliberate on both sides: the confirmation has done its job the moment the
   * user confirms, and a dialog frozen open on a spinner while a soft delete
   * completes in a few hundred milliseconds is a worse read than one that gets out of
   * the way. The outcome is not lost — the page's mutation toasts it, and a
   * refusal (a unit still borrowed, issued or awaiting disposal) arrives as a
   * sentence naming the asset tag that caused it.
   */
  const confirmRetire = useCallback(() => {
    const target = retireTarget;
    if (!target) {
      return;
    }

    setRetireTarget(null);
    void retire(target);
  }, [retire, retireTarget]);

  const confirmRestore = useCallback(() => {
    const target = restoreTarget;
    if (!target) {
      return;
    }

    setRestoreTarget(null);
    void restore(target);
  }, [restore, restoreTarget]);

  return {
    retire: { target: retireTarget, isPending: isRetirePending },
    restore: { target: restoreTarget, isPending: isRestorePending },
    setRetireTarget,
    setRestoreTarget,
    confirmRetire,
    confirmRestore,
  };
};

/**
 * The two owner dialogs a row menu can open: their targets, and the local patch
 * that reconciles the row behind them.
 *
 * **Why this is a hook and not four pieces of state in the table.** The two dialogs
 * own their mutations, toasts and invalidation, so all that is left is open state —
 * and open state that is *only* useful together with the patch it produces. Split
 * across the table's body it is four `useState`s and two `onRecorded` handlers whose
 * connection is the reader's job to see, which is how a local reconciliation ends up
 * quietly dropped the next time a row menu grows a fifth entry.
 *
 * It takes the row menu's own two handlers, because **opening either verb does two
 * things and needs both.** The table sets its own target, because the dialog's `item`
 * has to be *the row as this table currently believes it* — the one `rows` has just
 * reconciled, not a second copy taken from the page, which would be a fresh stale
 * snapshot and would mount a reclaim for a holder the hand-on has already released.
 * And the page's handler still runs, because the register keeps exactly one answer to
 * "which item is this about" and every other row action upholds it. The two are not
 * competing stores: `selectedItem` is the register's selection, and a target is one
 * dialog's subject.
 */
const useOwnerVerbs = (
  items: InventoryItemView[] | undefined,
  onTransferOwnership: (item: InventoryItemView) => void,
  onReclaimCustody: (item: InventoryItemView) => void
) => {
  const [ownershipTarget, setOwnershipTarget] =
    useState<InventoryItemView | null>(null);
  const [reclaimTarget, setReclaimTarget] = useState<InventoryItemView | null>(
    null
  );
  const [recentWrite, setRecentWrite] = useState<LocalCustodyWrite | null>(
    null
  );

  /**
   * The hand-on's `onRecorded`, turned into a patch on the one row it is about.
   *
   * **What the callback gives us, and what it does not.** `TransferOwnershipDialog`
   * reports `{ staffId, name }` for the new owner — both columns, which is the half
   * the "Responsible" cell reads. It does not report the holder, and that is not an
   * omission in the callback: `transferOwnership` writes the holder in the same
   * `set` that writes the new manager, and the holder *is* the new owner — the two
   * pointers converge on the same person — so this handler can derive the pair from
   * the owner it was handed. The custody sheet's handler writes the same pair by
   * hand for the same reason, and this is that handler, one layer up.
   *
   * **A patch rather than a replacement row, and applied to the row rather than to
   * the page's `selectedItem` — that is the difference from the sheet, and it is the
   * point.** The thing that must stop being stale is the *row*, because the row's
   * menu is what gates "Call it back" on `hasCustodian`. A hand-on leaves the item
   * held — by the successor — so without this the entry would outlive the write by
   * a few hundred milliseconds against the wrong holder, which is a menu item that
   * opens a dialog naming the wrong colleague.
   *
   * `ownershipTarget` rather than a ref, because this is read during a render the
   * dialog's own `onOpenChange(false)` has not yet invalidated: the target is the
   * only statement of *which* row the callback is about, and the dialog that reported
   * it was opened from it.
   */
  const recordOwnership = useCallback(
    (owner: { staffId: string; name: string | null }) => {
      const target = ownershipTarget;
      if (!target) {
        return;
      }

      setRecentWrite({
        source: items,
        itemId: target.id,
        patch: {
          managerStaffId: owner.staffId,
          managerName: owner.name,
          custodianStaffId: owner.staffId,
          custodianName: owner.name,
        },
      });
    },
    [items, ownershipTarget]
  );

  /**
   * The reclaim's `onRecorded`, and the holder it carries is the *new* one.
   *
   * `ReclaimCustodyDialog` reports `{ staffId, name }` — the person in charge,
   * whom `reclaim-custody.ts` has just set as the recorded holder — which is
   * exactly the pair this patch needs; the previous holder's name is in the toast
   * and in the trail, not on the row any more. The manager pair is read back off
   * the target rather than restated, because a reclaim does not touch it: the whole
   * point of the dialog is that calling something back is not a hand-on, and a
   * patch that re-wrote the owner column would be the code disagreeing with its own
   * promise.
   */
  const recordReclaim = useCallback(
    (holder: { staffId: string; name: string | null }) => {
      const target = reclaimTarget;
      if (!target) {
        return;
      }

      setRecentWrite({
        source: items,
        itemId: target.id,
        patch: {
          managerStaffId: target.managerStaffId,
          managerName: target.managerName,
          custodianStaffId: holder.staffId,
          custodianName: holder.name,
        },
      });
    },
    [items, reclaimTarget]
  );

  const openOwnership = useCallback(
    (item: InventoryItemView) => {
      onTransferOwnership(item);
      setOwnershipTarget(item);
    },
    [onTransferOwnership, setOwnershipTarget]
  );

  const openReclaim = useCallback(
    (item: InventoryItemView) => {
      onReclaimCustody(item);
      setReclaimTarget(item);
    },
    [onReclaimCustody, setReclaimTarget]
  );

  /**
   * `open` is *derived* from the target rather than held beside it, which is the
   * second thing that makes these two cheap: a `null` target is exactly a closed
   * dialog, so there is no second piece of state to fall out of step with the first
   * and no way to reach a mounted dialog for no item.
   */
  const closeOwnership = useCallback(
    (open: boolean) => {
      if (!open) {
        setOwnershipTarget(null);
      }
    },
    [setOwnershipTarget]
  );

  const closeReclaim = useCallback(
    (open: boolean) => {
      if (!open) {
        setReclaimTarget(null);
      }
    },
    [setReclaimTarget]
  );

  return {
    recentWrite,
    openOwnership,
    openReclaim,
    ownershipDialog: {
      open: ownershipTarget !== null,
      item: ownershipTarget,
      onOpenChange: closeOwnership,
      onRecorded: recordOwnership,
    },
    reclaimDialog: {
      open: reclaimTarget !== null,
      item: reclaimTarget,
      onOpenChange: closeReclaim,
      onRecorded: recordReclaim,
    },
  };
};

/**
 * The four pointer columns a custody write can move, and nothing else.
 *
 * It is deliberately not the whole `InventoryItemView`: a local reconciliation is a
 * claim about two facts the register got wrong for a few hundred milliseconds, and
 * a type that can carry more of the row is a type that will eventually carry a `qty`
 * somebody guessed at. Both of the dialogs that report through `onRecorded` move
 * pointers and nothing else — `transferOwnership` writes both pointers onto the new
 * owner, and `reclaimCustody` moves `custodianStaffId` onto the person in charge —
 * so these four fields are the entire difference between the row the server has and
 * the row the browser is still holding.
 */
interface CustodyPointers {
  managerStaffId: string | null;
  managerName: string | null;
  custodianStaffId: string | null;
  custodianName: string | null;
}

/**
 * A local correction to one row, and the `items` array it was made against.
 *
 * **`source` is the load-bearing field, and it is what retires the patch without an
 * effect.** Both dialogs invalidate the `custody` scope themselves, so the refetch
 * carrying the server's real answer is already in flight the moment `onRecorded`
 * fires; the patch covers the gap between the write landing and that response
 * arriving. The refetch delivers a **new array** for `items`, so `source` stops
 * matching the moment the server has answered and the row is the server's row again.
 *
 * The alternative was a `useEffect` clearing the patch on `items`, which buys the
 * same result one render later — after a frame in which the patch and the refetch
 * disagree, which is precisely the frame `CustodyHistorySheet` derives its `view`
 * during render in order to avoid. And because a patch is a *guess about four
 * columns* rather than a fork of the row, a superseded one is simply not applied: it
 * cannot outvote a later refetch, and it cannot outvote a change another dialog
 * made. Nothing has to remember to clear it, because nothing can reach it.
 */
interface LocalCustodyWrite {
  source: InventoryItemView[] | undefined;
  itemId: string;
  patch: CustodyPointers;
}

/**
 * The rows the table draws: the loaded page, sorted, with any local write applied.
 *
 * Its own hook, and the mirror of `useRegisterRows` in `inventory-page.tsx` — that
 * one is the page's predicate over what came back, this is the table's ordering and
 * reconciliation over what it was given.
 *
 * ## The client-side sort, and the assumption it rests on
 *
 * **The server has no sort parameter, and this does not pretend otherwise.**
 * `listItems` orders by `createdAt DESC, id DESC` and offers no alternative, so a
 * "sort by name" control here is a sort of the page the server sent — which is a
 * sort of the *whole* result set only because the page is capped at 200 rows
 * (`REGISTER_PAGE_SIZE` in `inventory-page.tsx`, restating `listItems`' own
 * `DEFAULT_LIMIT`, and the two must stay the same number). A school's asset register
 * is a few hundred lines, not a warehouse.
 *
 * The day that stops being true, the "showing N of M" line above this table is what
 * says so — a truncated page makes the truncation visible, which is the signal to
 * move the sort server-side rather than to leave a control that silently sorts an
 * arbitrary slice.
 *
 * `toSorted` rather than `sort`, so the array held in the query cache is never
 * mutated in place.
 *
 * ## The local patch, applied after the sort
 *
 * `useOwnerVerbs` explains the patch itself and why it is anchored to the `items`
 * array's identity rather than cleared by an effect. Two things belong here because
 * they are this memo's decisions: the patch is applied **after** the sort, so the
 * ordering is still the one the reader's own sort produced, and the fast path is
 * untouched — with no patch this returns the same array reference it always did.
 */
const useSortedRows = (
  items: InventoryItemView[] | undefined,
  sort: SortState | null,
  recentWrite: LocalCustodyWrite | null
): InventoryItemView[] =>
  useMemo(() => {
    const list = items ?? [];
    const sorted = sort
      ? list.toSorted((a, b) => {
          const compared =
            sort.key === "name"
              ? a.name.localeCompare(b.name, undefined, { numeric: true })
              : a.availableQty - b.availableQty;

          return sort.direction === "asc" ? compared : -compared;
        })
      : list;

    if (!recentWrite || recentWrite.source !== items) {
      return sorted;
    }

    return sorted.map((row) =>
      row.id === recentWrite.itemId ? { ...row, ...recentWrite.patch } : row
    );
  }, [items, recentWrite, sort]);

/**
 * The header checkbox's two states, which are two questions and not one.
 *
 * `allSelected` is "every selectable row on this page is ticked", so it is false
 * on an empty page rather than vacuously true — a select-all that reads as checked
 * with nothing to check is a control claiming to have done something. `indeterminate`
 * is "some but not all", and it is the state a reader needs: it is what tells
 * them their next click will tick the rest rather than clear the lot.
 */
const headerSelection = (
  selectableIds: readonly string[],
  selectedIds: ReadonlySet<string>
) => {
  const allSelected =
    selectableIds.length > 0 &&
    selectableIds.every((id) => selectedIds.has(id));
  const someSelected =
    !allSelected && selectableIds.some((id) => selectedIds.has(id));
  return { allSelected, someSelected };
};

/**
 * The register's column sort: ascending, descending, then back to the
 * server's own order. Lifted out of `InventoryTable` unchanged, to keep that
 * component under the size limit.
 */
const useColumnSort = () => {
  const [sort, setSort] = useState<SortState | null>(null);

  const toggleSort = useCallback((key: SortKey) => {
    setSort((previous) => {
      if (previous?.key !== key) {
        // First click on a column is ascending, which is what "sort by name"
        // means to the person who clicked it. For `availableQty` it is
        // deliberate too: the empty end of the column is the interesting end.
        return { key, direction: "asc" };
      }

      if (previous.direction === "asc") {
        return { key, direction: "desc" };
      }

      // Third click hands the ordering back to the server, which is a real
      // third state rather than a repeat of ascending: the register's natural
      // order is newest-first and there is no reason to make the user
      // re-derive it.
      return null;
    });
  }, []);

  return { sort, toggleSort };
};

/**
 * The register, as a table.
 *
 * ## The four states, and the one that is dangerous
 *
 * They are told apart before any of them is drawn, because each is a different
 * claim about the store and only one of them can be trusted at a glance:
 *
 * 1. **Nothing has loaded and it failed.** `QueryErrorPanel`, in the server's own
 *    words, with a retry. There is no row and no sentence about the school.
 * 2. **Nothing has loaded yet.** A skeleton that reserves the real layout — the
 *    header band, the column widths, the row rhythm — so the data lands into space
 *    that was already there.
 * 3. **Rows loaded, and a *later* request failed.** The rows stay and a notice
 *    goes above them. This is the one that used to be a lie: the branch order was
 *    `error` first, so a failed refetch threw away a good page of rows and replaced
 *    it with an error, and — in the other direction — a *successful* refetch that
 *    returned nothing was indistinguishable from a store with no items.
 * 4. **Rows loaded and there are none.** Two different sentences, and which one is
 *    true is a decision the register can make from its filters alone: a store with
 *    no items is a first-run problem, and a store whose filters match nothing is a
 *    filter problem with a different recovery.
 *
 * `items === undefined` is what separates 1 and 2 from 3 and 4, and it is the
 * reason `useRegisterRows` on the page hands this component the raw `undefined`
 * rather than an empty array. Coalescing the two would make "we have never asked"
 * and "the answer was nothing" the same value, and a table cannot recover the
 * difference afterwards.
 *
 * ## No bulk *write* — the checkbox column that exists is for one read-only export
 *
 * The register used to carry a comment here refusing any checkbox column outright, on
 * the reasoning that one above a school asset register offers an obvious, dangerous
 * thing: "delete everything ticked". That reasoning still holds for every write this
 * feature makes: the nearest bulk write is a disposal, and a disposal takes **a
 * signature, per unit** — the one irreversible act in the feature, two-staged on
 * purpose, and a row of ticks that quietly produced a mixed write-off across a
 * borrowed projector and a box of chairs would be a false affordance wearing the
 * costume of a convenience. Every destructive action here is still per row, named,
 * and behind an `AlertDialog` — none of that changed.
 *
 * What the ticks *do* select is a printable sheet of QR labels
 * (`export-qr-sheet.ts`), which writes nothing: it reads a name and a SKU per
 * selected row and hands back a PDF. There is no write this checkbox column
 * can trigger, so the risk the old comment named does not apply to it —
 * and retired rows are excluded from "select all" for the same reason they
 * cannot be opened: nothing is left to scan into.
 */
export const InventoryTable = ({
  items,
  totalCount,
  isLoading,
  isFiltered,
  error,
  isRetrying = false,
  onRetry,
  onClearFilters,
  hasCategories,
  isSeedPending,
  onSeedCategories,
  onCreateItem,
  registerLabel = "Inventory register",
  filterSummary = "No filters are applied.",
  onOpenItem,
  onViewCustody,
  onTransferCustody,
  onAssignManager,
  onTransferOwnership,
  onReclaimCustody,
  onTakeItem,
  onReleaseCustody,
  canSelfServe,
  onEditItem,
  onRetireItem,
  isRetirePending,
  onRestoreItem,
  isRestorePending,
  selectedIds,
  selectableIds,
  onToggleSelect,
  onToggleSelectAll,
}: InventoryTableProps) => {
  const { sort, toggleSort } = useColumnSort();

  const dialogs = useRegisterDialogs({
    onRetireItem,
    isRetirePending,
    onRestoreItem,
    isRestorePending,
  });

  const {
    recentWrite,
    openOwnership,
    openReclaim,
    ownershipDialog,
    reclaimDialog,
  } = useOwnerVerbs(items, onTransferOwnership, onReclaimCustody);

  /**
   * The rows this table draws, and the two decisions behind them.
   *
   * Both arguments live in `useSortedRows` — the assumption the client-side sort
   * rests on, and why the local patch is applied after it rather than before. What is
   * left here is the wiring, which is the table's: the page's rows, the reader's own
   * sort state, and whatever the two owner verbs last wrote.
   */
  const rows = useSortedRows(items, sort, recentWrite);

  /** No request has ever answered, as opposed to one that answered with nothing. */
  const isUnresolved = items === undefined;
  const isTruncated =
    totalCount !== undefined && rows.length > 0 && rows.length < totalCount;

  /**
   * `totalCount > 0` alongside an empty page is not reachable today — `listItems`
   * counts `total` against the filter set *before* the limit, so a matched set of
   * one or more always returns at least one row — and the register still treats it
   * as a *filtered* view rather than an empty store. It is one term, and it removes a
   * whole class of "the register says it has nothing and the server says it has some"
   * from ever being reachable by a future limit or offset.
   */
  const isFilteredView = isFiltered || (totalCount ?? 0) > 0;

  const caption = buildRegisterCaption({
    registerLabel,
    filterSummary,
    rowCount: rows.length,
    totalCount,
    isTruncated,
  });

  const { allSelected, someSelected } = headerSelection(
    selectableIds,
    selectedIds
  );

  /**
   * The row menu's four dialogs, addressed by name.
   *
   * The hook returns an object because the state belongs together, and a member
   * expression on a prop is a shape neither a reader nor `react/jsx-handler-names`
   * can check: the rule exists so a prop's handler is findable by its name, and
   * `dialogs.confirmRetire` is not. Six one-line consts turn them back into names.
   */
  const { setRetireTarget, setRestoreTarget } = dialogs;
  const handleOpenRetire = setRetireTarget;
  const handleOpenRestore = setRestoreTarget;
  const handleCancelRetire = useCallback(
    () => dialogs.setRetireTarget(null),
    [dialogs]
  );
  const handleCancelRestore = useCallback(
    () => dialogs.setRestoreTarget(null),
    [dialogs]
  );
  const handleConfirmRetire = dialogs.confirmRetire;
  const handleConfirmRestore = dialogs.confirmRestore;

  if (error && isUnresolved) {
    return (
      <QueryErrorPanel
        isRetrying={isRetrying}
        message={formatApiErrorMessage(
          error,
          "The inventory register could not be read"
        )}
        onRetry={onRetry}
        title="The inventory register could not be loaded"
        note="No items are shown, and nothing has been changed. This is usually a dropped connection on the school network."
      />
    );
  }

  if (isLoading && isUnresolved) {
    return <RegisterTableSkeleton />;
  }

  if (rows.length === 0) {
    return (
      <RegisterEmptyState
        isFiltered={isFilteredView}
        showsFilterSummary={isFiltered}
        hasCategories={hasCategories}
        isSeedPending={isSeedPending}
        onSeedCategories={onSeedCategories}
        onCreateItem={onCreateItem}
        onClearFilters={onClearFilters}
        filterSummary={filterSummary}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/*
        The register is drawing rows it is not certain are current, and it says so
        above them rather than in place of them. See `RegisterStaleNotice`: throwing
        the rows away would be the bigger lie.

        **It is a sibling of the table's frame and not inside it.** The notice has
        its own border and fill — it has to, it is a failure — and a bordered box
        inside the table's bordered frame is the nested-card shape this app is
        trying to stop printing. It also reads better *outside*: the frame is
        "the register", and the notice is something that has happened to it.
      */}
      {error ? (
        <RegisterStaleNotice
          error={error}
          onRetry={onRetry}
          isRetrying={isRetrying}
        />
      ) : null}

      <div className="border-primary/14 flex flex-col gap-3 border p-3">
        {/*
        The sort explanation, in the document rather than in a `title`. It is the one
        sentence that distinguishes "sort" from "reorder the whole register", and a
        `title` is invisible to a keyboard user — every sort button below points at
        this paragraph's id with `aria-describedby`, so it is read on focus as well
        as seen. It sits above the table rather than below it because the affordance
        it qualifies is in the header.
      */}
        <p id={SORT_SCOPE_NOTE_ID} className="text-muted-foreground text-xs">
          {SORT_SCOPE_NOTE}
        </p>

        {/*
        `stickyHeader` pins the column band while the register scrolls, and the
        component's own recipe paints each `<th>` with `bg-background` so rows cannot
        read through the labels. The class here puts the deep-green band back on those
        cells: `cn` is a tailwind-merge, so the later rule wins and the override is
        one declaration rather than an `!important` on every heading. Without it the
        amber column labels would be 3.87:1 on cream.
      */}
        {/*
          `table-fixed`, and the widths that go with it in `RegisterTableHeader`.
          Auto layout left every short-content column — Status, Condition,
          Location — stretched with dead space, because the browser spreads a
          `w-full` table's slack across every column with no explicit width.
          Fixed layout takes each column's width from the header cell instead of
          guessing from content, so only Asset (the one column with no width set)
          absorbs the leftover space. The wrapper still scrolls horizontally on a
          narrow window — nothing here removes that fallback.

          **`min-w-[1184px]` is not decorative — without it, `table-fixed` with
          a `w-full` table does not keep these pixel widths as *minimums*, it
          reads them as *ratios* of whatever width the table is squeezed into.**
          On a laptop-width window this register was rendering two header labels
          on top of each other ("Asset" overlapping "Responsible"): every column
          had shrunk below its own nowrap text, which then painted outside its
          cell into the neighbour's. `1184px` is the sum of every fixed column
          (`RegisterTableHeader`'s `w-*` classes) plus a working floor for Asset,
          the one column deliberately left unconstrained so it still absorbs
          extra room on a wide monitor, and it dropped by the same 96px that
          came out of the Responsible column when `CustodyFlow` replaced the
          two stacked `CustodyBadge` chips with one line — the column needs
          less width the moment it needs less height. Below the min-width the
          table can no longer shrink, so the wrapper's own `overflow-x-auto`
          takes over — the real fallback this pattern was always meant to
          have, rather than columns quietly compressing until their labels are
          unreadable.
      */}
        <Table
          stickyHeader
          className="[&_[data-slot=table-header]]:[&_th]:bg-primary min-w-[1184px] table-fixed"
        >
          <TableCaption>{caption}</TableCaption>
          <RegisterTableHeader
            selectAll={
              <Checkbox
                aria-label="Select all items on this page for QR labels"
                checked={allSelected}
                indeterminate={someSelected}
                onCheckedChange={onToggleSelectAll}
              />
            }
            sort={sort}
            onToggleSort={toggleSort}
          />
          <TableBody>
            {rows.map((item) => (
              <InventoryRow
                key={item.id}
                item={item}
                isSelected={selectedIds.has(item.id)}
                onToggleSelect={onToggleSelect}
                onOpenItem={onOpenItem}
                onViewCustody={onViewCustody}
                onTransferCustody={onTransferCustody}
                onAssignManager={onAssignManager}
                onTransferOwnership={openOwnership}
                onReclaimCustody={openReclaim}
                onTakeItem={onTakeItem}
                onReleaseCustody={onReleaseCustody}
                canSelfServe={canSelfServe}
                onEditItem={onEditItem}
                onRetireItem={handleOpenRetire}
                onRestoreItem={handleOpenRestore}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {/*
        "Showing N of M" is the filter bar's line, above this table, and it is
        deliberately not repeated here: `InventoryFilterBar` renders it against the
        same `resultCount` / `totalCount` pair this table is given, and it adds the
        half that matters ("clear a filter to widen the list"). Two identical
        sentences a few pixels apart would be noise. The count reaches a screen
        reader through the caption above instead, which is the one place a non-visual
        reader can reach it — and because the page hands both components the *same*
        pair, the sighted and the spoken counts cannot disagree.
      */}

      {/*
        The four dialogs the row menu raises, mounted here rather than in the page
        because a dialog opened from a row belongs to the row.

        **No `is*Pending` prop on the two owner dialogs, and that is the proof of
        who owns the write.** They own their mutations, toasts and invalidation, which
        is why the page adds open state and nothing else. They are the two dialogs in
        this feature deliberately left out of `CustodyDialogs` for that reason, and
        mounting them here is the other of the two doors its own banner comment
        describes: both take an `InventoryItemView | null` and report what they wrote
        through `onRecorded`, so neither door is a special case.
      */}
      <RetireItemDialog
        item={dialogs.retire.target}
        isPending={dialogs.retire.isPending}
        onCancel={handleCancelRetire}
        onConfirm={handleConfirmRetire}
      />
      <RestoreItemDialog
        item={dialogs.restore.target}
        isPending={dialogs.restore.isPending}
        onCancel={handleCancelRestore}
        onConfirm={handleConfirmRestore}
      />
      <TransferOwnershipDialog {...ownershipDialog} />
      <ReclaimCustodyDialog {...reclaimDialog} />
    </div>
  );
};
