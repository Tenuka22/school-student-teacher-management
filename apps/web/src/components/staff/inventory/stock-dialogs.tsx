"use client";

/*
 * This file exports components **and** six pure helpers (`formatDateTime`,
 * `formatDate`, `toQuantity`, `issuesToFieldErrors`, `summariseTags`,
 * `describeParty` / `PartyName`) plus one hook (`useDiscardGuard`), because the
 * six dialog files of this feature all need them and `shared/` — the correct home
 * for all of it — belongs to another agent working in this folder right now.
 *
 * The cost of that is one Fast Refresh boundary: editing a helper in this file
 * degrades dev-time hot reload to a full reload of the module. That is a
 * development-time inconvenience in one file, and it is the smaller half of the
 * alternative, which is five copies of `summariseTags` rendering the same twenty
 * tags three different ways. When the shared layer is next touched, move these
 * seven exports into `shared/` and delete this pragma.
 */
/* oxlint-disable react-doctor/only-export-components -- six pure helpers and one hook shared by this feature's six dialog files; see the note above */

/**
 * The two counter movements, and the asset-tag register they are read back on.
 *
 * Three exports, and the split is by *what the screen is for* rather than by
 * which file the procedure happens to live in:
 *
 * - `StockInDialog` — the only place in the whole inventory where an asset tag
 *   is invented. Everything else acts on a tag that already exists.
 * - `StockOutDialog` — the immediate, unapproved loss: a projector that died and
 *   was not repaired, a laptop nobody can find. It drops `qty` and marks the
 *   units `removed` in one call, which is exactly why it gets an `AlertDialog`.
 * - `AssetRegisterPanel` — every tagged unit the school owns, with the only two
 *   status moves a person is allowed to make by hand.
 *
 * These two dialogs are deliberately **not** the two-stage write-off. Property
 * being destroyed or donated goes through `disposal-dialogs.tsx` and gets a
 * signature; this file is for stock that is simply gone. `stock-out.ts`'s own
 * banner says the two must not be blurred.
 *
 * **"Write off" is therefore not the verb on any control in this file.** It is
 * the name of the *certificate* — the tab in `lifecycle-tabs.tsx`, the request a
 * principal has to sign — and "write off stock" as a header button put a
 * single-call loss and a two-stage signed certificate under one word, with the
 * irreversible one on top and the other one one tab away. So the direct movement
 * is **Remove from stock** everywhere it appears here and in the page header, and
 * the dialog says on its face which of the two routes it is. The two files that
 * meet this one are the tab container and this one, so the naming is consistent
 * across both; the third place the word appears is the certificate itself.
 *
 * ## The four form helpers below are this feature's shared layer
 *
 * `formatDateTime`, `formatDate`, `toQuantity`, `issuesToFieldErrors`,
 * `summariseTags`, `describeParty` / `PartyName` and `useDiscardGuard` were each
 * declared four or five times across the six dialog files, with three different
 * `summariseTags` output formats and four different sentences for "this person is
 * no longer on the staff roll". They are declared **here**, once, and imported by
 * the other five files. That is not the right permanent home — they belong in
 * `shared/`, beside `MoneyField` and `TeacherComboboxField` — but `shared/` is
 * owned by another agent working in the same folder, so this file is the closest
 * thing to a neutral module that all of them can already import without a cycle.
 * When the shared layer is next touched, move these six exports and delete the
 * copies; there is exactly one of each to move.
 */
import {
  ITEM_CONDITIONS,
  UNIT_STATUSES,
  itemConditionLabel,
  itemConditionSchema,
  normalizeInventoryKey,
  unitStatusLabel,
} from "@school-student-teacher-management/db/constants/inventory";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@school-student-teacher-management/ui/components/alert-dialog";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@school-student-teacher-management/ui/components/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import { Input } from "@school-student-teacher-management/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import { Textarea } from "@school-student-teacher-management/ui/components/textarea";
import {
  IconClipboardText,
  IconPackage,
  IconPackageOff,
  IconRestore,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import type { UnitStatus } from "@/components/staff/inventory/inventory-types";
import {
  ConditionBadge,
  InventoryEmptyState,
  InventoryErrorState,
  InventoryInlineNotice,
  InventorySkeleton,
  ItemPickerField,
  UnitPickerField,
  UnitStatusBadge,
  invalidateInventory,
} from "@/components/staff/inventory/shared";
import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

/**
 * Mirrors `stock-in.ts`'s own ceiling. The server refuses a larger delivery, and
 * a number input with no `max` would let a storekeeper paste a spreadsheet
 * export in and only find out on submit.
 */
const MAX_STOCK_IN_QTY = 1000;

/** Mirrors `stock-out.ts`'s `reason` cap, so the character count can be honest. */
const MAX_REASON_LENGTH = 200;

/**
 * `listUnits`' own default page size. Not exported from the procedure file, and
 * read here only so the counters strip can say what it is counting.
 */
const REGISTER_PAGE_SIZE = 200;

/**
 * The stored statuses are `text` under a database CHECK, so the wire type is
 * `string` and every place that needs a real `UnitStatus` has to narrow it.
 * Written as a guard rather than a cast so an unrecognised value degrades to
 * "not a status this screen can act on" instead of being trusted.
 */
const isUnitStatus = (value: string | null): value is UnitStatus =>
  value !== null && (UNIT_STATUSES as readonly string[]).includes(value);

/**
 * Every timestamp in this feature reads the same way, in one format.
 *
 * Declared once for the whole feature rather than five times: `en-GB` with a
 * two-digit day and a 24-hour clock, which is the only convention a Sri Lankan
 * school register uses, and identical in all five files so a movement at 09:05
 * and its certificate at 09:05 cannot be rendered two different ways.
 */
export const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** The date half of `formatDateTime`, for a `date` column that is already `YYYY-MM-DD`. */
export const formatDate = (isoDate: string): string =>
  new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

/** Parse a numeric input without letting `NaN` reach valibot. */
export const toQuantity = (raw: string): number => {
  const parsed = Math.trunc(Number(raw));
  return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * Valibot issues → a `field: message` map, for rendering an error on the input
 * that caused it rather than only in a toast.
 *
 * Keyed as a plain string map so one helper serves every form in the feature
 * without a generic per form. Only the first issue per field is kept: a field
 * that has failed four ways should read as one problem, and the rest are noise.
 */
export const issuesToFieldErrors = (result: {
  issues?: readonly v.BaseIssue<unknown>[];
}): Record<string, string> => {
  const errors: Record<string, string> = {};

  for (const issue of result.issues ?? []) {
    const key = issue.path?.[0]?.key;
    if (typeof key === "string" && !(key in errors)) {
      errors[key] = issue.message;
    }
  }

  return errors;
};

/**
 * Name a handful of tags in a toast or a summary line, without pasting fifty into
 * it. **One format for the whole feature**, which is the point: it used to be
 * declared four times and rendered three different ways (`" and 17 more"` and
 * `" +17 more"` on the same kind of list), so the same twenty tags read as two
 * different lists depending on which tab you were on.
 *
 * This is for *prose* — a toast, a certificate summary. It is never used on a
 * record whose only content is the evidence: the issue certificate, the loan row
 * and the write-off certificate print every tag, because a truncated asset tag
 * list on the one page an auditor opens is a truncated audit trail.
 */
export const summariseTags = (tags: string[]): string => {
  const shown = tags.slice(0, 3).join(", ");
  return tags.length > 3 ? `${shown} and ${tags.length - 3} more` : shown;
};

/** The one sentence this feature uses for "there was a person, and they are gone". */
const PARTY_GONE_LABEL = "No longer on the staff roll";

/**
 * Who a recorded actor was, in words.
 *
 * **Three states, and the middle one is the reason this exists.** Every
 * `*ByStaffId` column in this feature is `onDelete: "set null"` so that deleting
 * a teacher does not delete the record of the write-offs they signed, which
 * means a row can arrive with a name and an id, a name and no id, or **no name
 * and an id**:
 *
 * - a name → the person, named.
 * - no name but an id → *the record is gone and the change was real*. A
 *   departed colleague's hand-over is a fact about the past; rendering it as a
 *   blank cell would make the row look unfilled, and rendering it as "unknown"
 *   would imply the change might not have happened.
 * - no name and no id → *the slot was never filled*. Nothing is missing.
 *
 * Collapsing the last two into one phrase is what produced four different
 * sentences for the same fact across the feature, and it is also what made a
 * withdrawn request look like a signed one. `emptyLabel` is per call site
 * because the empty state means something different on each: no signature
 * recorded, not withdrawn, an account with no staff row at all.
 */
export const describeParty = ({
  name,
  staffId,
  emptyLabel,
  goneLabel = PARTY_GONE_LABEL,
}: {
  name: string | null;
  staffId: string | null;
  emptyLabel: string;
  goneLabel?: string;
}): string => name ?? (staffId ? goneLabel : emptyLabel);

/**
 * `describeParty` as a cell, with the gone case struck through.
 *
 * The strike is the visual half of the distinction and not decoration: a name
 * rendered in the same weight as a live one reads as a current member of staff,
 * and this feature's whole point is that the row outlives the person.
 */
export const PartyName: React.FC<{
  name: string | null;
  staffId: string | null;
  emptyLabel: string;
  goneLabel?: string;
}> = ({ name, staffId, emptyLabel, goneLabel }) => {
  if (name) {
    return <span className="font-medium">{name}</span>;
  }

  if (staffId) {
    return (
      <span className="text-muted-foreground line-through">
        {goneLabel ?? PARTY_GONE_LABEL}
      </span>
    );
  }

  return <span className="text-muted-foreground">{emptyLabel}</span>;
};

/**
 * Ask before throwing away a form somebody has filled in.
 *
 * ## Why this is a `Dialog` and not a `beforeunload`
 *
 * Every way out of a `Dialog` funnels through its `onOpenChange` — Esc, the X,
 * the backdrop, the Cancel button — and the parent owns `open`, so refusing to
 * forward `false` is enough to keep the dialog standing. A native
 * `beforeunload` would only cover the browser tab, which is not where a twenty-row
 * delivery is lost: it is lost to a stray Esc.
 *
 * ## What this deliberately does not do
 *
 * **It is not per-field.** The cheapest honest version is one boolean — "is any
 * field off its default" — and that is what this is. The alternative is a
 * per-field dirty map driving a list of exactly what will be lost ("4 asset tags,
 * the supplier and the invoice number"), which is nicer and costs a dirty-tracking
 * wrapper around every one of twenty-six controls and a list that has to be
 * written and kept true by hand. On a form this size that maintenance is a
 * bigger risk than the confirmation is a nicety, so the confirm says what is at
 * stake in the form's own terms and not in a field count.
 */
export const useDiscardGuard = (
  isDirty: boolean,
  onDiscard: () => void
): { requestClose: () => void; confirmNode: React.ReactNode } => {
  const [isAsking, setIsAsking] = useState(false);

  return {
    requestClose: () => {
      if (isDirty) {
        setIsAsking(true);
        return;
      }
      onDiscard();
    },
    // `isDirty` is re-read here rather than latched, so a form that went clean
    // for any reason while the question was open drops the question instead of
    // leaving a confirm for work that is no longer at stake.
    confirmNode:
      isAsking && isDirty ? (
        <AlertDialog open onOpenChange={(next) => setIsAsking(next)}>
          <AlertDialogContent>
            <AlertDialogTitle>Discard what you have typed?</AlertDialogTitle>
            <AlertDialogDescription>
              Nothing on this form has been saved, and closing it now loses all
              of it &mdash; every field you have filled in, including any asset
              tags you have named. There is no partial save and no draft to come
              back to, so the only way to keep this work is to stay on the form.
            </AlertDialogDescription>
            <div className="flex justify-end gap-2">
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  setIsAsking(false);
                  onDiscard();
                }}
              >
                Discard it
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      ) : null,
  };
};

