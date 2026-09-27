"use client";

/**
 * The feature's stable import surface for the two counter movements, and the
 * asset-tag register they are read back on.
 *
 * ## What moved, and why this file is now four lines of exports
 *
 * Nine other files in `apps/web/src` import from `@/components/staff/inventory/
 * stock-dialogs` — `borrow-dialogs`, `custody-dialogs`, `inventory-page`,
 * `inventory-table`, `ledger-views`, `lifecycle-tabs` and four in
 * `teacher-portal/`. The form primitives they share (`formatDateTime`, `toQuantity`,
 * `PartyName`, `useDiscardGuard`, …) were *defined* here only because this file
 * happened to be the first of the six written, and every one of those callers has
 * been importing them from a dialog module ever since.
 *
 * So the definitions moved and the re-exports stayed. The split is by what a
 * reader is looking for:
 *
 * | file | what is in it |
 * | --- | --- |
 * | `stock-form-helpers.tsx` | the primitives — dates, tag prose, `PartyName`, the discard guard |
 * | `stock-in-dialog.tsx` | `StockInDialog`, the tag list, the provenance block, the paste path |
 * | `stock-out-dialog.tsx` | `StockOutDialog`, its two field blocks, the irreversible confirm |
 * | `asset-register-panel.tsx` | `AssetRegisterPanel`, the per-page counter table, the per-unit popover |
 * | `quantity.ts` / `quantity-field.tsx` | the counted-quantity parser, the unit-aware input, the resulting-quantity readout |
 * | `dialog-form.tsx` | focus-first-invalid, and the polite live region |
 *
 * `no-giant-component` is the reason, but the reason it was *worth* doing is that
 * `stock-out-dialog.tsx` and `asset-register-panel.tsx` had ended up sharing a
 * 2200-line file for no reason other than chronology, and the two halves of the
 * quantity story — the parse and the projection — were in a third one.
 */

// Intentional re-export module, and the specific rule wins over the general
// Ultracite guidance against barrel files. This path is the feature's documented
// import contract for nine callers I do not own, exactly as
// `inventory/shared/index.ts` is for the rest of it. The alternative — editing nine
// files this pass is not allowed to touch — is worse.
// oxlint-disable-next-line no-barrel-file
export {
  describeParty,
  formatDate,
  formatDateTime,
  issuesToFieldErrors,
  PartyName,
  summariseTags,
  toQuantity,
  useDiscardGuard,
} from "@/components/staff/inventory/stock-form-helpers";

export { AssetRegisterPanel } from "@/components/staff/inventory/asset-register-panel";
export { StockInDialog } from "@/components/staff/inventory/stock-in-dialog";
export { StockOutDialog } from "@/components/staff/inventory/stock-out-dialog";
