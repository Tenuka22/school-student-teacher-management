import { approveDisposal } from "./approve-disposal";
import { assignManager } from "./assign-manager";
import { cancelDisposal } from "./cancel-disposal";
import { createBorrow } from "./create-borrow";
import { createCategory } from "./create-category";
import { createDisposal } from "./create-disposal";
import { createIssue } from "./create-issue";
import { createItem } from "./create-item";
import { deleteItem } from "./delete-item";
import { finalizeDisposal } from "./finalize-disposal";
import { getItem } from "./get-item";
import { listAuditLogs } from "./list-audit-logs";
import { listBorrows } from "./list-borrows";
import { listCategories } from "./list-categories";
import { listCustodyHistory } from "./list-custody-history";
import { listDisposals } from "./list-disposals";
import { listIssues } from "./list-issues";
import { listItems } from "./list-items";
import { listLentByMe } from "./list-lent-by-me";
import { listMyItems } from "./list-my-items";
import { listTakeableItems } from "./list-takeable-items";
import { listAssignableStaff } from "./list-teacher-options";
import { listTransactions } from "./list-transactions";
import { listUnits } from "./list-units";
import { reclaimCustody } from "./reclaim-custody";
import { releaseCustody } from "./release-custody";
import { removeCategory } from "./remove-category";
import { restoreItem } from "./restore-item";
import { returnBorrow } from "./return-borrow";
import { seedCategories } from "./seed-categories";
import { stockIn } from "./stock-in";
import { stockOut } from "./stock-out";
import { takeItem } from "./take-item";
import { transferCustody } from "./transfer-custody";
import { transferOwnership } from "./transfer-ownership";
import { updateItem } from "./update-item";
import { updateUnit } from "./update-unit";

/**
 * The inventory store, grouped the way an administrator does the work.
 *
 * The groups are the six things somebody with the keys actually does: classify
 * what the store holds (`categories`), find a person (`options`), keep the
 * register (`items`, `units`), move stock in and out (`stockIn` / `stockOut` on
 * `items`), decide who is responsible for a given thing (`custody`), run a
 * lifecycle that ends the item's life in the store (`issues`, `borrows`,
 * `disposals`), and afterwards read what all of it did (`ledger`).
 *
 * **The grouping is chosen so a route guard can gate a whole group.** A
 * teacher who may read their own items needs `items` to be one object and not
 * fifteen loose procedures scattered up the tree, and a storekeeper who may
 * move stock but not write anything off needs `disposals` separable from
 * `items`. Names are therefore the contract: the keys below are the paths a
 * client calls (`orpc.inventory.custody.transfer`), and they are not to be
 * renamed, flattened or reordered for tidiness.
 *
 * **`items` and `custody` are the heart of this feature, and they are separate
 * on purpose.** `items` maintains the record — what exists, what it is called,
 * how many there are, what it is worth. `custody` decides who is responsible for
 * it, which is a different question with a different answer for every single
 * row: an item in a cupboard has a manager and no custodian, a borrowed item has
 * both, and a disposed one has neither. Collapsing them would make "who is
 * holding this, and since when" — the question an audit is actually asked —
 * unaskable, because the current holders on `inventoryItem` are the answer and
 * the history is `custody.history`.
 */
export const inventoryRouter = {
  categories: {
    list: listCategories,
    create: createCategory,
    remove: removeCategory,
    seed: seedCategories,
  },
  options: { assignableStaff: listAssignableStaff },
  items: {
    list: listItems,
    get: getItem,
    create: createItem,
    update: updateItem,
    remove: deleteItem,
    /**
     * The inverse of `remove`, and the reason a soft delete is soft rather than
     * merely gentle. `list` is the only way to see a retired row, and it needs
     * `includeDeleted` — which is gated on the three leadership seats — so
     * without this procedure a retirement was a one-way door for exactly the
     * people who are allowed to look behind it. See `restore-item.ts` for why the
     * gate is `update` rather than `delete`, and why it takes no reason.
     */
    restore: restoreItem,
    stockIn,
    stockOut,
  },
  units: { list: listUnits, update: updateUnit },
  custody: {
    transfer: transferCustody,
    /**
     * The owner's two verbs, both on `manageOwn` and both narrowed in their own
     * handlers to the caller's own items: `transfer` moves custody (who is
     * carrying it today), `transferOwnership` moves accountability (who answers
     * for it), and `reclaim` is the owner calling a held item back. See
     * `packages/auth/src/permissions.ts` for the `teacher` grant they sit behind.
     */
    transferOwnership,
    reclaimCustody,
    assignManager,
    take: takeItem,
    release: releaseCustody,
    history: listCustodyHistory,
    myItems: listMyItems,
    /** The owner's view of what is out with other people. */
    lent: listLentByMe,
    takeable: { listTakeableItems },
  },
  issues: { list: listIssues, create: createIssue },
  borrows: {
    list: listBorrows,
    create: createBorrow,
    return: returnBorrow,
  },
  disposals: {
    list: listDisposals,
    create: createDisposal,
    approve: approveDisposal,
    finalize: finalizeDisposal,
    cancel: cancelDisposal,
  },
  ledger: { transactions: listTransactions, auditLogs: listAuditLogs },
};
