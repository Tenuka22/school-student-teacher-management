"use client";

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
 * Irreversible, so the consequence is stated in plain words above the form, the
 * commit goes through an `AlertDialog` that **names the item and the quantity**,
 * and that dialog refuses `Esc` and a backdrop click (which is what
 * `AlertDialog` does by default, and why the destructive variant of `useDiscardGuard`
 * does not opt back in).
 */
import {
  ITEM_CONDITIONS,
  itemConditionLabel,
  itemConditionSchema,
} from "@school-student-teacher-management/db/constants/inventory";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@school-student-teacher-management/ui/components/alert-dialog";
import { Button } from "@school-student-teacher-management/ui/components/button";
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
  counted,
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
  UnitPickerField,
  invalidateInventory,
} from "@/components/staff/inventory/shared";
import {
  issuesToFieldErrors,
  partNamedTagMessage,
  summariseTags,
  useDiscardGuard,
} from "@/components/staff/inventory/stock-form-helpers";
import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

/** Mirrors `stock-out.ts`'s `reason` cap, so the character count can be honest. */
const MAX_REASON_LENGTH = 200;

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

/** The visual order of the fields that can be rejected, for focus. */
const STOCK_OUT_FIELD_ORDER = [
  "itemId",
  "qty",
  "uniqueItemIds",
  "reason",
  "condition",
] as const;

/**
 * The written record of a removal: why, who agreed, what condition, and any
 * free-text note.
 *
 * Split out of the dialog because it is the part of the form that is *evidence*
 * rather than mechanics, and because one field in it carries a rule the rest of
 * the codebase depends on: the condition override must never be derived from the
 * reason text. Keeping the pair together here makes that rule visible in one
 * place instead of spread across a component body.
 */
