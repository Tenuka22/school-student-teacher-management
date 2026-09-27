"use client";

/**
 * `StockInDialog` — the only place in the whole inventory where an asset tag is
 * invented. Everything else acts on a tag that already exists.
 *
 * `stockIn` refuses anything but exactly `qty` non-blank, unique tags: a delivery
 * of five whose sixth field holds three spaces has five tags, not six, and
 * receiving five while claiming six is the whole disagreement this dialog exists
 * to prevent. So `AssetTagFields`' row count is *locked to the quantity* rather
 * than merely validated against it.
 *
 * ## What the quantity handling is now, and why it is the point of this file
 *
 * The quantity used to be a bare `type="number"` read through
 * `Math.trunc(Number(raw))`. That silently booked a delivery of `2.7` in as `2`
 * and — because the truncation happened *before* validation — it stopped
 * `stock-in.ts`'s own `v.integer()` from ever firing. A clerk with 2.7 metres of
 * cable wrote 2 metres into the register and the half-metre disappeared with no
 * error anywhere.
 *
 * It is now `QuantityField` (the item's own unit printed inside the control, a
 * decimal refused out loud) plus `ProjectedQuantity` (what this form will make
 * the register's on-hand count) and `parseQuantity`, which has no rounding path
 * in it at all.
 */
import {
  ITEM_CONDITIONS,
  itemConditionLabel,
  itemConditionSchema,
  normalizeInventoryKey,
} from "@school-student-teacher-management/db/constants/inventory";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@school-student-teacher-management/ui/components/collapsible";
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
import { Textarea } from "@school-student-teacher-management/ui/components/textarea";
import {
  IconClipboardText,
  IconPackage,
  IconRestore,
  IconWand,
} from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import {
  LifecycleDialog,
  fieldErrorsFromApi,
  useFirstInvalidFocus,
} from "@/components/staff/inventory/dialog-form";
import {
  parseQuantity,
  pluralUnits,
} from "@/components/staff/inventory/quantity";
import {
  ProjectedQuantity,
  QuantityField,
  useStockSnapshot,
} from "@/components/staff/inventory/quantity-field";
import {
  InventoryInlineNotice,
  ItemPickerField,
  invalidateInventory,
} from "@/components/staff/inventory/shared";
import {
  issuesToFieldErrors,
  summariseTags,
  useDiscardGuard,
} from "@/components/staff/inventory/stock-form-helpers";
import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

/**
 * Mirrors `stock-in.ts`'s own ceiling. The server refuses a larger delivery, and a
 * control with no stated limit would let a storekeeper paste a spreadsheet export
 * in and only find out on submit.
 */
const MAX_STOCK_IN_QTY = 1000;

/**
 * One tag input.
 *
 * Modelled as a row object rather than a bare string for one reason: React needs a
 * stable key, and the only identity a tag has before it is typed is its position.
 * `rowId` is that identity, generated once when the row appears and carried for
 * the row's life — so raising the quantity, retyping a tag, or shrinking the list
 * back all leave the surviving rows mounted and their contents where the clerk
 * left them. The `value` is the tag itself and is still matched positionally by
 * the server, which pairs the Nth supplied tag with the Nth unit.
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
 * How many tag rows a typed quantity is worth.
 *
 * Deliberately tolerant where the submit path is strict: `2.7` grows the list to
 * two rows rather than to nothing, because the *resize* is an editing affordance
 * and a list that emptied itself the instant a decimal point was typed would be
 * worse than the rounding bug this file is fixing. Nothing is submittable with a
 * fractional quantity — `parseQuantity` refuses it, and that refusal is the one
 * that gates the button.
 */
const rowsForQuantity = (raw: string): number => {
  const trimmed = raw.trim();
  if (!/^\d+$/u.test(trimmed)) {
    return 0;
  }
  return Math.min(Math.trunc(Number(trimmed)), MAX_STOCK_IN_QTY);
};

