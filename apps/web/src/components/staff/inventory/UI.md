# Inventory Management

> **This file began as a planning document and is now a record of the shipped UI.** Where the plan was wrong, the divergence is in the table below and the claim that was false is corrected in place rather than left to be believed — an out-of-date sentence in here is a defect, not a historical footnote. Procedure names, column names and permission names are the repository's, and the client's are load-bearing.

## What actually shipped

| Planned | Shipped | Why |
| --- | --- | --- |
| A single `Staff` / `Storekeeper` role that owns the register | No new role. The existing `admin` role administers it | Three tiers of permission already exist (`adminOnlyProcedure`, `adminProcedure`, permission-scoped procedures). A fourth storekeeper role would have meant a second authorization surface for a job one person holds. |
| Per-item `reservedQty` counter and a `reserved` badge, as in the source app | Not ported — and the counter with it | A school has no reservation workflow that outlives the request that created it. The column survived the port as a column, a CHECK, two ledger columns, a status branch and a SQL branch, all describing a state nothing could reach. `borrowedQty` took the slot `reservedQty` held. |
| Search filtering the register on every keystroke | 300 ms debounce, and the filters are **component state**, not URL state | The debounce is real and load-bearing. The _reason_ it is there is not the URL, though: it is that a navigation per keystroke lets an earlier request resolve after a later one and repaint the list with stale rows. Only the pane (`?tab=`) is in the URL — see "Filters are not URL state" below for why the other seven were left in `useState`. |
| Hiding items with nothing available from a picker | Shown, greyed out, labelled `0 of N available` | A clerk searching for the projector and not finding it concludes the system is broken — which is exactly what a missing projector looks like. A disabled row says the item exists and names the number stopping them. |
| One "Assigned to" column | `CustodyBadge`: owner (printed as `Manager · …`) **and** custodian, all four states spelled out | They are two different facts answering two different questions. A blank cell cannot distinguish "nobody has it" from "nobody is responsible for it", and that is the mistake that loses a projector. |
| A "Role" dropdown that doubles as the filter | Separate owner and custodian **columns** in the model, and a **"No manager"** stat card of its own — which is now also a **filter** | "Items with no owner" is the one number a school administrator actually goes and does something about. Buried in a combined card it is read once and forgotten. It is now actionable: see "The 'no manager' card is a filter, and it is a page filter" below. |
| Editing quantity, owner or custodian on the item edit form | `updateItem` accepts none of them; five separate dialogs do | `qty` is moved by a stock-in or stock-out so the ledger records a movement; the owner and the custodian each move by a verb that records a reason. Letting the edit form set them would be three ways to do one thing, and only one of them auditable. |
| Delete items | Soft delete only (`deletedAt`), **and now reversible** | The ledger, the custody history and the audit log all reference the item row, so a hard delete is refused by the database for every item that has ever moved. `includeDeleted` is admin-only, because it un-hides every retired record in the school at once — and until this pass **no screen ever sent it**, which made a gate on nothing. It is now the register's "Show retired" toggle, and `items.restore` is the way back. See "Retiring an item was a one-way door" below. |
| Money as a number input, formatted on blur | A string, validated against `^\d{1,12}(\.\d{1,2})?$` | `purchaseValue` / `currentValue` are `numeric(14,2)` and arrive as strings so that 2400.50 does not become 2400.5 on the way to a client. A number in the middle would write the wrong figure into a valuation column, and a number input silently discards the comma a school types. |
| Keyboard shortcuts for the register (`/` to search, `n` for new, arrow-key row navigation) | None | Shipped with no shortcut layer rather than half of one. Do not document shortcuts that do not exist. |
| "Select units" as a multi-select dropdown | A ticked list of asset tags, plus a **"Select the oldest N"** action | The server claims units FIFO by `createdAt`, and a multi-select dropdown cannot show which end of the shelf is oldest. The button and the server-side claim have to agree, so the list is re-sorted to the claim order rather than the display order. |
| Every item is a set of tagged devices | **A bulk line is a first-class item**, and every lifecycle write takes one | `createItem` has always permitted a counted-but-untagged line — "200 chairs". Three of the four movement procedures then called `getAvailableUnits` unconditionally and answered _"Only 0 unit(s) are available"_, so a bulk line could be registered and never moved. A **counted line is lendable, issuable and writable-off**: the counter moves and there are simply no unit rows to move with it. See "A bulk line is a real item" below. |
| Only the **teaching staff** may be given school property — the manager, custodian and borrower fields offer a teaching roster | **Any member of staff whose employment is `active` or unset**, teaching and office staff alike | The `staffCategory = "teacher"` restriction is gone from both the picker and the write guard, and the pickers were renamed to match (`StaffComboboxField`, `useAssignableStaffOptions`, `AssignableStaffOption`, `inventoryQueryKeys.assignableStaffOptions`). See "Any member of staff may hold school property" below. |

Labels come from `packages/db/src/constants/inventory.ts` and are never re-derived in a component. The two exceptions are stated where they occur: `itemStatusLabel` (the four _derived_ statuses have no server-side label map, so they live beside the badge that draws them) and `EMPTY_REGISTER_COPY` / `EMPTY_FILTERED_COPY` (empty-state copy, which lives beside the empty state so a caller reuses it instead of rewriting it).

## Corrections this document had wrong

Each of these was a sentence that read as a specification of the product and was not one. They are recorded here rather than deleted, because the failure mode this file exists to prevent is a plan that is quietly believed.

### Filters are not URL state