const stockInSchema = v.object({
  itemId: v.pipe(v.string(), v.minLength(1, "Choose the item being received")),
  qty: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(1, "Enter how many units arrived"),
    v.maxValue(
      MAX_STOCK_IN_QTY,
      `A single delivery is at most ${MAX_STOCK_IN_QTY} units`
    )
  ),
  uniqueIds: v.pipe(
    v.array(v.pipe(v.string(), v.maxLength(64))),
    v.minLength(1, "Enter one asset tag per unit received")
  ),
  supplier: v.optional(v.string()),
  purchaseDate: v.optional(v.string()),
  invoiceNo: v.optional(v.string()),
  condition: v.optional(itemConditionSchema),
  location: v.optional(v.string()),
  note: v.optional(v.string()),
});

const stockOutSchema = v.object({
  itemId: v.pipe(
    v.string(),
    v.minLength(1, "Choose the item to remove from stock")
  ),
  qty: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(1, "Enter how many units are being removed")
  ),
  reason: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(
      1,
      "Say what happened to it — this is the first line of the removal record"
    ),
    v.maxLength(
      MAX_REASON_LENGTH,
      `Keep the reason under ${MAX_REASON_LENGTH} characters`
    )
  ),
  approvedBy: v.optional(v.string()),
  condition: v.optional(itemConditionSchema),
  note: v.optional(v.string()),
  uniqueItemIds: v.optional(v.array(v.string())),
});

/**
 * One tag input.
 *
 * Modelled as a row object rather than a bare string for one reason: React needs
 * a stable key, and the only identity a tag has before it is typed is its
 * position. `rowId` is that identity, generated once when the row appears and
 * carried for the row's life — so raising the quantity, retyping a tag, or
 * shrinking the list back all leave the surviving rows mounted and their contents
 * where the clerk left them. The `value` is the tag itself and is still matched
 * positionally by the server, which pairs the Nth supplied tag with the Nth unit.
 */
interface TagRow {
  rowId: string;
  value: string;
}

const newTagRow = (value = ""): TagRow => ({
  rowId: crypto.randomUUID(),
  value,
});

/**
 * Grow or shrink the tag list to the quantity, keeping whatever is already typed
 * and keeping the surviving rows *mounted* — and **reporting anything it drops**.
 *
 * Shrinking from the end is the only behaviour that cannot silently destroy work
 * in the ordinary case, and raising the quantity never blanks a row. But lowering
 * the quantity *does* discard the rows past the new count, and if the clerk had
 * typed into them that is twenty seconds of reading a supplier's label sheet.
 * So the trimmed rows are returned to the caller rather than dropped inside this
 * function, and the dialog puts them back with one click or says out loud what
 * went. Silently keeping them would be worse than dropping them — the form would
 * submit a different set of tags from the one on screen.
 *
 * Because the retained rows keep their `rowId`, the inputs already filled in are
 * not re-created when the quantity changes, which is what stops a half-typed
 * delivery from losing its place.
 */
const resizeTags = (
  rows: TagRow[],
  qty: number
): { rows: TagRow[]; discarded: string[] } => {
  const size = Math.max(0, Math.min(qty, MAX_STOCK_IN_QTY));
  const kept = rows.slice(0, size);
  const discarded: string[] = [];

  for (const row of rows.slice(size)) {
    if (row.value.trim().length > 0) {
      discarded.push(row.value);
    }
  }

  return {
    rows: [
      ...kept,
      ...Array.from({ length: Math.max(0, size - rows.length) }, () =>
        newTagRow()
      ),
    ],
    discarded,
  };
};

/**
 * A pasted tag list → the rows, and what could not be used.
 *
 * A storekeeper receiving twenty labelled laptops is holding the supplier's tag
 * list — a column out of a spreadsheet, or a note on the delivery docket — and
 * this form used to make them read it across and type twenty values into twenty
 * separate inputs, in order, with no way to paste a single one of them. This is
 * the path that list takes: split on newlines, commas or semicolons, trim, drop
 * the blanks.
 *
 * Anything past the quantity is **reported, not used**. The row count is the
 * quantity by design, so a paste of twenty-four into a quantity of twenty cannot
 * be accepted silently — the extra four are the difference between the delivery
 * that arrived and the delivery being recorded.
 */
