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

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

/**
 * The treatments this file draws on, named for what they *mean* rather than for
 * the colours they happen to use.
 *
 * **Three of the four are `Badge`'s own purpose-built variants, and that is the
 * point of this rewrite.** Each of them used to be a hand-rolled class string that
 * happened to reproduce a variant `packages/ui/src/components/badge.tsx` already
 * ships:
 *
 * | meaning | was | is |
 * | --- | --- | --- |
 * | nothing on hand | `"bg-destructive/10 text-destructive"` | `variant="destructive"` |
 * | out with a borrower | `"border-accent/50 bg-accent/20 text-warning-ink"` | `variant="warning"` |
 * | in and usable | `"border-success/30 bg-success/10 text-success"` | `variant="success"` |
 * | present, something wrong with it | `"border-destructive/40 bg-destructive/5 text-destructive"` | `variant="outline"` + that fill |
 *
 * The hand-rolled copies had to be kept in step by hand, and three of the four
 * had already drifted from the primitive — which is exactly the failure the
 * variants exist to prevent. `warning` is the one that matters: it is the
 * register's `Borrowed` state, the single most important badge in the product,
 * and `--gold` on its own `bg-accent/20` is 3.45:1 and **fails** AA body text.
 * `variant="warning"` is `border-accent/50 bg-accent/20 text-warning-ink` at
 * 5.65:1 on that same fill, so taking the variant rather than retyping the class
 * is what guarantees the ratio survives the next edit to the primitive. The
 * arithmetic is in `packages/ui/src/styles/globals.css`.
 *
 * `DESTRUCTIVE_SOFT` is the one string that stays, and it stays for a real
 * reason: there is no *soft* destructive variant, and the out-of-stock /
 * damaged distinction is load-bearing (see `ITEM_STATUS_TREATMENTS`). It rides
 * `variant="outline"` rather than `variant="destructive"` so it is a different
 * fill and not a `bg-destructive/*` fight with the variant's own.
 */
const DESTRUCTIVE_SOFT =
  "border-destructive/40 bg-destructive/5 text-destructive";
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
 * **Colour is never the only channel, and neither is the icon.** Every badge
 * carries its status as **text** — the word is in the element, not in a `title`
 * and not in a class — and `out_of_stock` and `damaged` differ in *emphasis* and
 * *icon* as well as hue, because they are different kinds of fact and a reader
 * who cannot tell them apart has been told the wrong thing about the store:
 *
 * - `out_of_stock` is a **count**: nothing is on hand, whatever else is true.
 * - `damaged` is a **condition**: the stock exists, and something is wrong with
 *   it. It is deliberately the *lower*-emphasis destructive treatment, because
 *   it is the softer of the two facts.
 *
 * Rendering both as the same red badge would make "we have none" and "we have
 * some, cracked" look like one state, and those two send a storekeeper to two
 * completely different places. The icons are `aria-hidden` on purpose: they are
 * the third channel for a *sighted* reader, and leaving them exposed would put an
 * unnamed graphic in the accessibility tree beside a word that already says it.
 */
const ITEM_STATUS_TREATMENTS: Record<
  string,
  {
    label: string;
    variant: BadgeVariant;
    className?: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  out_of_stock: {
    label: "Out of stock",
    variant: "destructive",
    Icon: IconPackageOff,
  },
  borrowed: {
    label: "Borrowed",
    variant: "warning",
    Icon: IconUserCheck,
  },
  damaged: {
    label: "Damaged",
    variant: "outline",
    className: DESTRUCTIVE_SOFT,
    Icon: IconTool,
  },
  available: {
    label: "Available",
    variant: "success",
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
    variant: "outline" as const,
    className: NEUTRAL_TREATMENT,
    Icon: IconPackage,
  };

  const { Icon } = treatment;

  return (
    <Badge variant={treatment.variant} className={treatment.className}>
      <Icon aria-hidden="true" />
      {treatment.label}
    </Badge>
  );
};

/** The four condition treatments, keyed by the stored value the column holds. */
const CONDITION_TREATMENTS: Record<
  string,
  { variant: BadgeVariant; className?: string }
> = {
  Damaged: { variant: "outline", className: DESTRUCTIVE_SOFT },
  "Under Repair": { variant: "warning" },
  Good: { variant: "success" },
};