/**
 * Grow or shrink the tag list to the quantity, keeping whatever is already typed
 * and keeping the surviving rows *mounted* — and **reporting anything it drops**.
 *
 * Shrinking from the end is the only behaviour that cannot silently destroy work
 * in the ordinary case, and raising the quantity never blanks a row. But lowering
 * the quantity *does* discard the rows past the new count, and if the clerk had
 * typed into them that is twenty seconds of reading a supplier's label sheet.
 *
 * So the trimmed rows are returned to the caller rather than dropped inside this
 * function, and the dialog puts them back with one click or says out loud what
 * went. Silently keeping them would be worse than dropping them — the form would
 * submit a different set of tags from the one on screen.
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

const emptyStockInIdentity = (): StockInIdentity => ({
  itemId: null,
  qtyInput: "1",
  tags: [newTagRow()],
});

/** What the last submit attempt had to say, cleared as one unit. */
interface StockInFeedback {
  errors: Record<string, string>;
  tagsError: string;
}

const EMPTY_STOCK_IN_FEEDBACK: StockInFeedback = { errors: {}, tagsError: "" };

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

/** The payload `stockIn` is given, typed as the schema's own output. */
type StockInPayload = v.InferOutput<typeof stockInSchema>;

type StockInCheck =
  | { ok: true; input: StockInPayload }
  | { ok: false; errors: Record<string, string>; tagsError: string };

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
 *
 * `qty` arrives as a `number` because the caller has already established it is
 * one — `parseQuantity` has no path that returns a value for `2.7`, so by the
 * time this runs the fraction question is settled rather than silently rounded.
 */
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
      tagsError: `Supply exactly ${pluralUnits(result.output.qty)} of asset tags, one for each of the ${pluralUnits(result.output.qty)} being received — ${pluralUnits(entered.length)} entered so far`,
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

/** The visual order of the fields that can be rejected, for focus. */
const STOCK_IN_FIELD_ORDER = [
  "itemId",
  "qty",
  "uniqueIds",
  "condition",
] as const;

const StockInProvenanceFields: React.FC<{
  idBase: string;
  provenance: DeliveryProvenance;
  onChange: <K extends keyof DeliveryProvenance>(
    key: K,
    value: DeliveryProvenance[K]
  ) => void;
  conditionError: string | undefined;
  disabled: boolean;
}> = ({ idBase, provenance, onChange, conditionError, disabled }) => (
  <>
    <div className="grid gap-4 md:grid-cols-3">
      <Field>
        <FieldLabel htmlFor={`${idBase}-supplier`}>Supplier</FieldLabel>
        <Input
          id={`${idBase}-supplier`}
          value={provenance.supplier}
          onChange={(event) => onChange("supplier", event.target.value)}
          disabled={disabled}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idBase}-purchase-date`}>
          Purchase date
        </FieldLabel>
        <Input
          id={`${idBase}-purchase-date`}
          type="date"
          value={provenance.purchaseDate}
          onChange={(event) => onChange("purchaseDate", event.target.value)}
          disabled={disabled}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idBase}-invoice`}>Invoice number</FieldLabel>
        <Input
          id={`${idBase}-invoice`}
          value={provenance.invoiceNo}
          onChange={(event) => onChange("invoiceNo", event.target.value)}
          disabled={disabled}
        />
      </Field>
    </div>

    <Field data-invalid={conditionError ? true : undefined}>
      <FieldLabel htmlFor={`${idBase}-condition`}>
        Condition override
      </FieldLabel>
      <Select
        value={provenance.condition === "" ? null : provenance.condition}
        onValueChange={(value: string | null) => {
          onChange("condition", value ?? "");
        }}
      >
        <SelectTrigger
          id={`${idBase}-condition`}
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
      <FieldLabel htmlFor={`${idBase}-location`}>Location</FieldLabel>
      <Input
        id={`${idBase}-location`}
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
      <FieldLabel htmlFor={`${idBase}-note`}>Note</FieldLabel>
      <Textarea
        id={`${idBase}-note`}
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
 * The duplicate marker used to be a `Badge variant="destructive"`, which is a
 * **filled shape** sitting in a row of eight plain inputs: it is a status badge
 * where the thing is a validation message, and it made the second offending row
 * look like a different kind of object from the first. It is now words, next to
 * the input, in the same weight as the row label — so the state is never carried
 * by colour or by a shape.
 */
