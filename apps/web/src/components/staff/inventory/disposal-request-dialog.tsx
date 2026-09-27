"use client";

/**
 * `DisposalRequestDialog` — stage one of the two-stage write-off, and the stage that
 * moves nothing.
 *
 * | stage | procedure | moves stock? | who |
 * | --- | --- | --- | --- |
 * | raise | `disposals.create` | **no** | anybody with `inventory:create` |
 * | sign off | `disposals.approve` | **no** | a leadership seat, never the requester |
 * | finalise | `disposals.finalize` | **yes — the point of no return** | a leadership seat |
 * | withdraw | `disposals.cancel` | **no** | anybody with `inventory:update` |
 *
 * **The first three rows all say "no" except one, and that is the entire design.** A
 * storekeeper who noticed a projector is broken and a principal who says "yes, take it
 * off the books" are different acts, and only the last one changes a counter. This
 * dialog says which row it is on its face, because a storekeeper who believes they have
 * written something off when they have only raised a request will stop looking for the
 * signature.
 *
 * The quantity is read through `parseQuantity` and the item's on-hand figure is
 * projected, exactly as the three direct movements are — this is still a *count* of real
 * devices, and a request for 2.7 of something is a request nobody can sign.
 */
import {
  DISPOSAL_METHODS,
  disposalMethodLabel,
  disposalMethodSchema,
} from "@school-student-teacher-management/db/constants/inventory";
import { moneyStringSchema } from "@school-student-teacher-management/db/schema/inventory";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
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
  parseQuantity,
  pluralUnits,
} from "@/components/staff/inventory/quantity";
import type { StockReadState } from "@/components/staff/inventory/quantity-field";
import {
  ProjectedQuantity,
  QuantityField,
  useStockSnapshot,
} from "@/components/staff/inventory/quantity-field";
import {
  InventoryInlineNotice,
  ItemPickerField,
  MoneyField,
  UnitPickerField,
  invalidateInventory,
} from "@/components/staff/inventory/shared";
import {
  issuesToFieldErrors,
  partNamedTagMessage,
  useDiscardGuard,
} from "@/components/staff/inventory/stock-form-helpers";
import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

const MAX_REASON_LENGTH = 200;

const disposalRequestSchema = v.object({
  itemId: v.pipe(v.string(), v.minLength(1, "Choose the item to write off")),
  qty: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(1, "Enter how many units are being written off")
  ),
  reason: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "Say why the property is being written off"),
    v.maxLength(
      MAX_REASON_LENGTH,
      `Keep the reason under ${MAX_REASON_LENGTH} characters`
    )
  ),
  method: disposalMethodSchema,
  /**
   * `moneyStringSchema()` and not `v.optional(v.string())`, which is what this was.
   * A bare string accepts `1,250.00` and `-40` and `1e5`, the field's own client check
   * catches them visually, and then the *server* refuses the write — so a clerk who
   * mistyped a comma got a toast about a number after a round trip instead of a blocked
   * submit. The pattern is the column's own `numeric(14,2)` written out, and it is the
   * same schema the item form uses, so there is one definition of "an amount this
   * database can hold" in the feature.
   */
  estimatedValue: v.optional(moneyStringSchema()),
  notes: v.optional(v.string()),
  uniqueItemIds: v.optional(v.array(v.string())),
});

/** The visual order of the fields that can be rejected, for focus. */
const DISPOSAL_REQUEST_FIELD_ORDER = [
  "itemId",
  "qty",
  "reason",
  "method",
  "uniqueItemIds",
  "estimatedValue",
] as const;

/**
 * The request form's first block: the two-stage notice, the item and the quantity.
 *
 * Split out because the notice and the item picker are one argument — "this does not
 * write anything off, and here is what it is about" — and because a form this long is
 * better read as blocks.
 */
