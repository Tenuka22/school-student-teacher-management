"use client";

/*
 * This file is a re-export facade by design, and that is what the rule below would
 * otherwise "fix" away.
 *
 * `inventory-page.tsx` and `inventory-table.tsx` import the custody dialogs from
 * `@/components/staff/inventory/custody-dialogs`, and the two owner dialogs are
 * opened straight from the register's row menu. Those are other agents' files and
 * changing their import paths is not this file's business, so the same names are
 * re-exported from here. Three of the four are also mounted by `CustodyDialogs`
 * below, which means they have to be in this module's scope as well as on its
 * export list — and `export … from` would put them on one or the other, never both.
 * The members are named explicitly rather than `export *` for the reason the
 * folder's own `shared/index.ts` documents: a wildcard is a contract nobody can
 * read, and a name that stops being exported should break a compile, not a page.
 */
/* oxlint-disable unicorn/prefer-export-from -- a re-export facade; three members are also mounted below */

import { TakeOrReleaseDialog } from "@/components/staff/inventory/custody-hold-dialog";
import type { CustodyHoldMode } from "@/components/staff/inventory/custody-hold-dialog";
/**
 * The two accountabilities, and the entry point the register mounts them through.
 *
 * ## This file used to be 3,007 lines
 *
 * It held five dialogs, the trail panel, a relative-time formatter, four valibot
 * schemas, a form reducer and every piece of a11y wiring, and it was the largest
 * file in the repository by a factor of three. Two problems with that, and only
 * one of them is size:
 *
 * 1. **The fixes could not be applied consistently.** A hardcoded `id`, a submit
 *    label that changed width under the pointer, a missing `aria-busy`, no focus
 *    moved to the field that failed — all of those existed five times over, so
 *    fixing one dialog left four broken and the next reader had to check all five.
 * 2. **Nothing was atomic.** A custody verb is one irreversible write to a
 *    permanent trail; its preview, its reason, its confirm and its vocabulary
 *    belong together, and a 3,000-line file makes "where does the copy for this
 *    verb live" a question with five answers.
 *
 * The split follows the verbs, and each piece is a real module rather than a slice
 * of arbitrary length:
 *
 * | File | What it is |
 * | --- | --- |
 * | `custody-form.tsx` | The vocabulary, the preview, the schemas and the one dialog frame every verb renders through |
 * | `custody-transfer-dialog.tsx` | Hand an item from one member of staff to another |
 * | `custody-manager-dialog.tsx` | Appoint or replace the person in charge — the two-state field |
 * | `custody-owner-dialogs.tsx` | The two verbs a teacher owns: hand the responsibility on, and call an item back |
 * | `custody-hold-dialog.tsx` | The self-service pair: assign to yourself, hand it back |
 * | `custody-history-sheet.tsx` | The append-only trail, as a table |
 * | this file | The composition the page mounts, and the re-exports that keep every existing import path working |
 *
 * ## The re-exports are deliberate
 *
 * `inventory-page.tsx` and `inventory-table.tsx` import from
 * `@/components/staff/inventory/custody-dialogs`, and the two owner dialogs are
 * opened directly from the row menu. Those paths are other agents' files and
 * changing them is not this file's business, so the same names are re-exported
 * from here. The members are explicit rather than `export *` for the reason the
 * folder's own `shared/index.ts` documents: a wildcard is a contract nobody can
 * read, and a name that stops being exported should break a compile, not a page.
 */
import { AssignManagerDialog } from "@/components/staff/inventory/custody-manager-dialog";
import { TransferCustodyDialog } from "@/components/staff/inventory/custody-transfer-dialog";
import type { InventoryItemView } from "@/components/staff/inventory/inventory-types";

import { CustodyHistorySheet } from "./custody-history-sheet";