const StockOutRecordFields: React.FC<{
  idBase: string;
  reason: string;
  onReasonChange: (value: string) => void;
  reasonControlRef: React.Ref<HTMLTextAreaElement>;
  approvedBy: string;
  onApprovedByChange: (value: string) => void;
  condition: string;
  onConditionChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  errors: Record<string, string>;
  disabled: boolean;
}> = ({
  idBase,
  reason,
  onReasonChange,
  reasonControlRef,
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
      <FieldLabel htmlFor={`${idBase}-reason`}>Reason *</FieldLabel>
      <Textarea
        ref={reasonControlRef}
        id={`${idBase}-reason`}
        value={reason}
        onChange={(event) => onReasonChange(event.target.value)}
        rows={3}
        maxLength={MAX_REASON_LENGTH}
        placeholder="e.g. Projector bulb failed during the Grade 11 practical on 14 March; chassis cracked and it was not repairable"
        disabled={disabled}
      />
      <FieldDescription>
        This is the first thing an auditor reads on a removal, so write it in
        full sentences &mdash; the difference between &ldquo;damaged&rdquo; and
        this is the difference between a storebook that explains itself and one
        that cannot.
        {reason.length}/{MAX_REASON_LENGTH}.
      </FieldDescription>
      {errors.reason ? <FieldError>{errors.reason}</FieldError> : null}
    </Field>

    {/**
     * **Not "Approved by".** The consequence is in the label, not only in the hint
     * below it, because the label is what survives: a certificate opened in a year
     * shows the string that was typed, and a field headed *Approved by* on a form
     * that approves nothing will be read as an approval by whoever reads it next. A
     * clerk who types a name here is recording who agreed to this in conversation;
     * nothing checks it, nothing is refused without it, and the hint says so as
     * well &mdash; but the name of the field no longer claims a gate that does not
     * exist.
     */}
    <Field>
      <FieldLabel htmlFor={`${idBase}-authorised-by`}>
        Authorised by (recorded, not enforced)
      </FieldLabel>
      <Input
        id={`${idBase}-authorised-by`}
        value={approvedBy}
        onChange={(event) => onApprovedByChange(event.target.value)}
        placeholder="Name of the person who agreed to this"
        disabled={disabled}
      />
      <FieldDescription>
        Written onto the ledger row beside your own name. Nobody is stopped by
        this field and nothing is checked against it &mdash; it is a record of
        who agreed, not an approval.
      </FieldDescription>
    </Field>

    {/**
     * The condition override, and the one thing this form must never do.
     *
     * `stockOut` deliberately refuses to infer `condition: "Damaged"` from a reason
     * mentioning breakage, and its own comment says why: a guess written into the
     * condition ledger is worse than no guess, because the ledger looks
     * authoritative. **The UI must not out-guess the server either.** So there is no
     * keyword match on the reason text, no &ldquo;you said broken, so I set
     * Damaged&rdquo;, and no coupling between the two fields at all &mdash; the
     * override moves only when a person moves it, while they are holding the device.
     */}
    <Field data-invalid={errors.condition ? true : undefined}>
      <FieldLabel htmlFor={`${idBase}-condition`}>
        Condition override
      </FieldLabel>
      <Select
        value={condition === "" ? null : condition}
        onValueChange={(value: string | null) => {
          onConditionChange(value ?? "");
        }}
      >
        <SelectTrigger
          id={`${idBase}-condition`}
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
      <FieldLabel htmlFor={`${idBase}-note`}>Note</FieldLabel>
      <Textarea
        id={`${idBase}-note`}
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
 * scrolled to the end is not reading. Above the item picker, it is read while there
 * is still a decision to make.
 */
const StockOutIdentityFields: React.FC<{
  itemId: string | null;
  onItemChange: (itemId: string | null) => void;
  qtyInput: string;
  onQtyChange: (value: string) => void;
  qtyError: string | undefined;
  unit: string | null;
  qtyControlRef: React.Ref<HTMLInputElement>;
  read: ReturnType<typeof useStockSnapshot>;
  delta: number;
  unitTags: string[];
  onUnitTagsChange: (tags: string[]) => void;
  qty: number;
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
  unitTags,
  onUnitTagsChange,
  qty,
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

    <QuantityField
      value={qtyInput}
      onChange={onQtyChange}
      label="Quantity being removed"
      unit={unit}
      error={qtyError}
      note={`Whole numbers only. The school stops holding these.${
        unit ? ` This item is counted in “${unit}” on its register line.` : ""
      }`}
      controlRef={qtyControlRef}
      disabled={disabled}
    />

    <ProjectedQuantity
      read={read}
      delta={-Math.abs(delta)}
      afterLabel="After this removal"
    />

    <UnitPickerField
      itemId={itemId}
      value={unitTags}
      onChange={onUnitTagsChange}
      qty={qty}
      label="Which units"
      error={errors.uniqueItemIds}
      description="Leave empty and the oldest available units are taken, which is the order the store counts on. Name the tags when the devices are in front of you — but name as many as the quantity, or leave the field empty: a part-named list is refused rather than half-applied."
      disabled={disabled}
    />
  </>
);

/**
 * Everything the removal form knows, as one hook.
 *
 * The component below is the frame: a form, a footer, and a confirm. The rules live
 * here — the quantity parse, the part-named-tag refusal, the parse that both the
 * submit gate and the confirmed commit run — and they are named rather than inlined
 * into a `handleSubmit` that had reached a cognitive complexity of 22.
 */
const useStockOutForm = (onOpenChange: (open: boolean) => void) => {
  const queryClient = useQueryClient();
  const idBase = `stock-out-${useId().replaceAll(/[^\dA-Za-z_-]/gu, "")}`;
  const formId = `${idBase}-form`;

  const [itemId, setItemId] = useState<string | null>(null);
  const [qtyInput, setQtyInput] = useState("1");
  const [unitTags, setUnitTags] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  const [condition, setCondition] = useState<string>("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const read = useStockSnapshot(itemId);
  const unit = read.status === "ready" ? read.item.unit : null;

  const quantity = useMemo(
    () => parseQuantity(qtyInput, { unit: unit ?? undefined }),
    [qtyInput, unit]
  );
  const qty = quantity.ok ? quantity.value : 0;
  const qtyError = quantity.ok
    ? errors.qty
    : (errors.qty ?? (quantity.problem === "empty" ? "" : quantity.message));

  const { controlRef, focusFirstInvalid } = useFirstInvalidFocus(
    STOCK_OUT_FIELD_ORDER
  );

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
    setAnnouncement("");
  };

  const isDirty =
    itemId !== null ||
    qtyInput !== "1" ||
    unitTags.length > 0 ||
    reason.trim().length > 0 ||
    approvedBy.trim().length > 0 ||
    condition !== "" ||
    note.trim().length > 0;

  const { requestClose: handleRequestClose, confirmNode } = useDiscardGuard(
    isDirty,
    () => {
      reset();
      onOpenChange(false);
    }
  );

  const stockOutMutation = useMutation(
    orpc.inventory.items.stockOut.mutationOptions({
      onSuccess: async (result) => {
        /*
         * `units` is `null` for a counted line, and that is the only reason this toast
         * is a branch rather than a template. `stockOut` returns `null` — not `[]` —
         * when the item is counted in bulk and had no tagged devices to claim, because
         * an empty list here would render as "Removed 3 unit(s) from stock — " with
         * nothing after the dash: a sentence about a tag list that was never written
         * down. The counted case gets its own clause, which is also the honest
         * description of what happened.
         */
        const { removed, units } = result;
        toast.success(
          units
            ? `Removed ${pluralUnits(removed)} from stock — ${summariseTags(
                units.map((unitRow) => unitRow.uniqueNo)
              )}`
            : `Removed ${pluralUnits(removed)} from stock — this line is counted in bulk, so no asset tags were attached`
        );
        reset();
        onOpenChange(false);
        /**
         * `stock`, for the same reason as `stockIn` and against the same omission: the
         * counters and the new tags moved, and the row this wrote to the change log
         * has to appear there.
         */
        await invalidateInventory(queryClient, "stock");
      },
      onError: (error) => {
        toast.error(
          formatApiErrorMessage(error, "Could not remove this stock")
        );
        /**
         * The typed reason is the most expensive thing on this form to write and the
         * most likely thing the server refuses (over-long, blank after trim), so the
         * error lands on the field and **nothing is reset**. The confirm dialog is also
         * closed here: leaving an unanswered `AlertDialog` in front of a dialog that
         * already toasted would hide the message behind a question about something that
         * did not happen.
         */
        setConfirmOpen(false);
        setAnnouncement(
          "The removal was not saved. Everything you have typed is still here."
        );
        const fieldErrors = fieldErrorsFromApi(error);
        if (Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors);
          focusFirstInvalid(fieldErrors);
        }
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

  const reject = (message: string, field: string) => {
    setErrors({ [field]: message });
    setAnnouncement(message);
    focusFirstInvalid({ [field]: message });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setAnnouncement("");

    /**
     * The quantity first, for the same reason as `stock-in-dialog.tsx`: a fractional
     * entry is a refusal with the unit in the sentence, not a rounded number.
     * `Math.trunc` used to run before the schema and the schema's own `v.integer()`
     * therefore never got to see a decimal.
     */
    if (!quantity.ok && quantity.problem !== "empty") {
      reject(quantity.message, "qty");
      return;
    }

    const result = parseForm();
    if (!result.success) {
      const fieldErrors = issuesToFieldErrors(result);
      setErrors(fieldErrors);
      setAnnouncement(
        "The removal was not sent. Everything you have typed is still here."
      );
      focusFirstInvalid(fieldErrors);
      return;
    }
    setErrors({});

    /**
     * **A partial tag list is refused here, and it has to be.**
     *
     * `UnitPickerField` invites "1 of 3 selected — 2 still to choose" and does not
     * block on it, so the form reaches the server with one tag named and a quantity of
     * three. `getAvailableUnits` then throws `CONFLICT` — *"Only 1 unit(s) are
     * available"* — which is a **false** sentence: the item has three, the clerk named
     * one. The false part is the damaging part, because a storebook that says a
     * projector is unavailable when two are on the shelf is a storebook nobody trusts.
     */
    const tagMismatch = partNamedTagMessage(unitTags.length, qty, "taken");
    if (tagMismatch !== null) {
      reject(tagMismatch, "uniqueItemIds");
      return;
    }

    // Confirm second. An `AlertDialog` that opens for a form that could not have been
    // submitted is a dialog about nothing.
    setConfirmOpen(true);
  };

  const handleCommit = () => {
    const result = parseForm();
    if (!result.success) {
      setConfirmOpen(false);
      return;
    }
    const {
      uniqueItemIds,
      approvedBy: approved,
      condition: cond,
      note: noteText,
    } = result.output;

    stockOutMutation.mutate({
      itemId: result.output.itemId,
      qty: result.output.qty,
      reason: result.output.reason,
      ...(uniqueItemIds ? { uniqueItemIds } : {}),
      ...(approved ? { approvedBy: approved } : {}),
      ...(cond ? { condition: cond } : {}),
      ...(noteText ? { note: noteText } : {}),
    });
  };

  return {
    idBase,
    formId,
    itemId,
    qtyInput,
    qty,
    qtyError,
    unitTags,
    reason,
    approvedBy,
    condition,
    note,
    errors,
    confirmOpen,
    announcement,
    read,
    unit,
    quantity,
    isPending: stockOutMutation.isPending,
    handleRequestClose,
    confirmNode,
    controlRef,
    handleSubmit,
    handleCommit,
    handleConfirmOpenChange: setConfirmOpen,
    setAnnouncement,
    handleItemChange: setItemId,
    handleQtyChange: (value: string) => {
      setAnnouncement("");
      setQtyInput(value);
    },
    handleUnitTagsChange: setUnitTags,
    handleReasonChange: setReason,
    handleApprovedByChange: setApprovedBy,
    handleConditionChange: setCondition,
    handleNoteChange: setNote,
  };
};

export const StockOutDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const form = useStockOutForm(onOpenChange);
  const { quantity, unit, read } = form;
  const namedItem = read.status === "ready" ? read.item.itemName : null;
  const isConfirmBlocked = !quantity.ok;

  return (
    <>
      <LifecycleDialog
        open={open}
        onOpenChange={(next) => {
          /**
           * A close attempt while the confirm is standing is ignored outright.
           *
           * Without this, `Esc` inside the `AlertDialog` is refused by the alert dialog
           * (correctly) but *also* reaches the outer `Dialog`'s `onOpenChange`, which
           * then opened the discard guard **on top of the confirm** — two questions about
           * two different things, with the confirm the one nobody could see. The confirm
           * is a question, so nothing closes underneath it until it is answered.
           */
          if (form.confirmOpen) {
            return;
          }
          if (next || form.isPending) {
            onOpenChange(next);
            return;
          }
          form.handleRequestClose();
        }}
        title="Remove stock from the register"
        description={
          <>
            Take units the school no longer holds off the books in one step
            &mdash; lost, stolen or beyond repair. This is <em>not</em> a
            write-off
          </>
        }
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
            <Button
              type="submit"
              form={form.formId}
              variant="destructive"
              loading={form.isPending}
            >
              Remove from stock
            </Button>
          </>
        }
      >
        <FieldGroup>
          <StockOutIdentityFields
            itemId={form.itemId}
            onItemChange={form.handleItemChange}
            qtyInput={form.qtyInput}
            onQtyChange={form.handleQtyChange}
            qtyError={form.qtyError}
            unit={unit}
            qtyControlRef={form.controlRef("qty")}
            read={read}
            delta={quantity.ok ? quantity.value : 0}
            unitTags={form.unitTags}
            onUnitTagsChange={form.handleUnitTagsChange}
            qty={form.qty}
            errors={form.errors}
            disabled={form.isPending}
          />

          <StockOutRecordFields
            idBase={form.idBase}
            reason={form.reason}
            onReasonChange={form.handleReasonChange}
            reasonControlRef={form.controlRef("reason")}
            approvedBy={form.approvedBy}
            onApprovedByChange={form.handleApprovedByChange}
            condition={form.condition}
            onConditionChange={form.handleConditionChange}
            note={form.note}
            onNoteChange={form.handleNoteChange}
            errors={form.errors}
            disabled={form.isPending}
          />
        </FieldGroup>
      </LifecycleDialog>

      {/**
       * The confirm, as a sibling of the `Dialog` and not a child of `DialogContent`.
       * Portalled either way, but nested inside a `modal` popup whose focus manager is
       * already trapping, and this one is the *only* question on this form.
       *
       * It names the item as well as the quantity: those are the two facts a principal
       * would need in order to notice they had the wrong row open, and the quantity
       * alone ("Remove 3 units from stock?") is the shape of question that gets
       * dismissed without being read. It does not take `closeOnEscape`, so `Esc` and a
       * backdrop click are both refused — a half-typed reason is still behind this
       * dialog and must not be lost to a stray keypress.
       */}
      <AlertDialog
        open={form.confirmOpen}
        onOpenChange={form.handleConfirmOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            {isConfirmBlocked
              ? "Nothing to remove yet"
              : `Remove ${counted(form.qty, unit ?? "unit")} of ${
                  namedItem ?? "this item"
                } from stock?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isConfirmBlocked ? (
              "The quantity box does not hold a whole number yet, so there is nothing to confirm. Go back and correct it."
            ) : (
              <>
                The school will stop counting{" "}
                <span className="font-medium tabular-nums">
                  {counted(form.qty, unit ?? "unit")}
                </span>{" "}
                of {namedItem ?? "this item"}
                {form.unitTags.length > 0
                  ? ` — the ${form.unitTags.length} tag(s) you named`
                  : " (oldest available first)"}
                , the tags are marked removed, and the movement goes to the
                ledger. Nobody signs off on this and there is no second stage,
                so check the tags before confirming.
              </>
            )}
          </AlertDialogDescription>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={form.handleCommit}
              loading={form.isPending}
              disabled={isConfirmBlocked}
            >
              Yes, remove them
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      {form.confirmNode}
    </>
  );
};