Only `?tab=` is in the URL. The six server-backed register filters (search, status, category, condition, custodian, low stock), plus "Show retired", plus the client-side "no manager" one, are `useState` in `useInventoryPage` and have never been anything else. The 300 ms debounce on the search box is real and is still load-bearing — but for the network reason, not the routing one: a request per character on a school's LAN lets an earlier response land after a later one and repaint the list with stale rows.

Persisting them through the route's `validateSearch` is a **follow-up, not a decision against it.** It is not obviously better: eight filter values in a path segment is a longer URL than a clerk wants to read out over the phone, `useSearch({ strict: false })` reads typed as `unknown` precisely because the page does not own its route file, and every one of them has to be parsed back off the URL on load with a fallback for each. The tab stays in the URL because there are two of it and it is the one thing worth linking to.

**"Show retired" is on the request, not beside it, and that is not a contradiction of the paragraph above.** It is the one filter with no client-side equivalent: `listItems` filters retired rows out of the response entirely, so a browser-side predicate could only ever answer "you have none" — which reads as a fact about the store. It is passed as `includeDeleted`, dropped to `undefined` when off so the query key is unchanged, and gated server-side on the three leadership seats. **This page is `adminProcedure`, which admits those three seats and nobody else, so the control can never be one the server refuses.**

### Retiring an item was a one-way door

`deleteItem` is a soft delete and the register filtered retired rows out by default, `includeDeleted` existed and was leadership-gated — and **nothing in the app ever sent it.** The toast ("retired — its ledger and custody history are still on file") was true and the consequence was invisible: no row, no toggle, no recovery, and `getItem` / `listUnits` / `listDisposals` / `listIssues` / `listCustodyHistory` all `NOT_FOUND` on a retired item. Retiring the wrong line was permanent.

Two halves, and only the first is a UI change:

- **A "Show retired" toggle** on the filter bar, wired to `includeDeleted`, with a sentence that says what the extra rows are and what they cannot do.
- **A visible marker on a retired row** — a dashed, muted **"Retired \_&lt;date&gt;"** badge, a struck-through name, and a flat muted band instead of the `hover` tint. Words, never a colour: the four badge tones on this register mean _condition_, and a fifth would have read as a fifth kind of fault. The retired row also **suppresses its derived status badge entirely** — `calculateItemStatus` derives `out_of_stock` from `qty` alone, so a retired line with 200 chairs would have read "Out of stock", and a derived badge on a row that cannot be lent, issued, written off or edited answers a question the register should not be asking.
- **A retired row is not clickable and its menu holds exactly one entry.** The row's click target is the custody history, and `listCustodyHistory` refuses a retired item — so a retired row would have had one affordance that reliably opened a dead end and nine menu entries the server would always refuse. It offers **"Restore to the register"** and nothing else.
- **`items.restore`**, on `requireInventoryPermission("update")`, with its own `getLockedRetiredItem` (predicate `isNotNull(deletedAt)`, the deliberate mirror of `getLockedItem`'s `isNull`), a `CONFLICT` if a live line holds the SKU, a ledger row and an audit row (`item.restore`; the counter-ledger action vocabulary is `packages/db`'s, so the ledger row is `edited` and the audit row is where the real verb lives). **It takes no reason** — see `restore-item.ts` for the argument; the two ledger rows and the audit pair already record who, when and for how long.

The end-to-end sequence: **retire** → the row leaves the register, its ledger rows stay, `getItem` and the custody panel 404 → **"Show retired"** → the row returns, marked, inert, with one menu entry → **restore** → `deletedAt` is null, the row is live and lendable again with the same counters, tags, manager and custodian, and the change log holds both edges of the interval.

### A bulk line is a real item

`createItem` has always said so in its own comment: _"An empty tag list is still legitimate: a bulk line ('200 chairs') is counted, not tagged, and only a tagged item has unit rows."_ Three of the four lifecycle writes did not believe it. `createBorrow`, `createIssue` and `stockOut` called `getAvailableUnits` unconditionally, which requires `qty` matching `inventory_unit` rows and otherwise throws `Only N unit(s) are available` — so **a store with 200 chairs could register the chairs and then never lend them, issue them or write them off.** `createDisposal` was the only one that got it right, and the borrow input's own comment asserted the opposite of what the code did.

**The rule, in one place:** `claimLifecycleUnits` (`inventory-database.ts`) returns `{ units, isBulk }`, and there are three arms — tags named (claim them, whatever the item is), no tags named and the item **has** unit rows (FIFO, as always), no tags named and the item has **none** (`units: null`, the counter moves, nothing per-device moves with it). The middle arm is why it is a shared helper and not a copied `? … : null`: reading "no tags named" as "bulk item" without asking whether the item _is_ one would stop claiming a tagged item's devices and manufacture exactly the counter-with-no-units drift `returnBorrow` exists to catch.

**The decision: a counted line is lendable.** `borrowable` stays the item's own statement about whether it is the kind of thing a person carries off-site, and a school lends bulk stock constantly — chairs to the hall, calculators to a class, bibs to a house. Refusing on "there are no asset tags" grounds would also have been incoherent against its sibling: after the same fix a bulk line _can_ be issued and written off, and an issue and a borrow are the same shape of fact. What is given up is per-device custody, and it is paid for **in the record**: `meta.bulkItem` is on the ledger row, `meta.uniqueUnitIds` is `[]` (empty, never absent), and the mutation responses return `units: null` rather than `[]` so a toast says "counted in bulk" instead of printing an empty tag list. `returnBorrow`'s drift guard is **kept** for tagged loans and skipped for bulk ones, decided by the _item's_ unit rows — sound, because `createItem` mints tags at creation and `stockIn` requires exactly `qty` tags per delivery. The one thing that can change the answer mid-loan is a tagged `stockIn` against a counted line, which also makes that item's counters and unit rows disagree; there the guard stays closed, which is the conservative answer. `returnCondition` is **still required** on a bulk return — `inventory_borrow_return_state` requires it, it is written to the loan rather than to a unit either way, and forty chairs come back with three cracked just as a laptop comes back with a cracked hinge.