const parsePastedTags = (raw: string): string[] =>
  raw
    .split(/[\n,;]+/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

/**
 * Which rows repeat a tag already typed elsewhere in this delivery.
 *
 * `normalizeInventoryKey` is the same trim / whitespace-collapse / lower-case the
 * `inventory_unit_normalized_unique_no_unique` index is written against, so a
 * clerk who types `LT-0042` and `lt-0042` is warned here rather than meeting a
 * unique-index violation after a round trip. **Both** rows are marked: flagging
 * only the second leaves the first looking innocent and the clerk has to guess
 * which one to change.
 *
 * Returns the offending **row ids** rather than indexes, so a warning does not
 * drift onto the wrong input when the quantity changes underneath it.
 */
const duplicateTagRows = (rows: TagRow[]): Set<string> => {
  const firstSeenAt = new Map<string, string>();
  const duplicates = new Set<string>();

  for (const row of rows) {
    const key = normalizeInventoryKey(row.value);
    if (key.length === 0) {
      continue;
    }

    const firstRowId = firstSeenAt.get(key);
    if (firstRowId === undefined) {
      firstSeenAt.set(key, row.rowId);
    } else {
      duplicates.add(firstRowId);
      duplicates.add(row.rowId);
    }
  }

  return duplicates;
};

/**
 * The optional provenance of a delivery, as one state object.
 *
 * Six fields that are typed together, read together, validated together and reset
 * together. Holding them as six independent `useState` calls meant the reset path
 * had to name all six, and the day a seventh was added the reset would have been
 * the first thing to forget it — a dialog that silently kept the last delivery's
 * supplier is a storebook that quietly lies about where its stock came from.
 */
interface DeliveryProvenance {
  supplier: string;
  purchaseDate: string;
  invoiceNo: string;
  condition: string;
  location: string;
  note: string;
}

const EMPTY_PROVENANCE: DeliveryProvenance = {
  supplier: "",
  purchaseDate: "",
  invoiceNo: "",
  condition: "",
  location: "",
  note: "",
};

/** The delivery being described: which line, how many, and the tags that go with it. */
interface StockInIdentity {
  itemId: string | null;
  qtyInput: string;
  tags: TagRow[];
}

const EMPTY_STOCK_IN_IDENTITY: StockInIdentity = {
  itemId: null,
  qtyInput: "1",
  tags: [newTagRow()],
};

/** What the last submit attempt had to say, cleared as one unit. */
interface StockInFeedback {
  errors: Record<string, string>;
  tagsError: string;
}

const EMPTY_STOCK_IN_FEEDBACK: StockInFeedback = { errors: {}, tagsError: "" };

const StockInProvenanceFields: React.FC<{
  provenance: DeliveryProvenance;
  onChange: <K extends keyof DeliveryProvenance>(
    key: K,
    value: DeliveryProvenance[K]
  ) => void;
  conditionError: string | undefined;
  disabled: boolean;
}> = ({ provenance, onChange, conditionError, disabled }) => (
  <>
    <div className="grid gap-4 md:grid-cols-3">
      <Field>
        <FieldLabel htmlFor="stock-in-supplier">Supplier</FieldLabel>
        <Input
          id="stock-in-supplier"
          value={provenance.supplier}
          onChange={(event) => onChange("supplier", event.target.value)}
          disabled={disabled}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="stock-in-purchase-date">Purchase date</FieldLabel>
        <Input
          id="stock-in-purchase-date"
          type="date"
          value={provenance.purchaseDate}
          onChange={(event) => onChange("purchaseDate", event.target.value)}
          disabled={disabled}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="stock-in-invoice">Invoice number</FieldLabel>
        <Input
          id="stock-in-invoice"
          value={provenance.invoiceNo}
          onChange={(event) => onChange("invoiceNo", event.target.value)}
          disabled={disabled}
        />
      </Field>
    </div>

    <Field data-invalid={conditionError ? true : undefined}>
      <FieldLabel htmlFor="stock-in-condition">Condition override</FieldLabel>
      <Select
        value={provenance.condition === "" ? null : provenance.condition}
        onValueChange={(value: string | null) => {
          onChange("condition", value ?? "");
        }}
      >
        <SelectTrigger
          id="stock-in-condition"
          disabled={disabled}
          aria-invalid={conditionError ? true : undefined}
        >
          <SelectValue placeholder="Keep the item's recorded condition" />
        </SelectTrigger>
        <SelectContent>
          {ITEM_CONDITIONS.map((option) => (
            <SelectItem key={option} value={option}>
              {itemConditionLabel(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>
        Set only when this delivery differs from the condition already on the
        item. Receiving forty chairs when ten are cracked is two deliveries, not
        one with a lie in it.
      </FieldDescription>
      {conditionError ? <FieldError>{conditionError}</FieldError> : null}
    </Field>

    <Field>
      <FieldLabel htmlFor="stock-in-location">Location</FieldLabel>
      <Input
        id="stock-in-location"
        value={provenance.location}
        onChange={(event) => onChange("location", event.target.value)}
        placeholder="e.g. Science store, shelf B"
        disabled={disabled}
      />
      <FieldDescription>
        Applies to the item and is inherited by every tag created here.
      </FieldDescription>
    </Field>

    <Field>
      <FieldLabel htmlFor="stock-in-note">Note</FieldLabel>
      <Textarea
        id="stock-in-note"
        value={provenance.note}
        onChange={(event) => onChange("note", event.target.value)}
        rows={2}
        disabled={disabled}
      />
    </Field>
  </>
);

/**
 * The tag list, one input per unit received, **and a way to paste twenty of them
 * at once**.
 *
 * Split out of the dialog because it is the only part of the form with a
 * constraint of its own — **the row count is the quantity**, and the two ways that
 * can be wrong (a short list, the same tag twice) are both caught here before
 * anything is submitted. Keeping it in its own component means that rule has one
 * place to live and one place to be read.
 *
 * The paste box is not decoration. The individual inputs were made robust — a
 * stable `rowId` per row, both sides of a duplicate flagged — and the whole cost
 * of a delivery of twenty labelled laptops was still twenty separate keystroke
 * sequences typed in order, while the supplier's tag list the clerk is holding
 * could not go in any of them. `onPasteTags` is that path: it fills the rows from
 * a newline- or comma-separated paste, keeps the row identities, and returns the
 * overflow so the dialog can say what it did not use.
 */
const AssetTagFields: React.FC<{
  rows: TagRow[];
  duplicateRowIds: Set<string>;
  filledCount: number;
  tagsError: string;
  uniqueIdsError: string | undefined;
  discarded: string[];
  onValueChange: (rowId: string, value: string) => void;
  onPasteTags: (tags: string[], overflow: string[]) => void;
  onRestoreDiscarded: () => void;
  onClearDiscarded: () => void;
  disabled: boolean;
}> = ({
  rows,
  duplicateRowIds,
  filledCount,
  tagsError,
  uniqueIdsError,
  discarded,
  onValueChange,
  onPasteTags,
  onRestoreDiscarded,
  onClearDiscarded,
  disabled,
}) => {
  const [pasteBuffer, setPasteBuffer] = useState("");

  const applyPaste = () => {
    const parsed = parsePastedTags(pasteBuffer);
    if (parsed.length === 0) {
      return;
    }
    onPasteTags(parsed.slice(0, rows.length), parsed.slice(rows.length));
    setPasteBuffer("");
  };

  return (
    <Field data-invalid={tagsError || uniqueIdsError ? true : undefined}>
      <FieldLabel htmlFor="stock-in-tag-0">Asset tags *</FieldLabel>
      <FieldDescription>
        The server requires exactly one tag per unit received, and a tag already
        on file anywhere in the store is refused — so the rows below are locked
        to the quantity. {filledCount} of {rows.length} entered.
      </FieldDescription>

      {/**
       * The paste path, above the rows it fills.
       *
       * Placed above rather than below because it is the *faster* route and a
       * clerk with a tag list should meet it before twenty inputs. It is a
       * `Collapsible` for the same reason the rest of this feature's optional
       * detail is: it is a real button, in the tab order, and its content is
       * readable without a pointer.
       */}
      <Collapsible>
        <CollapsibleTrigger
          render={<Button type="button" variant="outline" size="sm" />}
          className="w-fit"
          disabled={disabled}
        >
          <IconClipboardText data-icon="inline-start" />
          Paste tags instead
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-2 pt-2">
            <FieldLabel htmlFor="stock-in-paste-tags">
              Paste the supplier&rsquo;s tag list
            </FieldLabel>
            <Textarea
              id="stock-in-paste-tags"
              value={pasteBuffer}
              onChange={(event) => {
                setPasteBuffer(event.target.value);
              }}
              rows={4}
              placeholder={"LT-0041\nLT-0042\nLT-0043"}
              className="font-mono"
              disabled={disabled}
            />
            <FieldDescription>
              One tag per line, or separated by commas or semicolons. Blank
              lines are ignored and the order is kept, because the server pairs
              the Nth tag with the Nth unit. This fills the {rows.length} row
              {rows.length === 1 ? "" : "s"} above; raise the quantity first if
              the delivery is larger.
            </FieldDescription>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={applyPaste}
              disabled={disabled || pasteBuffer.trim().length === 0}
            >
              Fill the rows
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="space-y-2">
        {rows.map((row, index) => {
          const inputId = `stock-in-tag-${index}`;
          const isDuplicate = duplicateRowIds.has(row.rowId);
          return (
            // Keyed on `rowId`, not the position: the row's identity is minted when
            // the row appears and carried for its life, so changing the quantity
            // re-uses the inputs already filled in instead of re-creating them and
            // moving the clerk's cursor. The *label* is still the position, because
            // the server pairs the Nth supplied tag with the Nth unit.
            <div key={row.rowId} className="flex items-center gap-2">
              <FieldLabel
                htmlFor={inputId}
                className="text-muted-foreground w-20 shrink-0 text-xs"
              >
                Unit {index + 1}
              </FieldLabel>
              <Input
                id={inputId}
                value={row.value}
                onChange={(event) =>
                  onValueChange(row.rowId, event.target.value)
                }
                placeholder="e.g. LT-0042"
                className="font-mono"
                disabled={disabled}
                aria-invalid={isDuplicate || undefined}
              />
              {isDuplicate ? (
                <Badge variant="destructive">Duplicate</Badge>
              ) : null}
            </div>
          );
        })}
      </div>

      {/**
       * What lowering the quantity threw away, said out loud.
       *
       * The old `resizeTags` dropped every row past the new count inside the
       * function that did it, so a clerk who typed `LT-0041`…`LT-0044`, caught
       * themselves and typed `3` in the quantity box lost `LT-0044` with no word
       * and no way back. The rows are held here instead, with both ways out: put
       * them back (which raises the quantity to hold them) or accept the loss.
       */}
      {discarded.length > 0 ? (
        <InventoryInlineNotice
          tone="warning"
          title={`${discarded.length} tag${discarded.length === 1 ? "" : "s"} no longer fit the quantity`}
          description={`Lowering the quantity removed ${discarded
            .map((tag) => tag)
            .join(
              ", "
            )} from the list. They are held here rather than deleted — put them back to raise the quantity to ${rows.length + discarded.length}, or clear this to accept the smaller delivery.`}
        />
      ) : null}

      {discarded.length > 0 ? (
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRestoreDiscarded}
            disabled={disabled}
            data-icon="inline-start"
          >
            <IconRestore data-icon="inline-start" />
            Put them back
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onClearDiscarded}
            disabled={disabled}
          >
            Accept the smaller quantity
          </Button>
        </div>
      ) : null}

      {tagsError ? <FieldError>{tagsError}</FieldError> : null}
      {uniqueIdsError ? <FieldError>{uniqueIdsError}</FieldError> : null}
    </Field>
  );
};

/**
 * The first three controls of the receiving form: what this delivery is.
 *
 * Split out of the dialog for the same reason the rest of this file is split up —
 * the form is longer than one component should be, and this block is a coherent
 * unit: the notice that says what receiving is, the item it is added to, and the
 * quantity that sizes everything below it. It is where a clerk's first three
 * decisions happen, and it reads as one thing.
 */
const StockInDeliveryFields: React.FC<{
  itemId: string | null;
  onItemChange: (itemId: string | null) => void;
  qtyInput: string;
  onQtyChange: (value: string) => void;
  errors: Record<string, string>;
  disabled: boolean;
}> = ({ itemId, onItemChange, qtyInput, onQtyChange, errors, disabled }) => (
  <>
    <InventoryInlineNotice
      tone="info"
      title="Receiving adds to a line that already exists"
      description="A new kind of equipment is registered on the Register tab, not here — this form only adds units to a line that is already on file. A mixed delivery (some sound, some cracked) is two deliveries, because the item carries a single condition."
    />

    <ItemPickerField
      value={itemId}
      onChange={onItemChange}
      label="Item *"
      description="Search by name, SKU or category. Items with nothing available are still listed — you are adding to them, not taking from them."
      error={errors.itemId}
      disabled={disabled}
    />

    <Field data-invalid={errors.qty ? true : undefined}>
      <FieldLabel htmlFor="stock-in-qty">Quantity received *</FieldLabel>
      <Input
        id="stock-in-qty"
        type="number"
        inputMode="numeric"
        min={1}
        max={MAX_STOCK_IN_QTY}
        value={qtyInput}
        onChange={(event) => onQtyChange(event.target.value)}
        disabled={disabled}
      />
      <FieldDescription>
        One asset tag is created per unit, so this number sets the number of tag
        fields below.
      </FieldDescription>
      {errors.qty ? <FieldError>{errors.qty}</FieldError> : null}
    </Field>
  </>
);

/**
 * The whole of the receiving form's validation, as one pure function.
 *
 * Extracted from the dialog body rather than left inline because it is the rule,
 * not the mechanism: three checks in a fixed order, each of which either stops
 * the submit or hands back the exact payload `stockIn` wants. A dialog component
 * that also owns the rules is a component nobody can read the rules out of, and
 * the two tag checks in particular are the ones worth being able to see whole.
 *
 * The third check is the one the object schema cannot express, and it is the one
 * that has to run here rather than at the server: **blanks are filtered exactly
 * the way `resolveRequestedTags` filters them**, so the number compared is the
 * number the server will count. The mismatch the server exists to catch is a
 * claimed count that differs from the tag count, and a client that counted
 * differently would either block a valid delivery or wave a broken one through.
 */
/**
 * The payload `stockIn` is given, typed as the schema's own output.
 *
 * Read off `stockInSchema` rather than written out, so adding a field to the
 * schema makes this a compile error at the *check* rather than a silent omission
 * at the mutation — which is the failure this extraction could otherwise have
 * introduced.
 */
type StockInPayload = v.InferOutput<typeof stockInSchema>;

type StockInCheck =
  | { ok: true; input: StockInPayload }
  | { ok: false; errors: Record<string, string>; tagsError: string };

const checkStockIn = (state: {
  itemId: string | null;
  qty: number;
  tags: TagRow[];
  duplicateRowIds: Set<string>;
  provenance: DeliveryProvenance;
}): StockInCheck => {
  const result = v.safeParse(stockInSchema, {
    itemId: state.itemId ?? "",
    qty: state.qty,
    uniqueIds: state.tags.map((row) => row.value),
    supplier: state.provenance.supplier.trim() || undefined,
    purchaseDate: state.provenance.purchaseDate.trim() || undefined,
    invoiceNo: state.provenance.invoiceNo.trim() || undefined,
    condition:
      state.provenance.condition === ""
        ? undefined
        : state.provenance.condition,
    location: state.provenance.location.trim() || undefined,
    note: state.provenance.note.trim() || undefined,
  });

  if (!result.success) {
    return { ok: false, errors: issuesToFieldErrors(result), tagsError: "" };
  }

  const entered = result.output.uniqueIds.filter(
    (tag) => normalizeInventoryKey(tag).length > 0
  );

  if (entered.length !== result.output.qty) {
    return {
      ok: false,
      errors: {},
      tagsError: `Supply exactly ${result.output.qty} asset tag(s) for the ${result.output.qty} unit(s) being received — ${entered.length} entered so far`,
    };
  }

  if (state.duplicateRowIds.size > 0) {
    return {
      ok: false,
      errors: {},
      tagsError: "The same asset tag is entered more than once",
    };
  }

  return {
    ok: true,
    input: {
      itemId: result.output.itemId,
      qty: result.output.qty,
      uniqueIds: entered,
      ...(result.output.supplier ? { supplier: result.output.supplier } : {}),
      ...(result.output.purchaseDate
        ? { purchaseDate: result.output.purchaseDate }
        : {}),
      ...(result.output.invoiceNo
        ? { invoiceNo: result.output.invoiceNo }
        : {}),
      ...(result.output.condition
        ? { condition: result.output.condition }
        : {}),
      ...(result.output.location ? { location: result.output.location } : {}),
      ...(result.output.note ? { note: result.output.note } : {}),
    },
  };
};

/**
 * Receive stock: create asset tags and add the quantity in one transaction.
 *
 * The tag list is the interesting part. `stockIn` is the only procedure that
 * mints a tag and it refuses anything but exactly `qty` non-blank, unique tags —
 * a delivery of five whose sixth field holds three spaces has five tags, not six,
 * and receiving five while claiming six is the whole disagreement this dialog
 * exists to prevent. So `AssetTagFields`' row count is *locked to the quantity*
 * rather than merely validated against it.
 */
export const StockInDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const queryClient = useQueryClient();

  /**
   * Three state objects rather than six independent values, and the grouping is
   * by *when they change together*.
   *
   * `what` is the delivery being described — the item, how many, and the tags that
   * go with them — and the three are genuinely one fact: changing the quantity
   * resizes the tag list, so a component holding them apart is holding apart
   * something that cannot disagree. `provenance` is the paperwork. `feedback` is
   * what the last submit attempt had to say, and it is cleared as a unit because
   * a stale error on one field next to a cleared one on the next is the worst
   * possible thing to show somebody who is retyping.
   */
  const [what, setWhat] = useState<StockInIdentity>(EMPTY_STOCK_IN_IDENTITY);
  const [provenance, setProvenance] =
    useState<DeliveryProvenance>(EMPTY_PROVENANCE);
  const [feedback, setFeedback] = useState<StockInFeedback>(
    EMPTY_STOCK_IN_FEEDBACK
  );
  /**
   * Rows the clerk has filled in that no longer fit the quantity, held so they can
   * be put back. See `resizeTags`.
   */
  const [discarded, setDiscarded] = useState<string[]>([]);

  const { itemId, qtyInput, tags } = what;
  const { errors, tagsError } = feedback;

  const qty = toQuantity(qtyInput);
  const duplicateRowIds = useMemo(() => duplicateTagRows(tags), [tags]);
  const filledTags = useMemo(
    () => tags.filter((row) => row.value.trim().length > 0).length,
    [tags]
  );

  const reset = () => {
    setWhat(EMPTY_STOCK_IN_IDENTITY);
    setProvenance(EMPTY_PROVENANCE);
    setFeedback(EMPTY_STOCK_IN_FEEDBACK);
    setDiscarded([]);
  };

  /**
   * "Any field is off its default" — the whole of the dirty check.
   *
   * Deliberately excludes `feedback`: a validation message is the form talking to
   * itself, not the clerk's work, and a form that has only been *rejected* has
   * nothing to lose.
   */
  const isDirty =
    itemId !== null ||
    qtyInput !== EMPTY_STOCK_IN_IDENTITY.qtyInput ||
    tags.some((row) => row.value.trim().length > 0) ||
    discarded.length > 0 ||
    Object.entries(provenance).some(
      ([key, value]) =>
        value !== EMPTY_PROVENANCE[key as keyof DeliveryProvenance]
    );

  const { requestClose, confirmNode } = useDiscardGuard(isDirty, () => {
    reset();
    onOpenChange(false);
  });

  const stockInMutation = useMutation(
    orpc.inventory.items.stockIn.mutationOptions({
      onSuccess: async (result) => {
        toast.success(
          `Received ${result.added} unit(s) — tags created: ${summariseTags(
            result.units.map((unit) => unit.uniqueNo)
          )}`
        );
        reset();
        onOpenChange(false);
        /**
         * `stock` and not `item`: nothing about the item line was edited here, a
         * delivery creates units rather than a new kind of thing, and no write-off
         * certificate exists to re-read. The scope carries `auditLogs` because
         * `stockIn` writes an `inventory_audit_log` row, and the Change log's own
         * header promises that every movement appears in it.
         */
        await invalidateInventory(queryClient, "stock");
      },
      onError: (error) => {
        toast.error(
          formatApiErrorMessage(error, "Could not receive this delivery")
        );
      },
    })
  );

  const handleQtyChange = (raw: string) => {
    setWhat((previous) => {
      // The two move together, always: the tag list's length *is* the quantity.
      const resized = resizeTags(previous.tags, toQuantity(raw));
      if (resized.discarded.length > 0) {
        setDiscarded((held) => [...held, ...resized.discarded]);
      }
      return { ...previous, qtyInput: raw, tags: resized.rows };
    });
  };

  /**
   * Fill the rows from a pasted list, and say what did not fit.
   *
   * The row identities are **kept** rather than replaced, so an input the clerk
   * has already focused does not remount under them mid-paste. Anything the
   * existing rows cannot hold becomes a *new* row rather than being dropped:
   * `AssetTagFields` already caps the paste at the row count and reports the
   * overflow, and this is the belt to that braces — a tag the clerk pasted and
   * this handler silently swallowed would be the exact quiet data loss the paste
   * path was added to prevent.
   */
  const handlePastedTags = (pasted: string[], overflow: string[]) => {
    setWhat((previous) => {
      const rows = previous.tags.map((row, index) => ({
        rowId: row.rowId,
        value: pasted[index] ?? row.value,
      }));

      for (let index = rows.length; index < pasted.length; index += 1) {
        rows.push(newTagRow(pasted[index]));
      }

      return { ...previous, tags: rows };
    });

    if (overflow.length > 0) {
      setFeedback({
        errors: {},
        tagsError: `${overflow.length} tag(s) in the paste did not fit the quantity of ${qty} and were not used: ${summariseTags(overflow)}. Raise the quantity to accept them.`,
      });
      return;
    }
    setFeedback(EMPTY_STOCK_IN_FEEDBACK);
  };

  /** Put the held tags back, by raising the quantity to hold them. */
  const handleRestoreDiscarded = () => {
    const restored = String(qty + discarded.length);
    setWhat((previous) => ({
      ...previous,
      qtyInput: restored,
      tags: resizeTags(
        [...previous.tags, ...discarded.map((tag) => newTagRow(tag))],
        toQuantity(restored)
      ).rows,
    }));
    setDiscarded([]);
  };

  const setProvenanceField = <K extends keyof DeliveryProvenance>(
    key: K,
    value: DeliveryProvenance[K]
  ) => {
    setProvenance((previous) => ({ ...previous, [key]: value }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setFeedback(EMPTY_STOCK_IN_FEEDBACK);

    const checked = checkStockIn({
      itemId,
      qty,
      tags,
      duplicateRowIds,
      provenance,
    });

    if (!checked.ok) {
      setFeedback({ errors: checked.errors, tagsError: checked.tagsError });
      return;
    }

    stockInMutation.mutate(checked.input);
  };

  const { isPending } = stockInMutation;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          // A close attempt on a filled-in form is a question, not a command.
          // `isPending` still wins: a submit in flight must be able to finish and
          // close itself, or the toast would arrive on a dialog that had already
          // been reset underneath it.
          if (next || isPending) {
            onOpenChange(next);
            return;
          }
          requestClose();
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle>Receive stock</DialogTitle>
            <DialogDescription>
              Add delivered units to an existing item and create their asset
              tags
            </DialogDescription>
          </DialogHeader>

          <form
            id="stock-in-form"
            onSubmit={handleSubmit}
            className="flex-1 space-y-6 overflow-y-auto px-6 py-4"
          >
            <FieldGroup>
              <StockInDeliveryFields
                itemId={itemId}
                onItemChange={(nextItemId) => {
                  setWhat((previous) => ({
                    ...previous,
                    itemId: nextItemId,
                  }));
                }}
                qtyInput={qtyInput}
                onQtyChange={handleQtyChange}
                errors={errors}
                disabled={isPending}
              />

              <AssetTagFields
                rows={tags}
                duplicateRowIds={duplicateRowIds}
                filledCount={filledTags}
                tagsError={tagsError}
                uniqueIdsError={errors.uniqueIds}
                discarded={discarded}
                onValueChange={(rowId, value) => {
                  setWhat((previous) => ({
                    ...previous,
                    tags: previous.tags.map((row) =>
                      row.rowId === rowId ? { ...row, value } : row
                    ),
                  }));
                }}
                onPasteTags={handlePastedTags}
                onRestoreDiscarded={handleRestoreDiscarded}
                onClearDiscarded={() => {
                  setDiscarded([]);
                }}
                disabled={isPending}
              />

              <StockInProvenanceFields
                provenance={provenance}
                onChange={setProvenanceField}
                conditionError={errors.condition}
                disabled={isPending}
              />
            </FieldGroup>
          </form>

          <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={requestClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" form="stock-in-form" disabled={isPending}>
              {isPending ? "Receiving..." : "Receive stock"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {confirmNode}
    </>
  );
};

/**
 * The written record of a write-off: why, who agreed, what condition, and any
 * free-text note.
 *
 * Split out of the dialog because it is the part of the form that is *evidence*
 * rather than mechanics, and because one field in it carries a rule the rest of
 * the codebase depends on: the condition override must never be derived from the
 * reason text. Keeping the pair together here makes that rule visible in one
 * place instead of spread across a component body.
 */
const StockOutRecordFields: React.FC<{
  reason: string;
  onReasonChange: (value: string) => void;
  approvedBy: string;
  onApprovedByChange: (value: string) => void;
  condition: string;
  onConditionChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  errors: Record<string, string>;
  disabled: boolean;
}> = ({
  reason,
  onReasonChange,
  approvedBy,
  onApprovedByChange,
  condition,
  onConditionChange,
  note,
  onNoteChange,
  errors,
  disabled,
}) => (
  <>
    <Field data-invalid={errors.reason ? true : undefined}>
      <FieldLabel htmlFor="stock-out-reason">Reason *</FieldLabel>
      <Textarea
        id="stock-out-reason"
        value={reason}
        onChange={(event) => onReasonChange(event.target.value)}
        rows={3}
        maxLength={MAX_REASON_LENGTH}
        placeholder="e.g. Projector bulb failed during the Grade 11 practical on 14 March; chassis cracked and it was not repairable"
        disabled={disabled}
      />
      <FieldDescription>
        This is the first thing an auditor reads on a write-off, so write it in
        full sentences &mdash; the difference between &ldquo;damaged&rdquo; and
        this is the difference between a storebook that explains itself and one
        that cannot. {reason.length}/{MAX_REASON_LENGTH}.
      </FieldDescription>
      {errors.reason ? <FieldError>{errors.reason}</FieldError> : null}
    </Field>

    {/**
     * **Not "Approved by".** The consequence is in the label, not only in the hint
     * below it, because the label is what survives: a certificate opened in a
     * year shows the string that was typed, and a field headed *Approved by* on a
     * form that approves nothing will be read as an approval by whoever reads it
     * next. A clerk who types a name here is recording who agreed to this in
     * conversation; nothing checks it, nothing is refused without it, and the
     * hint says so as well — but the name of the field no longer claims a gate
     * that does not exist.
     */}
    <Field>
      <FieldLabel htmlFor="stock-out-authorised-by">
        Authorised by (recorded, not enforced)
      </FieldLabel>
      <Input
        id="stock-out-authorised-by"
        value={approvedBy}
        onChange={(event) => onApprovedByChange(event.target.value)}
        placeholder="Name of the person who agreed to this"
        disabled={disabled}
      />
      <FieldDescription>
        Written onto the ledger row beside your own name. Nobody is stopped by
        this field and nothing is checked against it — it is a record of who
        agreed, not an approval.
      </FieldDescription>
    </Field>

    {/**
     * The condition override, and the one thing this form must never do.
     *
     * `stockOut` deliberately refuses to infer `condition: "Damaged"` from a
     * reason mentioning breakage, and its own comment says why: a guess written
     * into the condition ledger is worse than no guess, because the ledger looks
     * authoritative. **The UI must not out-guess the server either.** So there is
     * no keyword match on the reason text, no &ldquo;you said broken, so I set
     * Damaged&rdquo;, and no coupling between the two fields at all &mdash; the
     * override moves only when a person moves it, while they are holding the
     * device.
     */}
    <Field data-invalid={errors.condition ? true : undefined}>
      <FieldLabel htmlFor="stock-out-condition">Condition override</FieldLabel>
      <Select
        value={condition === "" ? null : condition}
        onValueChange={(value: string | null) => {
          onConditionChange(value ?? "");
        }}
      >
        <SelectTrigger
          id="stock-out-condition"
          disabled={disabled}
          aria-invalid={errors.condition ? true : undefined}
        >
          <SelectValue placeholder="Leave the recorded condition alone" />
        </SelectTrigger>
        <SelectContent>
          {ITEM_CONDITIONS.map((option) => (
            <SelectItem key={option} value={option}>
              {itemConditionLabel(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>
        Deliberately not connected to the reason above. Set this only if you are
        holding the device and assessing it now; leave it alone and the unit
        keeps whatever condition it was last assessed at, which is the true
        state of knowledge.
      </FieldDescription>
      {errors.condition ? <FieldError>{errors.condition}</FieldError> : null}
    </Field>

    <Field>
      <FieldLabel htmlFor="stock-out-note">Note</FieldLabel>
      <Textarea
        id="stock-out-note"
        value={note}
        onChange={(event) => onNoteChange(event.target.value)}
        rows={2}
        disabled={disabled}
      />
    </Field>
  </>
);

/**
 * The removal form's first half: which route this is, what, how many, and which
 * tags.
 *
 * Both notices live here rather than in the dialog body because **position is the
 * argument**: the consequence used to sit at the *bottom* of a long form,
 * immediately above the destructive submit, which is exactly where a clerk who has
 * scrolled to the end is not reading. Above the item picker, it is read while
 * there is still a decision to make.
 */
const StockOutIdentityFields: React.FC<{
  itemId: string | null;
  onItemChange: (itemId: string | null) => void;
  qtyInput: string;
  onQtyChange: (value: string) => void;
  unitTags: string[];
  onUnitTagsChange: (tags: string[]) => void;
  errors: Record<string, string>;
  disabled: boolean;
}> = ({
  itemId,
  onItemChange,
  qtyInput,
  onQtyChange,
  unitTags,
  onUnitTagsChange,
  errors,
  disabled,
}) => (
  <>
    <InventoryInlineNotice
      tone="warning"
      title="Nothing on this screen is signed for"
      description="This route takes the stock off the books in one step and there is no approval behind it. To write off property that is being destroyed, recycled, auctioned or donated, raise a request on the Write-offs tab instead — that one waits for a second signature before any stock moves."
    />

    <InventoryInlineNotice
      tone="warning"
      title="This cannot be undone from here"
      description="The quantity drops, the tags are marked removed, and a movement is written to the ledger. If a device turns up in a cupboard next term, the Asset register tab can restore an individual tag and the register's counters will follow — but the removal itself stays on the record."
    />

    <ItemPickerField
      value={itemId}
      onChange={onItemChange}
      label="Item *"
      description="Only items with units on the shelf are offered."
      error={errors.itemId}
      disabled={disabled}
      onlyAvailable
    />

    <Field data-invalid={errors.qty ? true : undefined}>
      <FieldLabel htmlFor="stock-out-qty">Quantity being removed *</FieldLabel>
      <Input
        id="stock-out-qty"
        type="number"
        inputMode="numeric"
        min={1}
        value={qtyInput}
        onChange={(event) => onQtyChange(event.target.value)}
        disabled={disabled}
      />
      <FieldDescription>
        The school stops holding these units. Anything currently out on loan is
        excluded and cannot be removed from here.
      </FieldDescription>
      {errors.qty ? <FieldError>{errors.qty}</FieldError> : null}
    </Field>

    <UnitPickerField
      itemId={itemId}
      value={unitTags}
      onChange={onUnitTagsChange}
      qty={toQuantity(qtyInput)}
      label="Which units"
      error={errors.uniqueItemIds}
      description="Leave empty and the oldest available units are taken, which is the order the store counts on. Name the tags when the devices are in front of you — but name as many as the quantity, or leave the field empty: a part-named list is refused rather than half-applied."
      disabled={disabled}
    />
  </>
);

/**
 * Take stock off the register in one call: it is gone and nobody is bringing it
 * back.
 *
 * **This is not the write-off, and it is not called one.** The Write-offs tab
 * raises a request that a second person has to sign, and only finalising that
 * request moves the stock. This is the other route: the device is lost, stolen or
 * dead, nobody received it, and the register should stop claiming it today. The
 * dialog is therefore titled **Remove stock from the register** and its button
 * says **Remove from stock**, because the header button that opens it used to say
 * "Write off stock" as well — two controls, two completely different amounts of
 * ceremony, one word — and the irreversible one was the primary button.
 *
 * Irreversible, so the consequence is stated in plain words above the form *and*
 * the commit itself goes through an `AlertDialog`.
 */
export const StockOutDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const queryClient = useQueryClient();

  const [itemId, setItemId] = useState<string | null>(null);
  const [qtyInput, setQtyInput] = useState("1");
  const [unitTags, setUnitTags] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  const [condition, setCondition] = useState<string>("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const qty = toQuantity(qtyInput);

  const reset = () => {
    setItemId(null);
    setQtyInput("1");
    setUnitTags([]);
    setReason("");
    setApprovedBy("");
    setCondition("");
    setNote("");
    setErrors({});
    setConfirmOpen(false);
  };

  const isDirty =
    itemId !== null ||
    qtyInput !== "1" ||
    unitTags.length > 0 ||
    reason.trim().length > 0 ||
    approvedBy.trim().length > 0 ||
    condition !== "" ||
    note.trim().length > 0;

  const { requestClose, confirmNode } = useDiscardGuard(isDirty, () => {
    reset();
    onOpenChange(false);
  });

  const stockOutMutation = useMutation(
    orpc.inventory.items.stockOut.mutationOptions({
      onSuccess: async (result) => {
        /*
         * `units` is `null` for a counted line, and that is the only reason this
         * toast is a branch rather than a template. `stockOut` returns `null` — not
         * `[]` — when the item is counted in bulk and had no tagged devices to
         * claim, because an empty list here would render as "Removed 3 unit(s)
         * from stock — " with nothing after the dash: a sentence about a tag list
         * that was never written down. The counted case gets its own clause, which
         * is also the honest description of what happened.
         */
        const { removed, units } = result;
        toast.success(
          units
            ? `Removed ${removed} unit(s) from stock — ${summariseTags(
                units.map((unit) => unit.uniqueNo)
              )}`
            : `Removed ${removed} unit(s) from stock — this line is counted in bulk, so no asset tags were attached`
        );
        reset();
        onOpenChange(false);
        /**
         * `stock`, for the same reason as `stockIn` and against the same
         * omission: the counters and the new tags moved, and the row this wrote to
         * the change log has to appear there.
         */
        await invalidateInventory(queryClient, "stock");
      },
      onError: (error) => {
        toast.error(
          formatApiErrorMessage(error, "Could not remove this stock")
        );
      },
    })
  );

  /** One parse, used by both the submit gate and the confirmed commit. */
  const parseForm = () =>
    v.safeParse(stockOutSchema, {
      itemId: itemId ?? "",
      qty,
      reason,
      approvedBy: approvedBy.trim() || undefined,
      condition: condition === "" ? undefined : condition,
      note: note.trim() || undefined,
      uniqueItemIds: unitTags.length > 0 ? unitTags : undefined,
    });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = parseForm();
    setErrors(result.success ? {} : issuesToFieldErrors(result));
    if (!result.success) {
      return;
    }

    /**
     * **A partial tag list is refused here, and it has to be.**
     *
     * `UnitPickerField` invites "1 of 3 selected — 2 still to choose" and does not
     * block on it, so the form reaches the server with one tag named and a
     * quantity of three. `getAvailableUnits` then throws `CONFLICT` — *"Only 1
     * unit(s) are available"* — which is a **false** sentence: the item has three,
     * the clerk named one. The false part is the damaging part, because a storebook
     * that says a projector is unavailable when two are on the shelf is a
     * storebook nobody trusts.
     *
     * Naming tags is optional, so the message offers the two honest ways out
     * rather than only refusing: name exactly as many as the quantity, or clear
     * the field and let the server take the oldest N.
     */
    if (unitTags.length > 0 && unitTags.length !== qty) {
      setErrors({
        uniqueItemIds: `You named ${unitTags.length} tag${
          unitTags.length === 1 ? "" : "s"
        } but the quantity is ${qty}. Name ${qty} tag${
          qty === 1 ? "" : "s"
        }, or clear this field and the oldest ${qty} will be taken for you.`,
      });
      return;
    }

    // Confirm second. An `AlertDialog` that opens for a form that could not have
    // been submitted is a dialog about nothing.
    setConfirmOpen(true);
  };

  const commit = () => {
    const result = parseForm();
    if (!result.success) {
      return;
    }

    stockOutMutation.mutate({
      itemId: result.output.itemId,
      qty: result.output.qty,
      reason: result.output.reason,
      ...(result.output.uniqueItemIds
        ? { uniqueItemIds: result.output.uniqueItemIds }
        : {}),
      ...(result.output.approvedBy
        ? { approvedBy: result.output.approvedBy }
        : {}),
      ...(result.output.condition
        ? { condition: result.output.condition }
        : {}),
      ...(result.output.note ? { note: result.output.note } : {}),
    });
  };

  const { isPending } = stockOutMutation;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next || isPending) {
            onOpenChange(next);
            return;
          }
          requestClose();
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle>Remove stock from the register</DialogTitle>
            <DialogDescription>
              Take units the school no longer holds off the books in one step —
              lost, stolen or beyond repair. This is <em>not</em> a write-off
            </DialogDescription>
          </DialogHeader>

          <form
            id="stock-out-form"
            onSubmit={handleSubmit}
            className="flex-1 space-y-6 overflow-y-auto px-6 py-4"
          >
            <FieldGroup>
              <StockOutIdentityFields
                itemId={itemId}
                onItemChange={setItemId}
                qtyInput={qtyInput}
                onQtyChange={setQtyInput}
                unitTags={unitTags}
                onUnitTagsChange={setUnitTags}
                errors={errors}
                disabled={isPending}
              />

              <StockOutRecordFields
                reason={reason}
                onReasonChange={setReason}
                approvedBy={approvedBy}
                onApprovedByChange={setApprovedBy}
                condition={condition}
                onConditionChange={setCondition}
                note={note}
                onNoteChange={setNote}
                errors={errors}
                disabled={isPending}
              />
            </FieldGroup>
          </form>

          <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={requestClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="stock-out-form"
              variant="destructive"
              disabled={isPending}
            >
              {isPending ? "Removing..." : "Remove from stock"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>
            Remove {qty} unit{qty === 1 ? "" : "s"} from stock?
          </AlertDialogTitle>
          <AlertDialogDescription>
            The school will stop counting{" "}
            <span className="font-medium tabular-nums">{qty}</span> unit
            {qty === 1 ? "" : "s"}
            {unitTags.length > 0
              ? ` — the ${unitTags.length} tag(s) you named`
              : " (oldest available first)"}
            , the tags are marked removed, and the movement goes to the ledger.
            Nobody signs off on this and there is no second stage, so check the
            tags before confirming.
          </AlertDialogDescription>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              onClick={commit}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? "Removing..." : "Yes, remove them"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      {confirmNode}
    </>
  );
};

/**
 * Which statuses a person may move by hand, and for the three they may not, which
 * procedure owns them.
 *
 * `updateUnit` accepts `available` and `removed` and refuses the other three with
 * a message naming the owning procedure. **A status `<Select>` on this register
 * would therefore be a control that silently fails for three of its five values**
 * — worse than no control, because it would look correct until it was pressed.
 * So the row action offers exactly two verbs, and for a lifecycle row it says who
 * owns the state instead of offering a button that cannot work.
 */
const MANUAL_STATUS_NOTE: Record<UnitStatus, string | null> = {
  available: null,
  removed: null,
  borrowed: "Out on loan — changes when the device comes back",
  issued: "Issued out of the school — terminal, there is no return path",
  disposed: "Disposed on a signed certificate — changes at finalisation",
};

interface UnitCounters extends Record<UnitStatus, number> {
  /** Rows on the page, including any status this build does not recognise. */
  total: number;
}

const countUnits = (units: { status: string }[]): UnitCounters => {
  const counters: UnitCounters = {
    total: units.length,
    available: 0,
    borrowed: 0,
    issued: 0,
    disposed: 0,
    removed: 0,
  };

  for (const unit of units) {
    if (isUnitStatus(unit.status)) {
      counters[unit.status] += 1;
    }
  }

  return counters;
};

const REGISTER_COUNTER_ORDER: { key: keyof UnitCounters; label: string }[] = [
  { key: "total", label: "On this page" },
  { key: "available", label: "Available" },
  { key: "borrowed", label: "On loan" },
  { key: "issued", label: "Issued" },
  { key: "disposed", label: "Disposed" },
  { key: "removed", label: "Removed" },
];

/**
 * The one row action a unit can have.
 *
 * Exactly two verbs, and for the three lifecycle statuses neither of them would
 * work — `assertNoActiveLifecycleUnit` refuses them. So those rows say who owns the
 * state instead of offering a button that cannot succeed.
 */
const UnitRowAction: React.FC<{
  unitId: string;
  uniqueNo: string;
  status: string;
  isPending: boolean;
  onSetStatus: (unitId: string, status: UnitStatus) => void;
}> = ({ unitId, uniqueNo, status, isPending, onSetStatus }) => {
  const ownedBy = isUnitStatus(status) ? MANUAL_STATUS_NOTE[status] : null;

  if (ownedBy !== null) {
    return <span className="text-muted-foreground text-xs">{ownedBy}</span>;
  }

  if (status === "removed") {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => onSetStatus(unitId, "available")}
        data-icon="inline-start"
      >
        <IconRestore data-icon="inline-start" />
        Restore to stock
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() => onSetStatus(unitId, "removed")}
      title={`Take ${uniqueNo} off the register as removed from stock`}
      data-icon="inline-start"
    >
      <IconPackageOff data-icon="inline-start" />
      Remove from stock
    </Button>
  );
};

/**
 * The asset-tag register: every physical unit the school has labelled.
 *
 * Sits on `listUnits`, ordered `uniqueNo ASC` so it reads down the page the way
 * a label drawer does.
 *
 * Its empty state is the fourth of the four distinct empty states in this
 * feature and the only one that asks for an action — the other three (loans,
 * issues, write-offs) are reassuring or informational and are written in
 * `lifecycle-tabs.tsx`, which explains the set. This one lives here because this
 * panel owns its own query and an empty state has to be decided where the rows
 * are. `onReceiveStock` is passed in rather than created here so the header owns
 * the one Receive-stock button for the whole page.
 */
export const AssetRegisterPanel = ({
  onReceiveStock,
}: {
  onReceiveStock: () => void;
}) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<UnitStatus | "all">("all");

  const unitsQuery = useQuery(
    orpc.inventory.units.list.queryOptions({
      input: {
        limit: REGISTER_PAGE_SIZE,
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(statusFilter === "all" ? {} : { status: statusFilter }),
      },
    })
  );

  const units = useMemo(() => unitsQuery.data?.units ?? [], [unitsQuery.data]);
  const total = unitsQuery.data?.total ?? 0;
  const counters = useMemo(() => countUnits(units), [units]);
  /** True when the register holds more tags than the page asked for. */
  const isTruncated = total > units.length;

  const updateUnitMutation = useMutation(
    orpc.inventory.units.update.mutationOptions({
      onSuccess: async (result) => {
        toast.success(
          result.unit.status === "removed"
            ? `${result.unit.uniqueNo} taken off the register as removed from stock`
            : `${result.unit.uniqueNo} restored to stock — ${result.item.availableQty} now available`
        );
        /**
         * `unit`, not `stock`: this is one tagged unit's status moving by hand,
         * not a delivery and not a removal of stock. The difference is what gets
         * re-read — a unit's status feeds the item's `availableQty`, so the
         * register and the item read both move, and the row this wrote to the
         * change log is the audit of it.
         */
        await invalidateInventory(queryClient, "unit");
      },
      onError: (error) => {
        toast.error(
          formatApiErrorMessage(error, "Could not update that asset tag")
        );
      },
    })
  );

  const setUnitStatus = (unitId: string, status: UnitStatus) => {
    updateUnitMutation.mutate({ unitId, status });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <FieldLabel htmlFor="register-search">Search the register</FieldLabel>
          <Input
            id="register-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Asset tag, item name or SKU"
            className="mt-1"
          />
        </div>
        <div>
          <FieldLabel htmlFor="register-status">Status</FieldLabel>
          <Select
            value={statusFilter}
            onValueChange={(value: string | null) => {
              if (value === "all" || isUnitStatus(value)) {
                setStatusFilter(value);
              }
            }}
          >
            <SelectTrigger id="register-status" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {UNIT_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {unitStatusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/**
       * Counted from the rows on screen, not from the database.
       *
       * `listUnits` returns a page plus the matching `total` — there is no
       * group-by aggregate — so a per-status count would mean a second round
       * trip per status, or a client-side pass over rows that were never
       * fetched. The strip is therefore a summary of *this page* and says so:
       * when `total` exceeds the rows on screen, the line under it says so
       * rather than presenting a partial count as the whole register. Narrowing
       * the search or the status filter above makes the page the whole register.
       *
       * `InventoryStatCards` is deliberately not used here: its seven fields
       * (`totalItems`, `lowStockItems`, `unassignedItems`, …) describe the *item*
       * register, and bending them to describe *units* would put a card labelled
       * "Items" above a number that is a count of tags.
       */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        {REGISTER_COUNTER_ORDER.map(({ key, label }) => (
          <div
            key={key}
            className="border-border rounded-none border px-3 py-2"
          >
            <p className="text-muted-foreground text-xs">{label}</p>
            <p className="text-lg font-semibold tabular-nums">
              {counters[key]}
            </p>
          </div>
        ))}
      </div>

      {isTruncated ? (
        <p className="text-muted-foreground text-xs">
          Showing the first {units.length} of {total} matching tags. Narrow the
          search or the status filter to count a smaller set.
        </p>
      ) : null}

      {unitsQuery.isLoading ? <InventorySkeleton rows={8} /> : null}

      {unitsQuery.isError ? (
        <InventoryErrorState
          error={unitsQuery.error}
          onRetry={() => {
            void unitsQuery.refetch();
          }}
        />
      ) : null}

      {!unitsQuery.isLoading && !unitsQuery.isError && units.length === 0 ? (
        <InventoryEmptyState
          title="No asset tags have been received yet"
          description="The register lists every individual device the school has labelled, one row per tag, and nothing has been received — so there is nothing here to track. Receive a delivery and its tags are created for you."
          action={
            <Button
              type="button"
              size="sm"
              onClick={onReceiveStock}
              data-icon="inline-start"
            >
              <IconPackage data-icon="inline-start" />
              Receive stock
            </Button>
          }
        />
      ) : null}

      {!unitsQuery.isLoading && !unitsQuery.isError && units.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset tag</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead className="hidden md:table-cell">Location</TableHead>
              <TableHead className="hidden md:table-cell">
                Last change
              </TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((unit) => (
              <TableRow key={unit.id}>
                <TableCell className="font-mono font-medium">
                  {unit.uniqueNo}
                </TableCell>
                <TableCell>
                  <span className="block">{unit.itemName}</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {unit.itemSku}
                  </span>
                </TableCell>
                <TableCell>
                  <UnitStatusBadge status={unit.status} />
                </TableCell>
                <TableCell>
                  <ConditionBadge condition={unit.condition} />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {unit.location || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground hidden md:table-cell">
                  {formatDateTime(unit.updatedAt)}
                </TableCell>
                <TableCell>
                  <UnitRowAction
                    unitId={unit.id}
                    uniqueNo={unit.uniqueNo}
                    status={unit.status}
                    isPending={updateUnitMutation.isPending}
                    onSetStatus={setUnitStatus}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
};
