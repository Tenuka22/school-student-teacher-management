import { humanizeKey } from "@school-student-teacher-management/db/constants/display";
import {
  itemConditionLabel,
  unitStatusLabel,
} from "@school-student-teacher-management/db/constants/inventory";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import {
  IconBuildingWarehouse,
  IconCircleCheck,
  IconPackage,
  IconPackageOff,
  IconTool,
  IconUserCheck,
  IconUserX,
} from "@tabler/icons-react";
import type * as React from "react";

import type { InventoryItemStatus } from "@/components/staff/inventory/inventory-types";

/*
 * `itemStatusLabel` is exported from beside the four status treatments on
 * purpose: the filter bar's status picker and `ItemStatusBadge` have to name the
 * same four states the same way, and splitting the label out into a constants
 * module would be one more file for four strings. Fast Refresh degrades to a
 * full reload of this module when `itemStatusLabel` changes, which costs nothing
 * — it is a pure string function with no state to preserve.
 */
/* oxlint-disable react-doctor/only-export-components -- label helper lives with the badges it names */

/**
 * The five treatments this file draws on, named for what they *mean* rather
 * than for the colours they happen to use.
 *
 * They are declared once because the same five appear three times below — once
 * for the item status, once for the condition, once for the unit status — and
 * three copies of `border-destructive/40 bg-destructive/5 text-destructive` is
 * three chances for a later edit to make the register say two different things
 * with the same word.
 *
 * `DESTRUCTIVE_STRONG` and `DESTRUCTIVE_SOFT` are the pair that carries the
 * out-of-stock / damaged distinction: same hue, deliberately different emphasis.
 *
 * `WARNING` uses `text-warning-ink` and **not** `text-gold`. The border stays on
 * `accent/50` and the fill stays on `accent/20` — both are surfaces, both are fine
 * — but the ink does not: `--gold` on this badge's own `bg-accent/20` is 3.45:1,
 * and `Borrowed` is the single most important state in the register. `--warning-ink`
 * is the same hue at a lightness that clears 4.5:1 there (5.65:1); the arithmetic is
 * in `packages/ui/src/styles/globals.css`. `--gold` itself is untouched, because it
 * is used elsewhere in the app and re-tuning it is a product decision.
 */
const DESTRUCTIVE_STRONG = "bg-destructive/10 text-destructive";
const DESTRUCTIVE_SOFT =
  "border-destructive/40 bg-destructive/5 text-destructive";
const WARNING = "border-accent/50 bg-accent/20 text-warning-ink";
const POSITIVE = "border-success/30 bg-success/10 text-success";
const NEUTRAL_TREATMENT = "border-border text-muted-foreground";

/**
 * How an item's derived status reads.
 *
 * The four keys are `InventoryItemStatus` itself — projected from the router in
 * `inventory-types.ts`. This comment used to claim that adding a fifth arm to
 * `calculateItemStatus` was "a type error here". **It was not**, and that was worth
 * knowing: this map is a `Record<string, …>` and the fallback below is the whole
 * point of it, so a fifth status would have rendered here through `humanizeKey` with
 * no complaint whatsoever. The compile error is in the **filter bar**, whose
 * `STATUS_ORDER` is `as const satisfies readonly InventoryItemStatus[]` — the same
 * pattern `packages/api/src/routers/inventory/list-items.ts` uses for its status
 * picklist. A new status is now a build failure there rather than a status on the
 * register that nothing on the register can filter for.
 *
 * The lookup still goes through `humanizeKey` as a fallback, for a different and
 * still valid reason, matching `leave-management/leave-status.ts`: rendering an
 * unfamiliar status as readable words beats an empty-looking register. Degrade in the
 * *renderer*, guard in the *filter* — that ordering is deliberate.
 *
 * **Colour is never the only channel.** Every badge carries its status as text,
 * and `out_of_stock` and `damaged` differ in *emphasis* and *icon* as well as
 * hue, because they are different kinds of fact and a reader who cannot tell
 * them apart has been told the wrong thing about the store:
 *
 * - `out_of_stock` is a **count**: nothing is on hand, whatever else is true.
 * - `damaged` is a **condition**: the stock exists, and something is wrong with
 *   it. It is deliberately the *lower*-emphasis destructive treatment, because
 *   it is the softer of the two facts.
 *
 * Rendering both as the same red badge would make "we have none" and "we have
 * some, cracked" look like one state, and those two send a storekeeper to two
 * completely different places.
 */