`finalizeDisposal` was a **fourth** call site the original report missed: a bulk disposal _request_ could be raised and then could not be signed off, which is the same dead end one step later in the ladder.

### The "no manager" card is a filter, and it is a **page** filter

The card is now actionable: a **"No manager only"** toggle under the stat cards filters the register to the items with no `managerStaffId`, using the same `aria-pressed` toggle idiom as the filter bar's "Low stock only".

**It is a client-side filter over the loaded page, and the UI says so.** `listItems` accepts a `managerStaffId`, but only as a staff id — there is no "no manager" input, and a sentinel such as `"none"` would fail `staffIdSchema` on the way in rather than select the null rows. So the count is a count of the rows already returned (at most `REGISTER_PAGE_SIZE`, 200), and while the filter is on, the "showing N of M" line reports the _filtered_ set's own two numbers so it cannot print "Showing 12 of 340". The scope is stated in a sentence beside the control rather than in a footnote.

**The correct fix is a backend input**, and it is one line plus one filter: an `unassignedOnly: v.optional(v.boolean())` beside `lowStockOnly` in `listItems`, filtered with `isNull(inventoryItem.managerStaffId)`. After that the card can be lifted to its own `limit: 1` count exactly as `lowStockQuery` is, it can stop being qualified, and the same card and the `CustodyBadge` gap chip can describe one set of rows rather than two.

### The teacher page **does** call `custody.take`

This entry used to say the opposite, and it was the load-bearing false claim in this file: _"A teacher picking an item up — `custody.take` is not on the teacher page. The only caller of `custody.take` is the register's row action menu, and the register is `adminProcedure`."_ The reason it gave was sound — choosing an item to take means browsing `items.list`, which is the school-wide register, with every item's owner, holder, valuation, location and condition beside it, and no input filter can un-leak that.

**The reasoning was right and the conclusion has changed, because the procedure that was missing got written.** `custody.takeable.listTakeableItems` is a _catalogue_, not a register. It is `requireInventoryPermission("read")`, it is narrowed by `takeItem`'s own guards so it cannot offer something the write would refuse, and — the part that dissolves the objection — it **projects nine fields and no person at all**: `id`, `sku`, `name`, `categoryId`, `categoryName`, `categoryColor`, `availableQty`, `condition` and `location`. No `managerStaffId`, no `managerName`, no `custodianStaffId`, no `custodianName`, no `borrowedQty`, no valuation. `teacher-portal/use-my-equipment.ts` now calls `orpc.inventory.custody.take` behind that picker, so the school register is still not something a teacher can reach.

The distinction to hold on to, because it is the reason both halves of that sentence are true at once: a **register** answers _"what does the school own, and who is answerable for it"_, and a **catalogue** answers _"what is free right now"_. Only the second question is one a teacher has any business asking.

### A teacher's inventory surface is nine procedures, not two

This file described a teacher as somebody who reads their own holdings and hands an item back, and that is two procedures. `teacher` holds `inventory: ["read", "take", "manageOwn"]`, which reaches **five procedures on `read`, two on `take` and two on `manageOwn`** — and the two on `manageOwn` are the ones that had no vocabulary here at all:

- **`transferOwnership`** — handing the item you are the owner of to another teacher, permanently. Gated on `manageOwn`, and **narrowed in the handler** to the caller being `managerStaffId` or sitting in one of the three leadership seats. `newOwnerStaffId` is required and non-nullable, so this verb can only move accountability to a _person_; leaving an item with nobody in charge is `assignManager({ newManagerStaffId: null })`, which is `update` and therefore administrator-only.
- **`reclaimCustody`** — demanding back an item you are the owner of that a colleague is holding. Gated on `manageOwn`, narrowed the same way, and **not** `releaseCustody`: that one sits on `take` and is deliberately narrowed to the holder themself, so a hand-back is always voluntary. This is the owner reaching into a colleague's hands, which is why it is a different verb, why its `reason` is required, and why its dialog confirms before it writes while a hand-back does not.

**The scoping lives in the handlers, not in the permission, and that is the part to remember.** A grant says which procedures may run; it can never say which rows they may touch, and `manageOwn`'s name names a scope — _your own_ — that an access-control statement has no way to express. A caller who is not the item's owner and not in a leadership seat is refused **even though their role holds the permission**. Both dialogs state that rule in the dialog, quoting the server's own sentence, rather than guessing at it in the browser: a disabled button with no explanation is the failure mode, and the property is about the _caller_, which the client cannot see.

## Who may hold school property

**Any member of staff whose employment is `active` or unset.** That is the whole rule, it is enforced in one server helper (`assertStaffIsAssignable`), and the list the pickers read (`options.assignableStaff`) holds the identical predicate — so the two cannot offer and accept different sets. `STAFF_CATEGORIES` has two values (`teacher`, `officeStaff`) and **both** describe people who are employed, so filtering on the column was excluding a colleague rather than a category of person who cannot hold property: the bursar is who a school projector actually leaves the office with.