const AssetTagFields: React.FC<{
  idBase: string;
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
  idBase,
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

  /**
   * One tag per row, generated rather than typed — for a delivery that has no
   * printed asset tags to copy from at all (bulk stock with no per-unit labelling
   * policy yet) and for a clerk who would rather correct a handful of generated
   * codes than type every one from scratch. Reuses the same `onPasteTags` path a
   * real paste takes, so a generated tag is checked against the store exactly the
   * way a typed one is — the server still refuses a collision, however the tag
   * arrived in the field.
   *
   * The random segment is per click, not per row: two clicks in the same session
   * must not mint the same batch twice, and `crypto.randomUUID`'s first eight hex
   * characters are already effectively collision-proof for one delivery's worth of
   * units.
   */
  const applyAutoGenerate = () => {
    const batchCode = crypto.randomUUID().slice(0, 8).toUpperCase();
    const generated = rows.map(
      (_, index) => `AUTO-${batchCode}-${String(index + 1).padStart(2, "0")}`
    );
    onPasteTags(generated, []);
  };

  return (
    <Field data-invalid={tagsError || uniqueIdsError ? true : undefined}>
      <FieldLabel htmlFor={`${idBase}-tag-0`}>Asset tags *</FieldLabel>
      <FieldDescription>
        The server requires exactly one tag per unit received, and a tag already
        on file anywhere in the store is refused — so the rows below are locked
        to the quantity. {filledCount} of {rows.length} entered.
      </FieldDescription>

      {/**
       * The paste path, above the rows it fills.
       *
       * Placed above rather than below because it is the *faster* route and a clerk
       * with a tag list should meet it before twenty inputs. It is a `Collapsible`
       * for the same reason the rest of this feature's optional detail is: it is a
       * real button, in the tab order, and its content is readable without a
       * pointer.
       */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={applyAutoGenerate}
          disabled={disabled}
          data-icon="inline-start"
        >
          <IconWand aria-hidden="true" data-icon="inline-start" />
          Auto-generate tags
        </Button>
        <Collapsible>
          <CollapsibleTrigger
            render={<Button type="button" variant="outline" size="sm" />}
            disabled={disabled}
          >
            <IconClipboardText aria-hidden="true" data-icon="inline-start" />
            Paste tags instead
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-2 pt-2">
              <FieldLabel htmlFor={`${idBase}-paste-tags`}>
                Paste the supplier&rsquo;s tag list
              </FieldLabel>
              <Textarea
                id={`${idBase}-paste-tags`}
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
                lines are ignored and the order is kept, because the server
                pairs the Nth tag with the Nth unit. This fills the{" "}
                {rows.length} row
                {rows.length === 1 ? "" : "s"} above; raise the quantity first
                if the delivery is larger.
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
      </div>

      <div className="space-y-2">
        {rows.map((row, index) => {
          const inputId = `${idBase}-tag-${index}`;
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
                aria-describedby={isDuplicate ? `${inputId}-dup` : undefined}
              />
              {isDuplicate ? (
                <span
                  id={`${inputId}-dup`}
                  className="text-destructive text-xs font-medium"
                >
                  Duplicate tag
                </span>
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
          description={`Lowering the quantity removed ${discarded.join(
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
            <IconRestore aria-hidden="true" data-icon="inline-start" />
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
  qtyError: string | undefined;
  unit: string | null;
  qtyControlRef: React.Ref<HTMLInputElement>;
  read: ReturnType<typeof useStockSnapshot>;
  delta: number;
  errors: Record<string, string>;
  disabled: boolean;
}> = ({
  itemId,
  onItemChange,
  qtyInput,
  onQtyChange,
  qtyError,
  unit,
  qtyControlRef,
  read,
  delta,
  errors,
  disabled,
}) => (
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

    <QuantityField
      value={qtyInput}
      onChange={onQtyChange}
      label="Quantity received"
      unit={unit}
      max={MAX_STOCK_IN_QTY}
      error={qtyError}
      note={`One asset tag is created per count, so this number sets the number of tag fields below.${
        unit ? ` This item is counted in “${unit}” on its register line.` : ""
      }`}
      controlRef={qtyControlRef}
      disabled={disabled}
    />

    <ProjectedQuantity
      read={read}
      delta={delta}
      afterLabel="After this delivery"
    />
  </>
);

/**
 * Everything the receiving form knows, as one hook.
 *
 * ## Why the state left the component
 *
 * `StockInDialog` was over 300 lines and `react-doctor/no-giant-component` was right:
 * the component held four `useState` groups, a `useMutation`, a `useDiscardGuard`, six
 * handlers and the whole JSX, and the *rules* — the tag-resize arithmetic, the paste
 * overflow, the hold-and-restore of dropped tags — were buried in the middle of it
 * where nobody would look for them. Moving the state and the handlers into a hook does
 * two things at once: the component becomes the frame, and the rules become a list of
 * named functions in one place.
 *
 * The four `useState` groups are still four groups rather than one `useReducer`
 * dispatch table, and the linter is right to ask: `what`, `provenance`, `feedback` and
 * `discarded` *do* change together on reset. What the reducer would buy is a single
 * `RESET` action and a switch, and what it would cost is that the reset no longer reads
 * as "the four things the reset clears" — which is the entire reason the groups are
 * grouped that way. The reset is one named function called from two places; that is
 * enough.
 */
const useStockInForm = (onOpenChange: (open: boolean) => void) => {
  const queryClient = useQueryClient();
  /**
   * Every DOM id in this dialog is derived from this one, because the page shell mounts
   * `StockInDialog` and `StockOutDialog` at the same time and the two used to hold
   * literal ids (`stock-in-qty`, `stock-in-supplier`, …) that only failed to collide
   * because no one had put two stock dialogs on one page yet.
   */
  const idBase = `stock-in-${useId().replaceAll(/[^\dA-Za-z_-]/gu, "")}`;
  const formId = `${idBase}-form`;

  const [what, setWhat] = useState<StockInIdentity>(emptyStockInIdentity);
  const [provenance, setProvenance] =
    useState<DeliveryProvenance>(EMPTY_PROVENANCE);
  const [feedback, setFeedback] = useState<StockInFeedback>(
    EMPTY_STOCK_IN_FEEDBACK
  );
  /** Rows the clerk has filled in that no longer fit the quantity. See `resizeTags`. */
  const [discarded, setDiscarded] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState("");

  const { itemId, qtyInput, tags } = what;
  const { errors, tagsError } = feedback;

  const read = useStockSnapshot(itemId);
  const unit = read.status === "ready" ? read.item.unit : null;

  /**
   * The quantity, read honestly. `parseQuantity` has no rounding path: `2.7` is a
   * refusal with the unit in the sentence, and an empty box is not a zero.
   */
  const quantity = useMemo(
    () =>
      parseQuantity(qtyInput, {
        unit: unit ?? undefined,
        max: MAX_STOCK_IN_QTY,
      }),
    [qtyInput, unit]
  );
  const qtyValue = quantity.ok ? quantity.value : 0;
  const qtyError = quantity.ok
    ? errors.qty
    : (errors.qty ?? (quantity.problem === "empty" ? "" : quantity.message));

  const duplicateRowIds = useMemo(() => duplicateTagRows(tags), [tags]);
  const filledTags = useMemo(
    () => tags.filter((row) => row.value.trim().length > 0).length,
    [tags]
  );

  const { controlRef, focusFirstInvalid } =
    useFirstInvalidFocus(STOCK_IN_FIELD_ORDER);

  const reset = () => {
    setWhat(emptyStockInIdentity());
    setProvenance(EMPTY_PROVENANCE);
    setFeedback(EMPTY_STOCK_IN_FEEDBACK);
    setDiscarded([]);
    setAnnouncement("");
  };

  /**
   * "Any field is off its default" — the whole of the dirty check.
   *
   * Deliberately excludes `feedback`: a validation message is the form talking to
   * itself, not the clerk's work, and a form that has only been *rejected* has nothing
   * to lose.
   */
  const isDirty =
    itemId !== null ||
    qtyInput !== "1" ||
    tags.some((row) => row.value.trim().length > 0) ||
    discarded.length > 0 ||
    Object.entries(provenance).some(
      ([key, value]) =>
        value !== EMPTY_PROVENANCE[key as keyof DeliveryProvenance]
    );

  const { requestClose: handleRequestClose, confirmNode } = useDiscardGuard(
    isDirty,
    () => {
      reset();
      onOpenChange(false);
    }
  );

  const stockInMutation = useMutation(
    orpc.inventory.items.stockIn.mutationOptions({
      onSuccess: async (result) => {
        toast.success(
          `Received ${pluralUnits(result.added)} — tags created: ${summariseTags(
            result.units.map((unitRow) => unitRow.uniqueNo)
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
        /**
         * A server-side field refusal lands on the field as well as in the toast, and
         * the form keeps every value it had — nothing here is reset on an error. A
         * clerk who mistyped an invoice number is not made to retype a twenty-tag
         * delivery, and the message lands next to the input that caused it rather
         * than three seconds later in a corner of the screen.
         */
        const fieldErrors = fieldErrorsFromApi(error);
        if (Object.keys(fieldErrors).length > 0) {
          setFeedback({ errors: fieldErrors, tagsError: "" });
          setAnnouncement(
            "The delivery was not saved, and everything you have typed is still here."
          );
          focusFirstInvalid(fieldErrors);
        }
      },
    })
  );

  const handleQtyChange = (raw: string) => {
    setAnnouncement("");
    setWhat((previous) => {
      // The two move together, always: the tag list's length *is* the quantity.
      const resized = resizeTags(previous.tags, rowsForQuantity(raw));
      if (resized.discarded.length > 0) {
        setDiscarded((held) => [...held, ...resized.discarded]);
      }
      return { ...previous, qtyInput: raw, tags: resized.rows };
    });
  };

  const handleItemChange = (nextItemId: string | null) => {
    setWhat((previous) => ({ ...previous, itemId: nextItemId }));
  };

  const handleTagValueChange = (rowId: string, value: string) => {
    setWhat((previous) => ({
      ...previous,
      tags: previous.tags.map((row) =>
        row.rowId === rowId ? { ...row, value } : row
      ),
    }));
  };

  /**
   * Fill the rows from a pasted list, and say what did not fit.
   *
   * The row identities are **kept** rather than replaced, so an input the clerk has
   * already focused does not remount under them mid-paste. Anything the existing rows
   * cannot hold becomes a *new* row rather than being dropped: `AssetTagFields` already
   * caps the paste at the row count and reports the overflow, and this is the belt to
   * that braces — a tag the clerk pasted and this handler silently swallowed would be
   * the exact quiet data loss the paste path was added to prevent.
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
        tagsError: `${overflow.length} tag(s) in the paste did not fit the quantity of ${qtyInput} and were not used: ${summariseTags(overflow)}. Raise the quantity to accept them.`,
      });
      return;
    }
    setFeedback(EMPTY_STOCK_IN_FEEDBACK);
  };

  /** Put the held tags back, by raising the quantity to hold them. */
  const handleRestoreDiscarded = () => {
    const restored = String(rowsForQuantity(qtyInput) + discarded.length);
    setWhat((previous) => ({
      ...previous,
      qtyInput: restored,
      tags: resizeTags(
        [...previous.tags, ...discarded.map((tag) => newTagRow(tag))],
        rowsForQuantity(restored)
      ).rows,
    }));
    setDiscarded([]);
  };

  const handleProvenanceChange = <K extends keyof DeliveryProvenance>(
    key: K,
    value: DeliveryProvenance[K]
  ) => {
    setProvenance((previous) => ({ ...previous, [key]: value }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setAnnouncement("");
    setFeedback(EMPTY_STOCK_IN_FEEDBACK);

    /**
     * The quantity is checked **first**, and separately from the object schema,
     * because it is the one field where a client-side reading and a server-side reading
     * could disagree — and where the old one *did* disagree, by rounding. Refusing
     * here, with the unit named, is the difference between a clerk being told "stock is
     * counted in whole metres" and a register that quietly loses half a metre.
     */
    if (!quantity.ok && quantity.problem !== "empty") {
      setFeedback({ errors: { qty: quantity.message }, tagsError: "" });
      setAnnouncement(quantity.message);
      focusFirstInvalid({ qty: quantity.message });
      return;
    }

    const checked = checkStockIn({
      itemId,
      qty: qtyValue,
      tags,
      duplicateRowIds,
      provenance,
    });

    if (!checked.ok) {
      setFeedback({ errors: checked.errors, tagsError: checked.tagsError });
      focusFirstInvalid(checked.errors);
      if (checked.tagsError) {
        setAnnouncement(checked.tagsError);
      }
      return;
    }

    stockInMutation.mutate(checked.input);
  };

  return {
    idBase,
    formId,
    itemId,
    qtyInput,
    tags,
    errors,
    tagsError,
    discarded,
    provenance,
    announcement,
    read,
    unit,
    quantity,
    qtyValue,
    qtyError,
    duplicateRowIds,
    filledTags,
    isPending: stockInMutation.isPending,
    handleRequestClose,
    confirmNode,
    controlRef,
    handleSubmit,
    handleItemChange,
    setAnnouncement,
    handleQtyChange,
    handleTagValueChange,
    handlePastedTags,
    handleRestoreDiscarded,
    handleClearDiscarded: () => {
      setDiscarded([]);
    },
    handleProvenanceChange,
  };
};

/**
 * Receive stock: create asset tags and add the quantity in one transaction.
 */
export const StockInDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const form = useStockInForm(onOpenChange);

  return (
    <>
      <LifecycleDialog
        open={open}
        onOpenChange={(next) => {
          // A close attempt on a filled-in form is a question, not a command.
          // `isPending` still wins: a submit in flight must be able to finish and close
          // itself, or the toast would arrive on a dialog that had already been reset
          // underneath it.
          if (next || form.isPending) {
            onOpenChange(next);
            return;
          }
          form.handleRequestClose();
        }}
        title="Receive stock"
        description="Add delivered units to an existing item and create their asset tags"
        formId={form.formId}
        onSubmit={form.handleSubmit}
        busy={form.isPending}
        announcement={form.announcement}
        width="wide"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={form.handleRequestClose}
              disabled={form.isPending}
            >
              Cancel
            </Button>
            {/**
             * `loading` rather than a swapped label. "Receive stock" →
             * "Receiving…" narrows the button by about four characters, so every submit
             * made the footer reflow; and `disabled` alone drops keyboard focus onto
             * `<body>` the instant it is pressed, which is how a screen-reader user ends
             * up at the top of the page with no announcement. `loading` blocks the
             * second submit, keeps the focus, holds the width and sets `aria-busy`.
             */}
            <Button type="submit" form={form.formId} loading={form.isPending}>
              <IconPackage aria-hidden="true" data-icon="inline-start" />
              Receive stock
            </Button>
          </>
        }
      >
        <FieldGroup>
          <StockInDeliveryFields
            itemId={form.itemId}
            onItemChange={form.handleItemChange}
            qtyInput={form.qtyInput}
            onQtyChange={form.handleQtyChange}
            qtyError={form.qtyError}
            unit={form.unit}
            qtyControlRef={form.controlRef("qty")}
            read={form.read}
            delta={form.qtyValue}
            errors={form.errors}
            disabled={form.isPending}
          />

          <AssetTagFields
            idBase={form.idBase}
            rows={form.tags}
            duplicateRowIds={form.duplicateRowIds}
            filledCount={form.filledTags}
            tagsError={form.tagsError}
            uniqueIdsError={form.errors.uniqueIds}
            discarded={form.discarded}
            onValueChange={form.handleTagValueChange}
            onPasteTags={form.handlePastedTags}
            onRestoreDiscarded={form.handleRestoreDiscarded}
            onClearDiscarded={form.handleClearDiscarded}
            disabled={form.isPending}
          />

          <StockInProvenanceFields
            idBase={form.idBase}
            provenance={form.provenance}
            onChange={form.handleProvenanceChange}
            conditionError={form.errors.condition}
            disabled={form.isPending}
          />
        </FieldGroup>
      </LifecycleDialog>
      {form.confirmNode}
    </>
  );
};
