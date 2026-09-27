"use client";

/**
 * The two-stage write-off, modelled on `leave-management`'s review chain.
 *
 * The four procedures and the ladder between them are documented on
 * `DisposalRequestDialog` (the file that owns the first stage) and repeated in the
 * banner of `disposal-decision-dialogs.tsx`, which owns the other three. What this
 * file is now is the **stable import surface** for all five exports, because
 * `lifecycle-tabs.tsx` has always imported `DisposalsPanel` from here and
 * `inventory-page.tsx` mounts the dialogs behind it.
 *
 * ## What moved, and why
 *
 * The file was 2070 lines holding a queue table, a summary strip, a status-history
 * disclosure, four dialogs, and two sets of empty-state copy — five unrelated reading
 * jobs and four unrelated interaction jobs in one module. It is now:
 *
 * | file | what is in it |
 * | --- | --- |
 * | `disposal-certificates.tsx` | the summary table, the certificate table, the history disclosure, the four sign-off cells, the queue presets, the empty-state copy, `formatAmount`, `FINAL_OUTCOME_CONSEQUENCE` |
 * | `disposal-request-dialog.tsx` | `DisposalRequestDialog`, the request schema, the identity block |
 * | `disposal-decision-dialogs.tsx` | `ApproveDisposalDialog`, `FinalizeDisposalDialog`, `CancelDisposalDialog`, the certificate summary `<dl>` |
 * | `disposals-panel.tsx` | `DisposalsPanel` — the query, the presets, the empty states, the four dialog mounts |
 *
 * The split is by job, not by size: everything that *reads* a certificate is in one
 * module, everything that *writes* one is in another, and the panel is the only thing
 * that knows the query.
 *
 * **`finalize` is the only `AlertDialog` among the four.** `create` writes a proposal,
 * `approve` writes a signature, and `cancel` withdraws a proposal — none of them moves
 * a device, and a confirm step in front of a non-destructive action only teaches people
 * to dismiss confirms. The reasoning for `cancel`, which *is* irreversible, is written
 * out at length on `CancelDisposalDialog`.
 */

// Intentional re-export module. `lifecycle-tabs.tsx` imports `DisposalsPanel` from
// this path and the four dialogs are part of the feature's published surface, so the
// path is the contract; the specific rule wins over Ultracite's general guidance
// against barrel files, exactly as in `stock-dialogs.tsx`.
// oxlint-disable-next-line no-barrel-file
export {
  ApproveDisposalDialog,
  CancelDisposalDialog,
  FinalizeDisposalDialog,
} from "@/components/staff/inventory/disposal-decision-dialogs";
export { DisposalRequestDialog } from "@/components/staff/inventory/disposal-request-dialog";
export { DisposalsPanel } from "@/components/staff/inventory/disposals-panel";