- **Employment status is the half of the predicate that does the work.** A _terminated_ or _on-leave_ colleague is refused, because the equipment leaves the building with them. A _null_ status is admitted, because it means nobody has confirmed it, and refusing those would make the store unusable until an administrator filled in a field the storekeeper has no business editing.
- **The three seeded leadership accounts are still absent, and not because of a filter written for them.** `admin` / `principal` / `deputy-principal` are users with **no staff row at all**, so no predicate on `staff` reaches them. They administer the ledger; they are not the people who carry the laptops. A school that assigns a projector to a leadership account has lost the accountability the ledger exists to record.
- **The gate did not move with the predicate.** `options.assignableStaff` is `adminProcedure`, deliberately and still: a teacher's `inventory: ["read"]` would otherwise reach the whole staff directory — every colleague's name, category, employment status, badge number and login role. The audience, not the filter, is the reason. **This is why the teacher portal's own hand-on dialog (`teacher-portal/transfer-ownership-dialog.tsx`) still offers no successor picker**, and why that is not a bug: the widened list is _more_ of a directory than the narrow one was.
- **This narrows nothing on the roster side of the app.** `staff/teacher-eligibility.ts` and `staff/list-staff.ts` keep their teaching-staff predicate on purpose — a homeroom or subject roster and a year roster must not contain the bursar. The two sets used to hold the identical predicate and had to move together; **they now diverge deliberately, and a change to one must not reach back into the others.**

## Design tokens

Colour is not free-form in this feature, and the warning hue has a second token that exists only for **ink**:

- **`--gold`** — surfaces, rules, chart series. It is 3.87:1 on the page background, which clears the 3:1 floor for large text and non-text UI but **fails AA for body text**. It is never used for warning copy.
- **`--warning-ink`** (`#7f5605`) — warning _text_, at any size. Measured 6.12:1 on `--background`, 6.38:1 on `--card`, 5.65:1 on the `bg-accent/20` the register's `Borrowed` badge sits on, 5.79:1 on `bg-accent/10`. One warning hue with one legibility floor, so the same state is as readable as a `text-xs` row badge as it is at `text-xl` on a stat card. The arithmetic is in `packages/ui/src/styles/globals.css`.

Fills and borders stay on `accent/50` / `accent/20` in both cases: those are surfaces, and `--gold` was never the problem. `--gold` itself is untouched, because it is used elsewhere in the app and re-tuning it is a product decision.

Every consumer of a warning state — the `Borrowed` and `Under Repair` badges, the stat cards' warning figures, the "At reorder level" row badge, the standing no-categories notice, the edit dialog's "what this cannot change" panel — reads `--warning-ink` through the `text-warning-ink` utility. `DESTRUCTIVE_STRONG` / `DESTRUCTIVE_SOFT` carry the out-of-stock / damaged distinction in `shared/inventory-status-badge.tsx`, and the register prints the word "Damaged" only once per row: the Status column keeps the badge, the Condition column states the recorded condition in words.

**State of the build.** Every module in the plan is on disk: the shared layer (`shared/*`), the eleven screen modules beside this file, the page shell that composes the filter bar, the stat cards, the table and the dialogs, the item create/edit/retire dialogs, the custody dialogs and history sheet, the categories panel, the two ledger views, and the teacher's own equipment page under `staff/teacher-portal/`. Both route files are generated: `routes/_auth/admin/$year/staff/inventory.tsx` and `routes/_auth/teacher/$year/equipment.tsx`. **The procedure table below was reconciled against a grep of the real `orpc.inventory.*` call sites across `apps/web/src`, not against this document's own earlier claims** — it is the only part of this file that can be checked mechanically, so it is the part that has to be.

## Overview

The school's equipment register: **who holds what, who is answerable for what, and how both change hands.**

It is used by three audiences, and the feature exists because their questions are different:

- The **school administrator**, who maintains the register — what exists, what it is called, how many there are, what it is worth, who is answerable for it.
- The **storekeeper at the counter**, who moves stock in and out and records a reason when something leaves or changes hands.
- The **teacher**, who reads their own holdings, takes one off the shelf, hands one back, and — for equipment they are the **owner** of — sees what is out with other people, calls it back, or hands the ownership on. They cannot move school property to a third party they are not the owner of, cannot appoint or remove an owner, and cannot sign off a write-off; the exact boundary is in "Deliberately not built".

## The two accountabilities

This is the concept the whole feature is built on, and it is easy to state wrongly.

- The **owner** is the person the school is answerable to about an item — the one a principal asks when the microscope cannot be found.
- The **custodian** is the person it is **lent to** right now: the one physically holding it.

They are separate columns on `inventory_item` and separate questions. **The owner side is the `managerStaffId` column, and the custodian side is `custodianStaffId`.** The schema's word is "manager" and the school's is "owner", and both are load-bearing in different places: the procedures are `custody.assignManager` / `custody.transferOwnership`, the history change types are `manager_assigned` / `manager_changed` / `manager_cleared`, and `CustodyBadge`'s chips still print **"Manager · …"**, **"No manager"** and **"In store · no manager"** because that component is not mine to rename. The owner's own dialogs in `custody-dialogs.tsx` use the school's word on screen, since "manager" reads in a school register as a job title rather than as accountability for one item. Nothing is renamed in code; this paragraph is the mapping, so grep for either word and find both.

- An item **can have an owner while sitting in the store** — nobody is holding it, somebody is still answerable for it. That is the normal state of a projector in a cupboard.
- An item **can have a custodian and no owner** — a teacher is holding school property that nobody has been made responsible for. This is the gap the register's "No manager" card counts, and the **"No manager only"** filter narrows the register to exactly those rows.
- **One change moves exactly one of them, with one deliberate exception.** Appointing an owner does not move the item. Transferring the item to a new custodian does not touch the owner. The exception is `custody.transferOwnership`, which clears the current custodian **in the same transaction** and writes two history rows because two pointers moved — see "The transfer model".
- A disposed item has neither.

`CustodyBadge` is therefore the signature element of the register and renders all four states, including the empty one as **"In store · no manager"** rather than as a blank. A blank reads as missing data; this is a _known_ state, and it is the state that needs acting on.

