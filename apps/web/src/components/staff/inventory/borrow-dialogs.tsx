"use client";

/**
 * Loans: who has what, and what is late.
 *
 * ## This file used to be 1,514 lines and held three things
 *
 * The lend form, the return form and the ledger that lists them. They are now:
 *
 * | File | What it is |
 * | --- | --- |
 * | `borrow-dialog.tsx` | The check-out: item, quantity, tags, borrower, purpose, due date, who agreed |
 * | `loans-ledger.tsx` | The check-in **and** the list. The return is a popover anchored to the row it belongs to, so it cannot live in a different file from the row that opens it — a `Popover` is positioned against an element it owns. |
 * | this file | The entry point `lifecycle-tabs.tsx` imports, and the re-exports that keep the existing import path working |
 *
 * ## The re-exports are deliberate
 *
 * `lifecycle-tabs.tsx` imports `LoansPanel` from
 * `@/components/staff/inventory/borrow-dialogs`, and that is another file. The same
 * members are re-exported here so the path does not change; the names are explicit
 * rather than `export *` for the reason the folder's `shared/index.ts` documents: a
 * name that stops being exported should break a compile, not a page.
 *
 * ## What the `returnBorrow` call now sends
 *
 * **`scannedItemId`, which it did not send at all, and which is not optional.** The
 * procedure declares it as a required `inventoryItemIdSchema` and then refuses any
 * value that is not the loan's own `itemId` with "Scan this item's own QR code to
 * confirm you have it in hand before closing the loan" — a scan of the projector
 * next to it on the shelf would otherwise close a loan for a device that never left
 * the room. The old call omitted it, which is the pre-existing compile error this
 * file was carrying, and the honest fix is in the UI: the return panel now collects
 * the label code, checks it against this loan's item before the request leaves the
 * browser, and sends it. The argument that the schema over-requires does not hold —
 * see the note above `ReturnScanProof` in `loans-ledger.tsx`.
 */
export { BorrowDialog } from "@/components/staff/inventory/borrow-dialog";
export type { BorrowDialogProps } from "@/components/staff/inventory/borrow-dialog";
export {
  LoansPanel,
  ReturnBorrowDialog,
} from "@/components/staff/inventory/loans-ledger";
export type {
  LoansPanelProps,
  ReturnBorrowDialogProps,
} from "@/components/staff/inventory/loans-ledger";