export type { TransferCustodyDialogProps } from "@/components/staff/inventory/custody-transfer-dialog";
export { TransferCustodyDialog };
export { AssignManagerDialog };
export type { AssignManagerDialogProps } from "@/components/staff/inventory/custody-manager-dialog";
export {
  ReclaimCustodyDialog,
  TransferOwnershipDialog,
} from "@/components/staff/inventory/custody-owner-dialogs";
export type {
  ReclaimCustodyDialogProps,
  TransferOwnershipDialogProps,
} from "@/components/staff/inventory/custody-owner-dialogs";
export type { CustodyHoldMode } from "@/components/staff/inventory/custody-hold-dialog";
export { TakeOrReleaseDialog };
export { CustodyHistorySheet } from "@/components/staff/inventory/custody-history-sheet";
export type { CustodyHistorySheetProps } from "@/components/staff/inventory/custody-history-sheet";

export interface CustodyDialogsProps {
  item: InventoryItemView | null;
  isTransferOpen: boolean;
  onTransferOpenChange: (open: boolean) => void;
  isTransferPending: boolean;
  onTransferSubmit: (values: {
    itemId: string;
    newCustodianStaffId: string;
    reason: string;
    note?: string;
  }) => Promise<void>;
  isManagerOpen: boolean;
  onManagerOpenChange: (open: boolean) => void;
  isManagerPending: boolean;
  onManagerSubmit: (values: {
    itemId: string;
    newManagerStaffId: string;
    reason: string;
    note?: string;
  }) => Promise<void>;
  holdMode: CustodyHoldMode;
  isHoldOpen: boolean;
  onHoldOpenChange: (open: boolean) => void;
  isHoldPending: boolean;
  /** Carries `newCustodianStaffId` only in release mode — see
   *  `TakeOrReleaseDialogProps`. */
  onHoldSubmit: (values: {
    itemId: string;
    note?: string;
    newCustodianStaffId?: string;
  }) => Promise<void>;
  isHistoryOpen: boolean;
  onHistoryOpenChange: (open: boolean) => void;
}

/**
 * The three dialogs the page owns, and the panel that owns two more.
 *
 * Only one of the three is ever open at a time, which matters for more than
 * tidiness: it is what keeps a single item's context unambiguous when three
 * dialogs and a sheet are all mounted against the same row. The page owns that
 * invariant by opening one dialog per action.
 *
 * **`TransferOwnershipDialog` and `ReclaimCustodyDialog` are deliberately not in
 * this list.** They own their mutations, their toasts and their invalidation, so
 * the only thing the page would have to add for them is open state — and the panel
 * that already has the item in hand is the better door to them anyway. They are
 * exported rather than mounted here so a row action can open either one directly,
 * which is the other door and needs no special case: both take an
 * `InventoryItemView | null` and report what they wrote through `onRecorded`.
 */
export const CustodyDialogs = ({
  item,
  isTransferOpen,
  onTransferOpenChange,
  isTransferPending,
  onTransferSubmit,
  isManagerOpen,
  onManagerOpenChange,
  isManagerPending,
  onManagerSubmit,
  holdMode,
  isHoldOpen,
  onHoldOpenChange,
  isHoldPending,
  onHoldSubmit,
  isHistoryOpen,
  onHistoryOpenChange,
}: CustodyDialogsProps) => (
  <>
    <TransferCustodyDialog
      open={isTransferOpen}
      onOpenChange={onTransferOpenChange}
      item={item}
      isPending={isTransferPending}
      onSubmit={onTransferSubmit}
    />
    <AssignManagerDialog
      open={isManagerOpen}
      onOpenChange={onManagerOpenChange}
      item={item}
      isPending={isManagerPending}
      onSubmit={onManagerSubmit}
    />
    <TakeOrReleaseDialog
      open={isHoldOpen}
      onOpenChange={onHoldOpenChange}
      mode={holdMode}
      item={item}
      isPending={isHoldPending}
      onSubmit={onHoldSubmit}
    />
    <CustodyHistorySheet
      open={isHistoryOpen}
      onOpenChange={onHistoryOpenChange}
      item={item}
    />
  </>
);