## The transfer model

- **A reason is required for every transfer and every owner change.** `custody.transfer`, `custody.assignManager`, `custody.transferOwnership` and `custody.reclaimCustody` all declare `reason` as a required picklist, which is stricter than the `inventory_custody_history_reason_required` CHECK (that one exempts a first claim, `custody_taken`, and a first appointment, `manager_assigned`). `TransferReasonField` says so on the face of the form rather than letting a toast report it after submit. The eight options and their wording come from `INVENTORY_TRANSFER_REASON_KEYS` / `inventoryTransferReasonLabel`.
- **The free-text `note` is a separate field.** "Misassignment" is a category; "Mr Perera had both projectors" is a detail. Folding the second into the first would leave a `reason` column holding a sentence.
- **The history is append-only.** `inventory_custody_history` is written one row per change and never updated. There is no "edit the last transfer".
- **There is no silent reassignment.** The pointer, the history row, the counter-ledger row and the audit row are one transaction (`getLockedItem` takes `FOR UPDATE` first), so a custody change without its history row cannot happen.
- **The six change types are kept apart on purpose** — three custody values, three manager values — because they are answered by different questions and collapsing them would make "who took what, and when" unaskable.
- **A hand-on is the one write that moves two columns.** `transferOwnership` sets `managerStaffId` to the successor and `custodianStaffId` to `null` in the same `UPDATE`, and writes **two** rows: a `manager_changed` filling the two manager columns and, only if somebody was holding the item, a `custody_released` filling the two custodian columns. They cannot be merged, because `inventory_custody_history_manager_columns` treats "this is a custody type" and "both manager columns are null" as the same fact. The holder is cleared because a record reading _"R. Perera owns it and S. Fernando is holding it"_ immediately after the ownership changed hands is a data-entry slip far more often than an intent; if the successor is physically on the item, `custody.take` is how they say so themselves. **Both dialogs say this on the face of the form before the button is pressed** — it is on the register whether the user expected it or not.
- **Two verbs write the owner column, and one of them is the teacher's.** `transferOwnership` moves accountability to a _person_ and is gated on `manageOwn` (owner, or one of the three leadership seats, in the handler); `assignManager` is gated on `update` (administrator-only) and its `newManagerStaffId` is **nullable**, so it can also appoint the first owner or clear the slot into a `manager_cleared` row. Two verbs, one column, on purpose: a single nullable input could not tell a caller whether a `null` was going to name somebody else or nobody, and a dialog that guessed wrong in the destructive direction is the bug `ManagerDecision` in `custody-dialogs.tsx` exists to make impossible.

## Screens

| Screen / component | What it does | State |
| --- | --- | --- |
| `InventoryStatCards` | The seven summary figures: items, units, available, borrowed, low stock, out of stock, **no manager**. Skeletons, not blanks, while loading. | Shipped |
| `InventoryFilterBar` | Search (debounced), status, category, condition, custodian, low-stock toggle, **"Show retired"** toggle, `Clear filters`, and `Showing N of M` — in three sentences, plain / filtered / unfiltered-truncated. | Shipped |
| The "no manager" filter | A toggle under the stat cards that narrows the register to items with no `managerStaffId`. **Client-side, over the loaded page** — see the correction above. | Shipped |
| `InventoryTable` | The register. Every row carries the asset, the owner + custodian pair (`CustodyBadge`, which prints them as `Manager · …` and `Held by · …`), the three counters, status, condition, location, and a row action menu. A **retired** row is marked, muted, not clickable, and its menu offers only "Restore to the register". | Shipped |
| `StockInDialog` | The only place an asset tag is invented. Quantity, tags, condition, location, supplier, purchase date, invoice, note. | Shipped |
| `StockOutDialog` | Immediate unapproved loss. Quantity, tags, a required free-text reason, approver, note. Confirmed with an `AlertDialog`. | Shipped |
| `AssetRegisterPanel` | Every tagged unit the school owns, and the only two unit-status moves a person may make by hand. | Shipped |
| `IssuesPanel` / `IssueDialog` | Stock that has permanently left the school, and the certificate naming who took it. Terminal: no return, no cancel. | Shipped |
| `LoansPanel` / `BorrowDialog` / `ReturnBorrowDialog` | Who has what, and what is late. `qty` is untouched; only `borrowedQty` rises. The return half records the condition the tags came back in. **A loan may be to a member of staff or to a student** — `shared/borrower-picker.tsx` switches between the staff roll and the student register, and `borrows.create` records which with `receiverType`. | Shipped |
| Disposals panel + raise / approve / finalise / cancel | `DisposalsPanel`, `DisposalRequestDialog`, `ApproveDisposalDialog`, `FinalizeDisposalDialog`, `CancelDisposalDialog`. The two-stage write-off: `pending_approval` → `approved` → one of six final statuses, or `cancelled`. | Shipped |
| Item create / edit / retire dialogs | Register maintenance. `qty`, `managerStaffId` and `custodianStaffId` are deliberately absent from `updateItem`. The retire confirm and the **restore confirm** are both `AlertDialog`s — the retirement is soft and the restoration puts a live, lendable row back in front of everybody. | Shipped |
| Custody dialogs + history sheet | The two accountabilities, and the append-only history behind them: `TransferCustodyDialog`, `AssignManagerDialog`, `TakeOrReleaseDialog`, **`TransferOwnershipDialog`**, **`ReclaimCustodyDialog`** and `CustodyHistorySheet`. The last two own their mutations, toasts and invalidation, are reached from the foot of the history sheet, and are **exported** — they take an `InventoryItemView \| null` and report what they wrote through `onRecorded`, so the register's row menu is the other door to the same dialogs and needs no special case. | Shipped |
| Categories panel + seed | The eight `DEFAULT_INVENTORY_CATEGORIES`, an empty picker being the first thing that blocks a first-time user. | Shipped |
| Ledger (transactions + audit log) | The counter ledger and the row-level before/after log. Mounted **once**, at the foot of the Records pane under its own `Ledgers` heading. The page's third "Ledger" tab was removed as a duplicate mount. | Shipped |
| Teacher page — my equipment | A teacher's own holdings (`custody.myItems`). **Take one off the shelf, hand one back, and — as owner — call it back off a colleague or hand the ownership on.** Reached through `custody.takeable.listTakeableItems`, the narrow catalogue, not the school register. | Shipped |
| Teacher page — lent out to others | `custody.lent` (`listLentByMe`): the equipment the teacher is answerable for that is physically in somebody else's hands, with the holder named. Sits in `teacher-portal/lent-out-section.tsx`, **outside this folder**. | Shipped |