const DisposalRequestIdentityFields: React.FC<{
  itemId: string | null;
  onItemChange: (itemId: string | null) => void;
  qtyInput: string;
  onQtyChange: (value: string) => void;
  qtyError: string | undefined;
  unit: string | null;
  qtyControlRef: React.Ref<HTMLInputElement>;
  read: StockReadState;
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
    {/**
     * The two-stage separation, stated as plainly as the dialog can.
     *
     * `createDisposal` and `approveDisposal` both write a ledger row with the item's
     * counters **identical on both sides**, because a proposal and a signature are not
     * movements. Only `finalizeDisposal` decrements `qty`. So this form cannot write off
     * anything, and saying so is the difference between a clerk who goes looking for the
     * signature and one who walks away thinking the job is done.
     */}
    <InventoryInlineNotice
      tone="info"
      title="Raising this does not write anything off"
      description="This creates a proposal and puts it in front of somebody who has to sign it. The quantity on hand, the asset tags and the register are all untouched until that signature is given and the request is finalised — which is the only step that moves stock. Nothing here is approved by pressing Save."
    />

    <ItemPickerField
      value={itemId}
      onChange={onItemChange}
      label="Item *"
      description="Only items with units on the shelf are offered. Anything currently out on loan is excluded."
      error={errors.itemId}
      disabled={disabled}
      onlyAvailable
    />

    <QuantityField
      value={qtyInput}
      onChange={onQtyChange}
      label="Quantity to be written off"
      unit={unit}
      error={qtyError}
      note={`Whole numbers only. The units must be on the shelf now, even though nothing moves yet — a request asking a principal to sign off stock the school does not have is a request whose problem is found at the wrong moment.${
        unit ? ` This item is counted in “${unit}” on its register line.` : ""
      }`}
      controlRef={qtyControlRef}
      disabled={disabled}
    />

    {/**
     * The projection is labelled for *this* flow rather than for a movement: nothing
     * changes today, so the second row is what finalising will do, not what saving this
     * request does. A clerk reading "after this: 37" under a button labelled "Raise
     * request" would reasonably think the counter already moved.
     */}
    <ProjectedQuantity
      read={read}
      delta={-Math.abs(delta)}
      afterLabel="When it is finalised"
    />
  </>
);

/**
 * Everything the request form knows, as one hook. The component is the frame; the
 * quantity rule and the part-named-pin refusal are here.
 */