/**
 * An item's or a unit's condition, from `itemConditionLabel` — never a local
 * map. The four stored values are `Good` / `Fair` / `Damaged` / `Under Repair`
 * and the display wording is the server's; a component that spelled them out
 * would be a second place for the same words to drift.
 *
 * `Under Repair` is a distinct state rather than a flavour of `Damaged`,
 * because a repaired device comes back into service and a broken one does not,
 * and a register that collapsed them would hide items that are coming back. It is
 * the same `warning` variant as the `Borrowed` badge — gold ink on an amber fill
 * at 5.65:1 — which is the point: one warning hue, one legibility floor, and the
 * two states are told apart by their **words**, which is the only channel that
 * carries both. A condition this file has not seen falls back to the neutral
 * treatment and the server's own label, so a fifth value degrades rather than
 * disappearing.
 *
 * `Fair` is deliberately neutral, and that is a claim rather than an omission:
 * fair is the ordinary middle of a school's stock, not a warning, and painting
 * it amber would put seven amber badges on a register whose actual warning count
 * is one figure.
 */
export const ConditionBadge: React.FC<{ condition: string }> = ({
  condition,
}) => {
  const treatment = CONDITION_TREATMENTS[condition] ?? {
    variant: "outline" as const,
    className: NEUTRAL_TREATMENT,
  };

  return (
    <Badge variant={treatment.variant} className={treatment.className}>
      {itemConditionLabel(condition)}
    </Badge>
  );
};

/** The five unit-status treatments, keyed by the stored value the column holds. */
const UNIT_STATUS_TREATMENTS: Record<
  string,
  { variant: BadgeVariant; className?: string }
> = {
  available: { variant: "success" },
  borrowed: { variant: "warning" },
  issued: { variant: "outline", className: DESTRUCTIVE_SOFT },
  disposed: { variant: "destructive" },
};

/**
 * One tagged unit's status, from `unitStatusLabel`.
 *
 * `issued` and `disposed` are *both* destructive in substance — from the store's
 * point of view they are the same answer, the school does not have it any more —
 * but they are not the same *kind* of answer, so they are given the two
 * destructive treatments this file has: `disposed` is the strong one, because the
 * unit was written off and there is no path back; `issued` is the soft one, because
 * the device left the school but is on a certificate naming who took it and can
 * be produced. `removed` is deliberately absent from the map and falls through to
 * neutral, because a removed unit was taken off the books as a detail edit rather
 * than written off, and painting it the same red would say the school lost
 * something it did not.
 */
export const UnitStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const treatment = UNIT_STATUS_TREATMENTS[status] ?? {
    variant: "outline" as const,
    className: NEUTRAL_TREATMENT,
  };

  return (
    <Badge variant={treatment.variant} className={treatment.className}>
      {unitStatusLabel(status)}
    </Badge>
  );
};

/** The manager half: who is in charge of the item. Present or absent — never a gap. */
const ManagerChip: React.FC<{ name: string }> = ({ name }) => (
  <Badge
    variant="outline"
    className="border-primary/30 bg-primary/10 text-primary max-w-full"
  >
    <IconUserCheck aria-hidden="true" />
    <span className="truncate">Manager · {name}</span>
  </Badge>
);

/** The custodian half: who is physically holding it. Filled, because it is the fact being tracked. */
const CustodianChip: React.FC<{ name: string }> = ({ name }) => (
  <Badge className="max-w-full">
    <IconPackage aria-hidden="true" />
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
    <IconBuildingWarehouse aria-hidden="true" />
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
 *
 * **Two of these four states are now unreachable, and the branches stay anyway.**
 * `inventory_item.manager_staff_id` and `custodian_staff_id` are both `NOT NULL`, so
 * a row cannot arrive here with one or both of them missing. The gap chips are kept
 * because the two names are typed `string | null` and a badge that has no
 * explanation for the shape its own props allow is the one that would render a
 * blank column; what is *not* kept is the copy that used to point at the register's
 * "Items with no manager" card and its "No manager only" filter, because those
 * controls are gone and a chip that sends a reader after them is a dead end
 * described in three sentences.
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
          detail={`${custodianName} is holding this item, but no teacher has been made accountable for it. Appoint whoever is answerable for it from the item's custody panel — that is a recorded change with a reason, not an edit to the item row.`}
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
      <IconUserX
        aria-hidden="true"
        className="text-muted-foreground size-3.5 shrink-0"
      />
    </span>
  );
};