## Router procedures the UI calls

Grouped exactly as `packages/api/src/routers/inventory/index.ts` groups them. The keys are the client paths and are not to be renamed.

| Group | Procedure | Called by the UI |
| --- | --- | --- |
| `categories` | `list` | **Yes** — `inventory-page.tsx` owns the one read and hands `categories` to `InventoryFilterBar` as a prop, so the picker and the panel cannot disagree about the list |
|  | `create` | Categories panel, and the item create/edit form's inline "New category" row (`item-dialogs.tsx`) |
|  | `remove` | Categories panel |
|  | `seed` | The Categories panel (labelled "Categories" from the page header; the action inside is "Seed the eight starter categories") and, when the store has no categories at all, a direct button on the register's empty state. The inline "New category" row is `create`, not `seed` |
| `options` | `assignableStaff` | **Yes** — every staff picker in the feature: `StaffComboboxField` (custody transfer, hand-on, assign owner, the filter bar's custodian), `BorrowerPicker`, and the invalidation key that a renamed person dirties. **Any member of staff whose employment is `active` or unset**, with no `staffCategory` restriction — see "Any member of staff may hold school property" below |
| `items` | `list` | **Yes** — the register query, `useItemOptions` / `ItemPicker`, and both ledger views |
|  | `get` | **Yes** — `BorrowDialog` pre-fills the item's counters |
|  | `create` | Item create dialog |
|  | `update` | Item edit dialog |
|  | `remove` | Retire confirmation (`AlertDialog`) |
|  | `restore` | **Yes** — the restore confirmation (`AlertDialog`), reachable only from a retired row's menu, which is the only place it succeeds against. `requireInventoryPermission("update")`; the row comes back with its counters, tags, manager and custodian untouched, and both edges of the retired interval are in the change log |
|  | `stockIn` | **Yes** — `StockInDialog` |
|  | `stockOut` | **Yes** — `StockOutDialog` |
| `units` | `list` | **Yes** — `useItemUnits`, `AssetRegisterPanel`, `UnitPicker` |
|  | `update` | **Yes** — `AssetRegisterPanel` (status, condition, location, note) |
| `custody` | `transfer` | Custody transfer dialog |
|  | `transferOwnership` | **Yes** — `TransferOwnershipDialog` in `custody-dialogs.tsx`, reached from the foot of the custody history sheet. Also the teacher's own page, from `teacher-portal/` |
|  | `reclaimCustody` | **Yes** — `ReclaimCustodyDialog` in the same file and the same place. Also the teacher's own page, from `teacher-portal/`. **The router key is `reclaimCustody`; the folder's own banner and the handlers' doc comments call the verb "reclaim"** — the same `transferCustody` → `transfer` shorthand the group uses elsewhere, so grep for either |
|  | `assignManager` | Assign-manager dialog (`newManagerStaffId: null` clears) |
|  | `take` | **Yes** — the register's row action menu **and** the teacher's own page. This entry used to claim the teacher page could not reach it; see the correction below |
|  | `release` | **Yes** — the teacher's own page (hand it back) and the register's row action |
|  | `history` | Custody history sheet, and the teacher's own page |
|  | `myItems` | Teacher page |
|  | `lent` | **Not from this folder, and honestly reported as such.** `listLentByMe` — items the caller owns that are with somebody else — is called from `teacher-portal/use-my-equipment.ts` and `teacher-portal/lent-out-section.tsx`. No file under `staff/inventory/` calls it, and none should: the register is `adminProcedure` and this list is a teacher's read of their own accountability |
|  | `takeable.listTakeableItems` | **Not from this folder.** The narrow catalogue the teacher's "take one off the shelf" picker lists; called from `teacher-portal/take-item-dialog.tsx`. The key is a nested object (`takeable: { listTakeableItems }`), so the client path is `custody.takeable.listTakeableItems` |
| `issues` | `list` | **Yes** — `IssuesPanel` |
|  | `create` | **Yes** — `IssueDialog` |
| `borrows` | `list` | **Yes** — `LoansPanel`, `BorrowDialog`, the open-borrows strip |
|  | `create` | **Yes** — `BorrowDialog`, for a staff **or** a student borrower |
|  | `return` | **Yes** — `ReturnBorrowDialog` |
| `disposals` | `list` | **Yes** — `DisposalsPanel` |
|  | `create` | **Yes** — `DisposalRequestDialog` |
|  | `approve` | **Yes** — `ApproveDisposalDialog` |
|  | `finalize` | **Yes** — `FinalizeDisposalDialog` |
|  | `cancel` | **Yes** — `CancelDisposalDialog` |
| `ledger` | `transactions` | **Yes** — the movement ledger, and as the invalidation key after every stock movement, borrow, issue and disposal |
|  | `auditLogs` | The audit-log view, mounted with the movement ledger under the Records pane's `Ledgers` heading |

Every mutation outcome goes through `toast` from `sonner`, and every server error is read through `formatApiErrorMessage` (a valibot failure arrives as `Qty: Value does not match the required format`, not as the generic `Input validation failed`). `validationFieldErrors` maps issues back onto form fields where a dialog has fields to map them to.

**Each outcome is toasted exactly once, by the mutation observer.** `mutateAsync` rejects into its caller, so a dialog that also toasted in its `catch` printed the identical sentence twice for every validation failure, every duplicate SKU and every dropped connection. The rule is: the `useMutation`'s `onError` owns the toast, because it is the only thing that survives the dialog unmounting; a dialog's `catch` does `setErrors(validationFieldErrors(error))` and nothing else. `custody-dialogs.tsx` and `item-dialogs.tsx` both follow it.

**Every write invalidates by scope, not by hand.** `invalidateInventory(queryClient, scope)` in `shared/inventory-query-keys.ts` takes one of ten scopes (`item`, `stock`, `unit`, `category`, `custody`, `issue`, `borrow`, `return`, `disposal`, `disposalDecision`) and invalidates the keys that scope dirties. `ledger.auditLogs` is in **every** scope: every dialog-level handler in this folder writes an `inventory_audit_log` row, and the Change log's own header promises it always shows one — so a handler that invalidates everything except the audit log is a screen quietly lying about its own completeness. The two owner dialogs are no exception: `TransferOwnershipDialog` and `ReclaimCustodyDialog` own their own mutations and call `invalidateInventory(queryClient, "custody")` themselves, because a sheet is not the place to own a query client.

### One input quirk worth writing down

`createIssue` requires `receiverPhone` and `expectedReturnDate` as **keys whose value may be `null`**. The form must send them explicitly as `null` rather than omitting them — a documented drizzle-valibot behaviour, commented at the submit handler in `issue-dialogs.tsx`. Omitting a required-but-nullable key is not the same request as sending `null`.

## Status vocabulary, and where each label comes from

Every label is read from `packages/db/src/constants/inventory.ts`. A component that spelled one of these out would be a second place for the same words to drift, and a printout that says `custody_taken` beside a screen that says "Custody taken" is the same bug in a different file.

| Vocabulary | Constant / helper | Notes |
| --- | --- | --- |
| Item & unit condition | `ITEM_CONDITIONS`, `itemConditionLabel` | `Good`, `Fair`, `Damaged`, `Under Repair`. "Under repair" is **not** a flavour of "Damaged" — a repaired device comes back into service. |
| Unit status | `UNIT_STATUSES`, `unitStatusLabel` | `available`, `borrowed`, `issued`, `disposed`, `removed`. No `reserved` — see the banner. |
| Transfer reason | `INVENTORY_TRANSFER_REASON_KEYS`, `inventoryTransferReasonLabel` | Eight values. `other` is a real member of the set, not a hole in it. |
| Custody / manager change type | `CUSTODY_CHANGE_TYPE_LABELS`, `custodyChangeTypeLabel` | Six values, custody and manager kept apart. |
| Borrow status | `BORROW_STATUS_LABELS`, `borrowStatusLabel` |  |
| Disposal method & status | `DISPOSAL_METHODS`, `disposalStatusLabel`, `DISPOSAL_FINAL_STATUSES` | The six final statuses each pair with a method via a CHECK. |
| Ledger action | `INVENTORY_ACTION_LABELS`, `inventoryActionLabel` |  |
| Seeded categories | `DEFAULT_INVENTORY_CATEGORIES` | Read by `categories.seed`, which **skips** rather than overwrites, so a school that has renamed or recoloured one of them keeps its choice. |
| **Derived item status** | `itemStatusLabel` (in `shared/inventory-status-badge.tsx`) | The one label with no server-side map. `calculateItemStatus` derives `out_of_stock` / `borrowed` / `damaged` / `available` from `qty`, `borrowedQty` and `condition`; the four labels and their four treatments live beside the badge, and the filter bar's status picker imports the same helper. An unrecognised status degrades through `humanizeKey` rather than blanking the list — the same defence `leave-management/leave-status.ts` uses. |

Each lookup in that table is null-safe and humanizing: an unrecognised stored key renders as readable words, never as a raw enum.

**The one vocabulary that has no server map is a null pointer.** `custody_taken`'s previous custodian, `custody_released`'s new custodian and `manager_cleared`'s new manager are all legitimately `null`, and each needs a _different_ name for its absence: **"the store"** (a previous holder that is null means the item was sitting unheld), **"the store"** again for a released item (it has gone back on a shelf), and **"nobody"** (the school has decided nobody is answerable for it). `custody-dialogs.tsx` holds these as `IN_STORE` and `NO_MANAGER` with the reasoning in the comment above them, and the same file's shared `PartyName` adds the third case — a name beside a **non-null id with a null name**, which means the staff record has been deleted and is drawn struck through, because the four `*_staff_id` columns on the history table are `set null` and a departure retires the name without deleting the trail. Writing "None" for all of them would flatten the only distinction that matters on an audit line.

**The disposal status history was the one surface that could not make that distinction, and now does.** `listDisposals`'s `history[]` projected `changedByName` and **not** `changedByStaffId` — the column the left join reads as its key — so `(id, null)` and `(null, null)` arrived identically and the history rendered a departed colleague as "No name on record for this transition", which implies the change might not have happened. Both columns are projected now, `DisposalHistoryEntry` carries both, and the history renders through the same `PartyName` as the four sign-off cells: **a person → their name; a departed colleague → struck-through "No longer on the staff roll"; a leadership account with no staff row → "Account with no staff row"** (the seeded admin / principal / deputy-principal seats are users with no staff identity by design, so that is a legitimate actor, not a gap).

## Keyboard behaviour

There are **no product-level keyboard shortcuts in this feature.** None are documented here because none exist.

- **Esc** — closes an open `Dialog`, `AlertDialog`, `Sheet`, `Combobox` popup or `Select` popup, and dismisses a toast.
- **Tab / Shift+Tab** — moves through form fields, then the dialog's footer buttons, then out. A `CustodyBadge` gap chip is **not** a tab stop: it was a `Tooltip` trigger (a `<button>`), which put up to 200 of them in the tab order on the register, and it is now a plain chip carrying a `title` for the mouse and its full sentence as visually-hidden text for a screen reader. Zero tab stops is the only number that matters on a 200-row table.
- **Enter** — submits the focused form. Dialogs in this app put their submit button **outside** the `<form>` and bind it with `form="id"`, which still associates it, so implicit submission works. Inside an open `Combobox` or `Select` popup, Enter picks the highlighted option first and does not submit.
- **The register's rows** are clickable but only the **name** is focusable, deliberately — one action in the tab order once, not twice. The row's other actions live in its menu, one tab stop per row.
- **Explanations that a `title` used to carry** are now in the document and reached with `aria-describedby`, because a `title` is hover-only: a keyboard user never gets the sentence saying that the table's sort is a browser-side sort over a page capped at 200 lines, and neither does a screen reader reliably. The sort buttons point at the visible note above the table; the custody chip's sentence is inside the chip.

The only shortcut in the whole app is the sidebar's inherited Cmd/Ctrl+B toggle.

## Responsive behaviour

Desktop-first, per AGENTS.md. **No phone layout was designed for this feature.**

- **Desktop** — the register is a `Table` in full: **Asset** (name, SKU, category, and whether the line is tagged or counted in bulk), **Responsible** (the `CustodyBadge` pair, both accountabilities in one cell), **On hand / available / loan**, **Status**, **Condition**, **Location**, **Actions**. Category is a line inside the Asset cell rather than a column of its own, and the two people share one column deliberately — see "The two accountabilities".
- **Below `md`** — tables **scroll horizontally; they do not reflow into cards.** `Table` already wraps in an `overflow-x-auto` container, and secondary columns may hide with `hidden md:table-cell` where a column stops earning its width. Turning a stock ledger into stacked cards on a phone would mean the numbers stop lining up, and lining up numbers is the job.
- **Dialogs** — full-screen on narrow viewports, centred on desktop (handled by `Dialog` / `Sheet`). A stock-in with a tag list is not a form that works in a 380px column.
- **The filter bar** — wraps onto multiple rows below `md`. It is a toolbar, not a single line, and clipping it is worse than stacking it.

## Deliberately not built

This is the honest record of what this feature **is not**. Anything listed here is absent on purpose, and a future change to one of them is a feature rather than a fix.

- **Reservations.** Date-ranged holds are **deliberately not ported** from the source app, and with them the `reservedQty` counter. There is no `reserved` unit status, no `reserved` badge, no reservation screen, and no `borrowedQty`/`reservedQty` split anywhere in the UI. A school has no reservation workflow that outlives the request that created it, and the `borrowedQty` counter occupies the slot `reservedQty` used to hold.
- **Hard delete of items.** Soft delete only. `inventory_item` is referenced by the counter ledger, the custody history and the audit log, and a hard delete would leave a school unable to reconcile its books. `includeDeleted` is restricted to `admin` / `principal` / `vicePrincipal` because it un-hides every retired record in the school at once.
- **A separate storekeeper role.** There is no `storekeeper` role and no storekeeper-specific permission grant. The existing `admin` role administers the register; `adminProcedure` gates the school-wide reads (the disposals list is one of them) so a teacher's `inventory: ["read"]` cannot reach the whole school's register of write-offs.
- **A teacher's authority over anybody else's equipment.** A teacher holds `inventory: ["read", "take", "manageOwn"]`, and the boundary is worth stating exactly rather than as a mood. They **cannot** move property to an arbitrary third party — `custody.transfer` is `update`; they **cannot** appoint or clear an owner — `custody.assignManager` is `update`, so `managerStaffId` on an item they do not own is not theirs to write; and they **cannot** sign off a write-off — `disposals.approve` needs `approve`. What they **can** do is the whole round trip on their own equipment: see what is on the shelf, take one, hand it back, see what is out with other people, call it back, and hand the whole responsibility on. `manageOwn` is a grant to the owner, not a promotion: a teacher who is not in charge of an item cannot transfer it, cannot reclaim it, and cannot use either verb to learn anything about it. Issuing stock out of the school permanently (`issues.create`) and writing it off (`disposals.*`) remain administrator actions throughout.
- **A student-facing inventory screen.** A student can be the **recorded borrower** of an item on exactly the same dated-loan terms as a member of staff: `shared/borrower-picker.tsx` switches between the staff roll and the student register, and `borrows.create` writes `borrower_staff_id` or `borrower_student_id` accordingly. What does not exist — and must not be built on this table — is a student signing in. **The `student` table has no `userId` link, so a student can never authenticate**, and a student loan is created by a member of staff and closed by a member of staff. A student is a **subject of a loan, never an actor**: "let the student return it themselves" is an accounts or a marking feature, and building it here would mean inventing an identity the schema does not have. The half of the feature a reader is most likely to assume is missing is the half that is _deliberately_ missing, not the half that was forgotten.