const useDisposalRequestForm = (onOpenChange: (open: boolean) => void) => {
  const queryClient = useQueryClient();
  const idBase = `disposal-request-${useId().replaceAll(/[^\dA-Za-z_-]/gu, "")}`;
  const formId = `${idBase}-form`;

  const [itemId, setItemId] = useState<string | null>(null);
  const [qtyInput, setQtyInput] = useState("1");
  const [unitTags, setUnitTags] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<string>("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
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
    DISPOSAL_REQUEST_FIELD_ORDER
  );

  const reset = () => {
    setItemId(null);
    setQtyInput("1");
    setUnitTags([]);
    setReason("");
    setMethod("");
    setEstimatedValue("");
    setNotes("");
    setErrors({});
    setAnnouncement("");
  };

  const isDirty =
    itemId !== null ||
    qtyInput !== "1" ||
    unitTags.length > 0 ||
    reason.trim().length > 0 ||
    method !== "" ||
    estimatedValue.trim().length > 0 ||
    notes.trim().length > 0;

  const { requestClose: handleRequestClose, confirmNode } = useDiscardGuard(
    isDirty,
    () => {
      reset();
      onOpenChange(false);
    }
  );

  const createMutation = useMutation(
    orpc.inventory.disposals.create.mutationOptions({
      onSuccess: async (result) => {
        toast.success(
          `Write-off requested for ${pluralUnits(result.qty)} of ${result.itemName} — it is now waiting for a signature, and no stock has moved yet`
        );
        reset();
        onOpenChange(false);
        /**
         * `disposal`, **not** `disposalDecision`. This is the *raise*, and the
         * distinction is the whole design of this flow: a request is a proposal and a
         * decision is a signature or a finalisation. Both dirty the same keys today, so
         * the two scopes are twins in `inventory-query-keys.ts` — but they are kept
         * apart because the day they diverge, "which of the four procedures is this" has
         * to be a value somebody chose on purpose rather than a coincidence.
         * `auditLogs` comes with it, which is the point: raising a request writes a
         * change-log row, and the Change log says every create appears.
         */
        await invalidateInventory(queryClient, "disposal");
      },
      onError: (error) => {
        toast.error(
          formatApiErrorMessage(error, "Could not raise this write-off request")
        );
        setAnnouncement(
          "The request was not raised. Everything you have typed is still here."
        );
        const fieldErrors = fieldErrorsFromApi(error);
        if (Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors);
          focusFirstInvalid(fieldErrors);
        }
      },
    })
  );

  const reject = (message: string, field: string) => {
    setErrors({ [field]: message });
    setAnnouncement(message);
    focusFirstInvalid({ [field]: message });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setAnnouncement("");

    if (!quantity.ok && quantity.problem !== "empty") {
      reject(quantity.message, "qty");
      return;
    }

    const result = v.safeParse(disposalRequestSchema, {
      itemId: itemId ?? "",
      qty,
      reason,
      method,
      estimatedValue: estimatedValue.trim() || undefined,
      notes: notes.trim() || undefined,
      uniqueItemIds: unitTags.length > 0 ? unitTags : undefined,
    });

    if (!result.success) {
      const fieldErrors = issuesToFieldErrors(result);
      setErrors(fieldErrors);
      setAnnouncement(
        "The request was not raised. Everything you have typed is still here."
      );
      focusFirstInvalid(fieldErrors);
      return;
    }
    setErrors({});

    /**
     * A part-named tag list is refused here rather than at the server, which answers
     * "Only 1 unit(s) are available" for an item that has three. On this form naming
     * units is genuinely optional — the specific device is often not settled until
     * somebody signs — so the refusal points at both ways out and the empty field stays
     * the recommended answer.
     */
    const tagMismatch = partNamedTagMessage(
      unitTags.length,
      qty,
      "chosen at sign-off"
    );
    if (tagMismatch !== null) {
      reject(tagMismatch, "uniqueItemIds");
      return;
    }

    const {
      estimatedValue: value,
      notes: noteText,
      uniqueItemIds,
      itemId: parsedItemId,
      qty: parsedQty,
      reason: parsedReason,
      method: parsedMethod,
    } = result.output;

    createMutation.mutate({
      itemId: parsedItemId,
      qty: parsedQty,
      reason: parsedReason,
      method: parsedMethod,
      /**
       * Explicit `null` when the field was left blank, which is a readability choice
       * rather than a workaround: `drizzle-valibot` wraps every nullable column in both
       * `nullable` and `optional`, so omitting the key is valid and nothing here is
       * compensating for a required one. "We were not told" is a statement about the
       * certificate; an absent key would be a statement about the form.
       */
      estimatedValue: value ?? null,
      ...(noteText ? { notes: noteText } : {}),
      ...(uniqueItemIds ? { uniqueItemIds } : {}),
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
    method,
    estimatedValue,
    notes,
    errors,
    announcement,
    read,
    unit,
    quantity,
    isPending: createMutation.isPending,
    handleRequestClose,
    confirmNode,
    controlRef,
    handleSubmit,
    handleItemChange: setItemId,
    handleQtyChange: (value: string) => {
      setAnnouncement("");
      setQtyInput(value);
    },
    handleUnitTagsChange: setUnitTags,
    handleReasonChange: setReason,
    handleMethodChange: setMethod,
    handleEstimatedValueChange: setEstimatedValue,
    handleNotesChange: setNotes,
  };
};

/**
 * Raise a request to write school property off the books. **Nothing moves.**
 *
 * This is stage one of two, and the dialog says so above the form rather than in a
 * footnote: the request goes into a queue for somebody else to sign, the counters are
 * untouched, and only finalising the signed request takes the stock off the shelf. A
 * clerk who closes this dialog believing the projector is gone will stop looking for
 * the signature.
 *
 * `uniqueItemIds` is optional here in a way it is not in the other movements, and the
 * server's own comment says why: a clerk raising "the two broken projectors" should not
 * have to walk to the cupboard and read two labels before the request can even be
 * saved, because the specific devices are not settled until somebody signs — a third
 * projector may turn out to be the broken one. Leave the pins empty and the units are
 * picked oldest-first at finalisation.
 */
export const DisposalRequestDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const form = useDisposalRequestForm(onOpenChange);

  return (
    <>
      <LifecycleDialog
        open={open}
        onOpenChange={(next) => {
          if (next || form.isPending) {
            onOpenChange(next);
            return;
          }
          form.handleRequestClose();
        }}
        title="Raise a write-off request"
        description="Propose that school property comes off the books, and wait for it to be signed"
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
            <Button type="submit" form={form.formId} loading={form.isPending}>
              Raise request
            </Button>
          </>
        }
      >
        <FieldGroup>
          <DisposalRequestIdentityFields
            itemId={form.itemId}
            onItemChange={form.handleItemChange}
            qtyInput={form.qtyInput}
            onQtyChange={form.handleQtyChange}
            qtyError={form.qtyError}
            unit={form.unit}
            qtyControlRef={form.controlRef("qty")}
            read={form.read}
            delta={form.quantity.ok ? form.quantity.value : 0}
            errors={form.errors}
            disabled={form.isPending}
          />

          <Field data-invalid={form.errors.reason ? true : undefined} required>
            <FieldLabel htmlFor={`${form.idBase}-reason`}>Reason *</FieldLabel>
            <Textarea
              id={`${form.idBase}-reason`}
              value={form.reason}
              onChange={(event) => {
                form.handleReasonChange(event.target.value);
              }}
              rows={3}
              maxLength={MAX_REASON_LENGTH}
              placeholder="e.g. Beyond repair after the water damage in the east storeroom; insurance settled"
              disabled={form.isPending}
            />
            <FieldDescription>
              What the approver reads before signing, and what an audit reads
              after. {form.reason.length}/{MAX_REASON_LENGTH}.
            </FieldDescription>
            {form.errors.reason ? (
              <FieldError>{form.errors.reason}</FieldError>
            ) : null}
          </Field>

          <Field data-invalid={form.errors.method ? true : undefined} required>
            <FieldLabel htmlFor={`${form.idBase}-method`}>Method *</FieldLabel>
            <Select
              value={form.method === "" ? null : form.method}
              onValueChange={(value: string | null) => {
                form.handleMethodChange(value ?? "");
              }}
            >
              <SelectTrigger
                id={`${form.idBase}-method`}
                disabled={form.isPending}
                aria-invalid={form.errors.method ? true : undefined}
              >
                <SelectValue placeholder="How is it leaving the school?" />
              </SelectTrigger>
              <SelectContent>
                {DISPOSAL_METHODS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {disposalMethodLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              The route the property takes. It is recorded on the certificate
              and is what the final outcome is checked against.
            </FieldDescription>
            {form.errors.method ? (
              <FieldError>{form.errors.method}</FieldError>
            ) : null}
          </Field>

          <UnitPickerField
            itemId={form.itemId}
            value={form.unitTags}
            onChange={form.handleUnitTagsChange}
            qty={form.qty}
            label="Pin specific units (optional)"
            error={form.errors.uniqueItemIds}
            description="Name the tags when the broken devices are in front of you — a pinned unit cannot be moved by any other flow while the request waits. Leave empty and the oldest available units are chosen at sign-off, which is usually the right answer because the specific device is often not settled until then. Pin as many as the quantity, or none at all: a part-pinned list is refused rather than half-applied."
            disabled={form.isPending}
          />

          {/**
           * **One money field, not two.**
           *
           * This form rendered `Estimated value` twice against the same
           * `estimatedValue` state with two different descriptions, both with the same
           * hardcoded DOM id. The second `<FieldLabel htmlFor>` resolved to the *first*
           * input, so the second input had no accessible name at all, and the two
           * descriptions told the clerk two different things about the same figure on
           * the same screen. The kept description is the truer of the two, with the one
           * real fact the deleted one carried — that the figure can wait until
           * finalisation — folded into it.
           *
           * The id is derived rather than literal for the same reason every other id in
           * this file is: two dialogs mount at once.
           */}
          <MoneyField
            id={`${form.idBase}-estimated-value`}
            value={form.estimatedValue}
            onChange={form.handleEstimatedValueChange}
            label="Estimated value (optional)"
            description="What the school thinks it is losing. Recorded on the certificate and never recalculated — leave it empty if you do not know the figure, and supply or revise it at finalisation, which is the last chance to change it."
            error={form.errors.estimatedValue}
          />

          <Field>
            <FieldLabel htmlFor={`${form.idBase}-notes`}>Notes</FieldLabel>
            <Textarea
              id={`${form.idBase}-notes`}
              value={form.notes}
              onChange={(event) => {
                form.handleNotesChange(event.target.value);
              }}
              rows={2}
              disabled={form.isPending}
            />
            <FieldDescription>
              Anything the reason cannot hold in a sentence: an insurance claim
              number, who collected it, where it is going.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </LifecycleDialog>
      {form.confirmNode}
    </>
  );
};