const ITEM_STATUS_TREATMENTS: Record<
  string,
  {
    label: string;
    className: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  out_of_stock: {
    label: "Out of stock",
    className: DESTRUCTIVE_STRONG,
    Icon: IconPackageOff,
  },
  borrowed: {
    label: "Borrowed",
    className: WARNING,
    Icon: IconUserCheck,
  },
  damaged: {
    label: "Damaged",
    className: DESTRUCTIVE_SOFT,
    Icon: IconTool,
  },
  available: {
    label: "Available",
    className: POSITIVE,
    Icon: IconCircleCheck,
  },
};

/**
 * The wording for one derived status, and the only place it is written.
 *
 * Exported because the filter bar's status picker and the badge have to name
 * the same four states the same way; two components spelling out "out of stock"
 * is the kind of pair that ends up disagreeing in a language pass. The
 * `humanizeKey` fallback is what an unfamiliar status degrades to, matching
 * `leave-management/leave-status.ts`.
 */
export const itemStatusLabel = (status: string): string =>
  ITEM_STATUS_TREATMENTS[status]?.label ?? humanizeKey(status);

export const ItemStatusBadge: React.FC<{ status: InventoryItemStatus }> = ({
  status,
}) => {
  const treatment = ITEM_STATUS_TREATMENTS[status] ?? {
    label: itemStatusLabel(status),
    className: NEUTRAL_TREATMENT,
    Icon: IconPackage,
  };

  const { Icon } = treatment;

  return (
    <Badge variant="outline" className={treatment.className}>
      <Icon />
      {treatment.label}
    </Badge>
  );
};

/** The four condition treatments, keyed by the stored value the column holds. */
const CONDITION_TREATMENTS: Record<string, string> = {
  Damaged: DESTRUCTIVE_SOFT,
  "Under Repair": WARNING,
  Good: POSITIVE,
};

/**
 * An item's or a unit's condition, from `itemConditionLabel` — never a local
 * map. The four stored values are `Good` / `Fair` / `Damaged` / `Under Repair`
 * and the display wording is the server's; a component that spelled them out
 * would be a second place for the same words to drift.
 *
 * `Under Repair` is a distinct state rather than a flavour of `Damaged`,
 * because a repaired device comes back into service and a broken one does not,
 * and a register that collapsed them would hide items that are coming back. A
 * condition this file has not seen falls back to the neutral treatment and the
 * server's own label, so a fifth value degrades rather than disappearing.
 */
export const ConditionBadge: React.FC<{ condition: string }> = ({
  condition,
}) => (
  <Badge
    variant="outline"
    className={CONDITION_TREATMENTS[condition] ?? NEUTRAL_TREATMENT}
  >
    {itemConditionLabel(condition)}
  </Badge>
);

/** The five unit-status treatments, keyed by the stored value the column holds. */
const UNIT_STATUS_TREATMENTS: Record<string, string> = {
  available: POSITIVE,
  borrowed: WARNING,
  issued: DESTRUCTIVE_SOFT,
  disposed: DESTRUCTIVE_SOFT,
};

/**
 * One tagged unit's status, from `unitStatusLabel`.
 *
 * `issued` and `disposed` share the destructive treatment on purpose: from the
 * store's point of view they are the same answer — the school does not have it
 * any more — while `removed` is deliberately absent from the map and falls
 * through to neutral, because a removed unit was taken off the books as a detail
 * edit rather than written off, and painting it the same red would say the
 * school lost something it did not.
 */
export const UnitStatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <Badge
    variant="outline"
    className={UNIT_STATUS_TREATMENTS[status] ?? NEUTRAL_TREATMENT}
  >
    {unitStatusLabel(status)}
  </Badge>
);

/** The manager half: who is in charge of the item. Present or absent — never a gap. */
const ManagerChip: React.FC<{ name: string }> = ({ name }) => (
  <Badge
    variant="outline"
    className="border-primary/30 bg-primary/10 text-primary max-w-full"
  >
    <IconUserCheck />
    <span className="truncate">Manager · {name}</span>
  </Badge>
);

/** The custodian half: who is physically holding it. Filled, because it is the fact being tracked. */
const CustodianChip: React.FC<{ name: string }> = ({ name }) => (
  <Badge className="max-w-full">
    <IconPackage />
    <span className="truncate">Held by · {name}</span>
  </Badge>
);

/**
 * The half that is missing, stated as a fact and not as an omission.
 *
 * A register column is narrow, the chips above truncate, and a truncated "In store"
 * reads as though the row has no data on it — which is exactly the ambiguity this
 * feature exists to remove. So the full sentence has to be *available*, and the
 * mechanism that used to carry it was wrong.
 *
 * **This was a `Tooltip`, and a base-ui tooltip trigger is a focusable button.** A
 * 200-row register therefore put up to 200 of them in the tab order: reaching row
 * 40 meant tabbing past 80 chips that each did nothing but repeat a sentence, and a
 * keyboard user on the register — the clerk who has just been handed the store — was
 * paying for a hover affordance they cannot use. The idea was right; the mechanism
 * cost more than it gave.
 *
 * What replaced it, and why this and not the alternatives:
 *
 * - **A plain chip, no interactive element at all.** Zero tab stops is the only
 *   number that matters here: the fix is not "fewer" focusable things per row, it is
 *   none. Anything that stays a button re-creates the defect at a smaller scale.
 * - **`title` on the chip** for a sighted mouse user, which is the case the tooltip
 *   was actually built for and the one `title` serves natively for free — no portal,
 *   no positioner, no floating-ui anchor per row, which is 200 of those gone too.
 * - **The full sentence as visually-hidden text inside the chip**, not as an
 *   `aria-label` and not as an `aria-describedby`. `aria-describedby` would need an
 *   id on the surrounding `<td>`, and the cell belongs to `inventory-table.tsx` — so
 *   the sentence would depend on a caller doing something right, and a chip used
 *   anywhere else would silently lose its explanation. An `aria-label` on the chip
 *   would *replace* the visible text and break the sighted reading. Text in the tree
 *   is read by every consumer of the cell, needs no cooperation, and cannot be
 *   pointed at a missing id.
 *
 * The cost is honest and worth stating: a screen reader now reads the short label
 * and the sentence together ("In store. This item has no manager and no custodian…"),
 * which is longer than the two words a sighted user sees. On a screen where the
 * alternative is explaining *nothing*, that is the right trade.
 */
const GapChip: React.FC<{ text: string; detail: string }> = ({
  text,
  detail,
}) => (
  <Badge
    variant="outline"
    className="text-muted-foreground max-w-full border-dashed"
    title={detail}
  >
    <IconBuildingWarehouse />
    <span className="truncate">{text}</span>
    <span className="sr-only">. {detail}</span>
  </Badge>
);

/**
 * The signature element: who is in charge, and who has it, together.
 *
 * These are two separate facts and the whole feature exists to track both.
 * "Manager" is the teacher accountable for the item; "custodian" is the teacher
 * holding it. An item can have a manager while sitting in the store, a custodian
 * with no manager, both, or neither — and all four are legitimate states, not
 * four degrees of incomplete data. Rendering the pair on one row is what stops a
 * reader from mistaking "nobody has it" for "nobody is responsible for it",
 * which is the mistake that lets a school lose a projector.
 *
 * The "neither" state is written out as **"In store · no manager"** rather than
 * left blank, because a blank reads as *missing data* and this is a *known*
 * state: the device is on a shelf and nobody has been made accountable for it.
 * It is also the state the register's unassigned-items card counts, so the
 * badge, that card and the **"No manager only"** filter that re-derives it have
 * to describe the same set of rows — and the chip below names all three, because
 * the filter is the control a reader actually reaches this state through and a
 * sentence that pointed at a card the reader cannot press was a dead end.
 */
export const CustodyBadge: React.FC<{
  managerName: string | null;
  custodianName: string | null;
}> = ({ managerName, custodianName }) => {
  if (managerName && custodianName) {
    return (
      <span className="inline-flex max-w-full min-w-0 flex-wrap items-center gap-1">
        <ManagerChip name={managerName} />
        <CustodianChip name={custodianName} />
      </span>
    );
  }

  if (managerName) {
    return (
      <span className="inline-flex max-w-full min-w-0 flex-wrap items-center gap-1">
        <ManagerChip name={managerName} />
        <GapChip
          text="In store"
          detail={`${managerName} is in charge of this item and nobody is holding it, so it is on a shelf somewhere in the store. A custody transfer gives it to a teacher and records a reason.`}
        />
      </span>
    );
  }

  if (custodianName) {
    return (
      <span className="inline-flex max-w-full min-w-0 flex-wrap items-center gap-1">
        <GapChip
          text="No manager"
          detail={`${custodianName} is holding this item, but no teacher has been made accountable for it. This row is counted on the register's unassigned items card — the "No manager only" filter will show you every row like this one — until a manager is assigned.`}
        />
        <CustodianChip name={custodianName} />
      </span>
    );
  }

  return (
    <span className="inline-flex max-w-full min-w-0 flex-wrap items-center gap-1">
      <GapChip
        text="In store · no manager"
        detail="This item has no manager and no custodian: it is in the store with nobody accountable for it. Assign a manager from the item's custody panel — that is a recorded change with a reason, not an edit to the item row."
      />
      <IconUserX className="text-muted-foreground size-3.5 shrink-0" />
    </span>
  );
};
