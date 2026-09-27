"use client";

/**
 * `IssueDialog` — hand a quantity or a unit to somebody, permanently.
 *
 * **An issue is not a loan, and the copy leads with the consequence rather than
 * the definition.** `createIssue` decrements `inventoryItem.qty`, so the stock
 * stops being the school's, and it sets the units to `issued`, which is terminal.
 * There is no `returnIssue` and no `cancelIssue`. A loan does the opposite and
 * leaves `qty` alone. Three things look alike at a school counter — a loan, a
 * disposal and an issue — and only one of them is this form.
 *
 * The quantity is read through `parseQuantity` like every other movement, so a
 * fractional issue is refused rather than rounded, and the item's on-hand figure
 * is shown before and after.
 */
import {
  isoDateSchema,
  slPhoneSchema,
} from "@school-student-teacher-management/db/schema/primitives";
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
import { Textarea } from "@school-student-teacher-management/ui/components/textarea";
import { IconArrowUpRight } from "@tabler/icons-react";
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
  useDiscardGuard,
} from "@/components/staff/inventory/stock-form-helpers";
import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

const issueSchema = v.object({
  itemId: v.pipe(v.string(), v.minLength(1, "Choose the item being issued")),
  qty: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(1, "Enter how many units are going out")
  ),
  receiverName: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "Name the person or organisation receiving it")
  ),
  receiverDepartment: v.optional(v.nullable(v.string())),
  /**
   * `slPhoneSchema` is the *same* refinement the column carries, so a clerk who
   * types `0771234567` gets `+94771234567` stored rather than a local-format
   * string that would not match a school's other records — and a number that is
   * not a mobile number is refused here rather than at the database.
   */
  receiverPhone: v.optional(v.nullable(slPhoneSchema)),
  purpose: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "Say what the stock is for")
  ),
  expectedReturnDate: v.optional(v.nullable(isoDateSchema)),
  approvedBy: v.optional(v.nullable(v.string())),
  note: v.optional(v.nullable(v.string())),
  uniqueItemIds: v.optional(v.array(v.string())),
});

/** The visual order of the fields that can be rejected, for focus. */
const ISSUE_FIELD_ORDER = [
  "itemId",
  "qty",
  "uniqueItemIds",
  "receiverName",
  "receiverPhone",
  "purpose",
  "expectedReturnDate",
] as const;

/**
 * Why the stock is going out, when it was expected back, and who agreed to it.
 *
 * Split out because `expectedReturnDate` needs its own argument on the face of the
 * field, and that argument is the one that stops this form from being mistaken for
 * the loan dialog next door. Here the date is a **reconciliation note** — nothing
 * chases it, because an issue has no return path. On a loan the same field is the
 * thing the overdue badge is computed from. Same input, opposite meaning, and the
 * difference has to be written where the field is rather than in a footnote.
 */
const IssueTermsFields: React.FC<{
  idBase: string;
  purpose: string;
  onPurposeChange: (value: string) => void;
  purposeControlRef: React.Ref<HTMLTextAreaElement>;
  expectedReturnDate: string;
  onExpectedReturnDateChange: (value: string) => void;
  expectedReturnControlRef: React.Ref<HTMLInputElement>;
  approvedBy: string;
  onApprovedByChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  errors: Record<string, string>;
  disabled: boolean;
}> = ({
  idBase,
  purpose,
  onPurposeChange,
  purposeControlRef,
  expectedReturnDate,
  onExpectedReturnDateChange,
  expectedReturnControlRef,
  approvedBy,
  onApprovedByChange,
  note,
  onNoteChange,
  errors,
  disabled,
}) => (
  <>
    <Field data-invalid={errors.purpose ? true : undefined}>
      <FieldLabel htmlFor={`${idBase}-purpose`}>Purpose *</FieldLabel>
      <Textarea
        ref={purposeControlRef}
        id={`${idBase}-purpose`}
        value={purpose}
        onChange={(event) => onPurposeChange(event.target.value)}
        rows={2}
        placeholder="e.g. Equipping the new Grade 10 practical room, per approval dated 2 March"
        disabled={disabled}
      />
      <FieldDescription>
        The sentence a term-end reconciliation reads six months from now.
      </FieldDescription>
      {errors.purpose ? <FieldError>{errors.purpose}</FieldError> : null}
    </Field>

    <Field data-invalid={errors.expectedReturnDate ? true : undefined}>
      <FieldLabel htmlFor={`${idBase}-expected-return`}>
        Expected back by
      </FieldLabel>
      <Input
        ref={expectedReturnControlRef}
        id={`${idBase}-expected-return`}
        type="date"
        value={expectedReturnDate}
        onChange={(event) => onExpectedReturnDateChange(event.target.value)}
        disabled={disabled}
        aria-invalid={errors.expectedReturnDate ? true : undefined}
      />
      <FieldDescription>
        Optional, and it is a note rather than a commitment. Nothing in the
        system chases it, because an issue has no return path &mdash; the list
        only uses this date to flag stock that was promised back and
        demonstrably was not, at the end of term.
      </FieldDescription>
      {errors.expectedReturnDate ? (
        <FieldError>{errors.expectedReturnDate}</FieldError>
      ) : null}
    </Field>

    {/**
     * **Not "Approved by"** — the certificate this form produces has no approval
     * step, and a field headed *Approved by* on it will be read as one by whoever
     * opens the certificate in a year. The consequence is in the label, so the
     * label is what carries it: *recorded, not enforced*.
     */}
    <Field>
      <FieldLabel htmlFor={`${idBase}-authorised-by`}>
        Authorised by (recorded, not enforced)
      </FieldLabel>
      <Input
        id={`${idBase}-authorised-by`}
        value={approvedBy}
        onChange={(event) => onApprovedByChange(event.target.value)}
        placeholder="Name of the person who agreed to it"
        disabled={disabled}
      />
      <FieldDescription>
        Printed on the certificate beside your own name. Nothing is checked
        against it and nothing is refused without it &mdash; it is a record of
        who agreed, not an approval.
      </FieldDescription>
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
 * Who is receiving the stock, and on what terms.
 *
 * Split out of the dialog because the receiver block is where this form is
 * genuinely different from every other movement in the feature: the receiver is
 * **free text**, not a staff lookup, and the copy has to say why or a clerk will
 * go looking for a name that is not on the roll and conclude the form is broken.
 */
const IssueReceiverFields: React.FC<{
  idBase: string;
  receiverName: string;
  onReceiverNameChange: (value: string) => void;
  receiverNameControlRef: React.Ref<HTMLInputElement>;
  receiverDepartment: string;
  onReceiverDepartmentChange: (value: string) => void;
  receiverPhone: string;
  onReceiverPhoneChange: (value: string) => void;
  receiverPhoneControlRef: React.Ref<HTMLInputElement>;
  errors: Record<string, string>;
  disabled: boolean;
}> = ({
  idBase,
  receiverName,
  onReceiverNameChange,
  receiverNameControlRef,
  receiverDepartment,
  onReceiverDepartmentChange,
  receiverPhone,
  onReceiverPhoneChange,
  receiverPhoneControlRef,
  errors,
  disabled,
}) => (
  <>
    <Field data-invalid={errors.receiverName ? true : undefined}>
      <FieldLabel htmlFor={`${idBase}-receiver`}>Received by *</FieldLabel>
      <Input
        ref={receiverNameControlRef}
        id={`${idBase}-receiver`}
        value={receiverName}
        onChange={(event) => onReceiverNameChange(event.target.value)}
        placeholder="e.g. Nimal Perera, or Province Education Office"
        disabled={disabled}
      />
      <FieldDescription>
        Free text, not a staff lookup. Stock leaves this school to people who
        are not on its staff roll, and inventing a staff record for a departing
        student is the kind of fake row that makes every other list
        untrustworthy later.
      </FieldDescription>
      {errors.receiverName ? (
        <FieldError>{errors.receiverName}</FieldError>
      ) : null}
    </Field>

    <div className="grid gap-4 md:grid-cols-2">
      <Field>
        <FieldLabel htmlFor={`${idBase}-department`}>
          Receiver&rsquo;s department
        </FieldLabel>
        <Input
          id={`${idBase}-department`}
          value={receiverDepartment}
          onChange={(event) => onReceiverDepartmentChange(event.target.value)}
          placeholder="e.g. Grade 10 Science, or Provincial Office"
          disabled={disabled}
        />
      </Field>

      <Field data-invalid={errors.receiverPhone ? true : undefined}>
        <FieldLabel htmlFor={`${idBase}-phone`}>Contact number</FieldLabel>
        <Input
          ref={receiverPhoneControlRef}
          id={`${idBase}-phone`}
          type="tel"
          inputMode="tel"
          value={receiverPhone}
          onChange={(event) => onReceiverPhoneChange(event.target.value)}
          placeholder="07X XXX XXXX"
          disabled={disabled}
          aria-invalid={errors.receiverPhone ? true : undefined}
        />
        <FieldDescription>
          Optional. Stored in international form.
        </FieldDescription>
        {errors.receiverPhone ? (
          <FieldError>{errors.receiverPhone}</FieldError>
        ) : null}
      </Field>
    </div>
  </>
);

/**
 * The confirm in front of an irreversible hand-over.
 *
 * **An issue cannot be undone**: it decrements `qty` and writes the units to
 * `issued`, which is terminal. There is no return procedure and no cancel
 * procedure, so the only recovery from a mistake is a new corrective row plus an
 * audit-log entry. A destructive-coloured button is a warning, not a
 * confirmation — and a warning the user has already read three paragraphs of by the
 * time they reach it.
 *
 * It names the **item**, the quantity and the receiver rather than saying "are you
 * sure", because those are the three facts somebody would need in order to notice
 * they had the wrong row open. It does not take `closeOnEscape`, so `Esc` and a
 * backdrop click are both refused.
 */
const IssueConfirmDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  qty: number;
  unit: string;
  itemName: string | null;
  receiverName: string;
  namedTags: number;
  isPending: boolean;
  onConfirm: () => void;
}> = ({
  open,
  onOpenChange,
  qty,
  unit,
  itemName,
  receiverName,
  namedTags,
  isPending,
  onConfirm,
}) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogTitle>
        Issue {counted(qty, unit)} of {itemName ?? "this item"} to{" "}
        {receiverName || "the receiver"}?
      </AlertDialogTitle>
      <AlertDialogDescription>
        {receiverName.length > 0
          ? `${itemName ?? "The item"} will leave the school permanently and ${receiverName} is the only record of who took it. The quantity on hand drops, the asset tags become terminal so the same device can never be issued twice, and there is no return or cancellation procedure.`
          : "The quantity on hand will drop, the asset tags become terminal, and there is no return or cancellation procedure."}{" "}
        {namedTags > 0
          ? `${namedTags} tag(s) are named and will be listed in full on the certificate.`
          : "No tags were named, so the oldest available units are claimed by the store's own record and printed on the certificate in full."}
      </AlertDialogDescription>
      <div className="flex justify-end gap-2">
        <AlertDialogCancel>Go back</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          onClick={onConfirm}
          loading={isPending}
        >
          Yes, issue it
        </AlertDialogAction>
      </div>
    </AlertDialogContent>
  </AlertDialog>
);

/**
 * The issue form's first half: the irreversibility notice, the item, the quantity
 * and the tags.
 *
 * Split out because the notice and the item picker are one thought — "this is
 * permanent, and here is what" — and because a form this long reads better as
 * three blocks than as one scrolling column.
 */
const IssueIdentityFields: React.FC<{
  itemId: string | null;
  onItemChange: (itemId: string | null) => void;
  qtyInput: string;
  onQtyChange: (value: string) => void;
  qtyError: string | undefined;
  unit: string | null;
  qtyControlRef: React.Ref<HTMLInputElement>;
  read: ReturnType<typeof useStockSnapshot>;
  delta: number;
  qty: number;
  unitTags: string[];
  onUnitTagsChange: (tags: string[]) => void;
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
  qty,
  unitTags,
  onUnitTagsChange,
  errors,
  disabled,
}) => (
  <>
    {/**
     * The irreversibility, stated before anything is filled in.
     *
     * So the copy leads with the consequence rather than with the definition.
     */}
    <InventoryInlineNotice
      tone="danger"
      title="This takes the stock off the school's books for good"
      description="Issuing reduces what the school holds straight away — the quantity drops and the asset tags become terminal, so the same projector can never be issued twice. Nothing here is signed off and there is no way back from this screen. To lend equipment to a member of staff instead, use the Loans tab; to write off property the school is destroying, raise a request on the Write-offs tab."
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
      label="Quantity being issued"
      unit={unit}
      error={qtyError}
      note={`Whole numbers only. The school stops holding these the moment this is saved.${
        unit ? ` This item is counted in “${unit}” on its register line.` : ""
      }`}
      controlRef={qtyControlRef}
      disabled={disabled}
    />

    <ProjectedQuantity
      read={read}
      delta={-Math.abs(delta)}
      afterLabel="After this issue"
    />

    <UnitPickerField
      itemId={itemId}
      value={unitTags}
      onChange={onUnitTagsChange}
      qty={qty}
      label="Which units"
      error={errors.uniqueItemIds}
      description="Leave empty and the oldest available units go, which is the order the store counts on. Name the tags when the devices are in front of you — every tag you name is printed in full on the receipt below, because on a record that is only evidence a shortened list is a shortened audit trail."
      disabled={disabled}
    />
  </>
);

/**
 * Everything the issue form knows, as one hook.
 *
 * `IssueDialog` was over 300 lines because it held eleven `useState` values, a
 * mutation, a discard guard, two parses and the whole JSX. The rules — the quantity
 * parse, the part-named-tag refusal, and the two nullable fields that must be sent as
 * an explicit `null` — are the part worth being able to read, and they were in the
 * middle of a component body.
 */
const useIssueForm = (onOpenChange: (open: boolean) => void) => {
  const queryClient = useQueryClient();
  const idBase = `issue-${useId().replaceAll(/[^\dA-Za-z_-]/gu, "")}`;
  const formId = `${idBase}-form`;

  const [itemId, setItemId] = useState<string | null>(null);
  const [qtyInput, setQtyInput] = useState("1");
  const [unitTags, setUnitTags] = useState<string[]>([]);
  const [receiverName, setReceiverName] = useState("");
  const [receiverDepartment, setReceiverDepartment] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [purpose, setPurpose] = useState("");
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [approvedBy, setApprovedBy] = useState("");
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

  const { controlRef, focusFirstInvalid } =
    useFirstInvalidFocus(ISSUE_FIELD_ORDER);

  const reset = () => {
    setItemId(null);
    setQtyInput("1");
    setUnitTags([]);
    setReceiverName("");
    setReceiverDepartment("");
    setReceiverPhone("");
    setPurpose("");
    setExpectedReturnDate("");
    setApprovedBy("");
    setNote("");
    setErrors({});
    setConfirmOpen(false);
    setAnnouncement("");
  };

  const isDirty =
    itemId !== null ||
    qtyInput !== "1" ||
    unitTags.length > 0 ||
    receiverName.trim().length > 0 ||
    receiverDepartment.trim().length > 0 ||
    receiverPhone.trim().length > 0 ||
    purpose.trim().length > 0 ||
    expectedReturnDate !== "" ||
    approvedBy.trim().length > 0 ||
    note.trim().length > 0;

  const { requestClose: handleRequestClose, confirmNode } = useDiscardGuard(
    isDirty,
    () => {
      reset();
      onOpenChange(false);
    }
  );

  const issueMutation = useMutation(
    orpc.inventory.issues.create.mutationOptions({
      onSuccess: async (result) => {
        toast.success(
          `Issued ${pluralUnits(result.qty)} of ${result.itemName} to ${result.receiverName} — ${pluralUnits(result.remainingQty)} now on hand`
        );
        reset();
        onOpenChange(false);
        /**
         * `issue`, not `stock` or `disposal`. The register loses the units, the tag
         * register loses them from the available pool and the issue list gains the
         * certificate — and, as everywhere else, the change log gains the row this just
         * wrote, which is the one the tab's own heading promises.
         */
        await invalidateInventory(queryClient, "issue");
      },
      onError: (error) => {
        toast.error(
          formatApiErrorMessage(error, "Could not record this issue")
        );
        setConfirmOpen(false);
        setAnnouncement(
          "The issue was not recorded. Everything you have typed is still here, including the receiver's details."
        );
        const fieldErrors = fieldErrorsFromApi(error);
        if (Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors);
          focusFirstInvalid(fieldErrors);
        }
      },
    })
  );

  /** One parse, used by both the submit gate and again by the confirmed commit. */
  const parseForm = () =>
    v.safeParse(issueSchema, {
      itemId: itemId ?? "",
      qty,
      receiverName,
      receiverDepartment: receiverDepartment.trim() || null,
      receiverPhone: receiverPhone.trim() || null,
      purpose,
      expectedReturnDate: expectedReturnDate || null,
      approvedBy: approvedBy.trim() || null,
      note: note.trim() || null,
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

    if (!quantity.ok && quantity.problem !== "empty") {
      reject(quantity.message, "qty");
      return;
    }

    const result = parseForm();

    if (!result.success) {
      const fieldErrors = issuesToFieldErrors(result);
      setErrors(fieldErrors);
      focusFirstInvalid(fieldErrors);
      return;
    }
    setErrors({});

    /**
     * A part-named tag list is refused here rather than at the server.
     *
     * `UnitPickerField` says "1 of 3 selected — 2 still to choose" and lets the form
     * through, and `getAvailableUnits` then answers `CONFLICT` — *"Only 1 unit(s) are
     * available"* — which is false: the item has three. Naming tags is optional here,
     * so the refusal names the two ways out.
     */
    const tagMismatch = partNamedTagMessage(unitTags.length, qty, "issued");
    if (tagMismatch !== null) {
      reject(tagMismatch, "uniqueItemIds");
      return;
    }

    // Confirm second. An `AlertDialog` that opens for a form which could not have been
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
      itemId: parsedItemId,
      qty: parsedQty,
      receiverName: parsedReceiver,
      purpose: parsedPurpose,
      receiverPhone: phone,
      expectedReturnDate: expected,
      receiverDepartment: department,
      approvedBy: approved,
      note: noteText,
      uniqueItemIds,
    } = result.output;

    issueMutation.mutate({
      itemId: parsedItemId,
      qty: parsedQty,
      receiverName: parsedReceiver,
      purpose: parsedPurpose,
      /**
       * Sent as an explicit `null` when the field was blank, and that is a readability
       * choice rather than a workaround: `drizzle-valibot` wraps every nullable column
       * in both `nullable` and `optional`, so omitting the key is perfectly valid and
       * nothing here is compensating for a required key. `null` is written out because
       * "we were not told" is a statement about the certificate, and an absent key is a
       * statement about the form.
       */
      receiverPhone: phone ?? null,
      expectedReturnDate: expected ?? null,
      ...(department ? { receiverDepartment: department } : {}),
      ...(approved ? { approvedBy: approved } : {}),
      ...(noteText ? { note: noteText } : {}),
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
    receiverName,
    receiverDepartment,
    receiverPhone,
    purpose,
    expectedReturnDate,
    approvedBy,
    note,
    errors,
    confirmOpen,
    announcement,
    read,
    unit,
    quantity,
    isPending: issueMutation.isPending,
    handleRequestClose,
    confirmNode,
    controlRef,
    handleSubmit,
    handleCommit,
    handleConfirmOpenChange: setConfirmOpen,
    handleItemChange: setItemId,
    handleQtyChange: (value: string) => {
      setAnnouncement("");
      setQtyInput(value);
    },
    handleUnitTagsChange: setUnitTags,
    handleReceiverNameChange: setReceiverName,
    handleReceiverDepartmentChange: setReceiverDepartment,
    handleReceiverPhoneChange: setReceiverPhone,
    handlePurposeChange: setPurpose,
    handleExpectedReturnDateChange: setExpectedReturnDate,
    handleApprovedByChange: setApprovedBy,
    handleNoteChange: setNote,
  };
};

/**
 * Hand stock out of the store permanently.
 *
 * `receiverPhone` and `expectedReturnDate` are the two fields where the form and the
 * wire disagree about "blank", and both are handled on the face of the dialog rather
 * than left to the server.
 */
export const IssueDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const form = useIssueForm(onOpenChange);
  const { unit, read, quantity } = form;
  const namedItem = read.status === "ready" ? read.item.itemName : null;

  return (
    <>
      <LifecycleDialog
        open={open}
        onOpenChange={(next) => {
          /**
           * Nothing closes underneath the confirm. `Esc` is refused by the `AlertDialog`
           * and would otherwise also reach this `onOpenChange`, which would stack the
           * discard guard on top of it — two questions at once, with the destructive one
           * hidden behind the tidier one.
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
        title="Issue stock out of the store"
        description="Hand equipment to somebody outside the school&rsquo;s daily use, and record who received it"
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
              data-icon="inline-start"
            >
              <IconArrowUpRight aria-hidden="true" data-icon="inline-start" />
              Issue stock
            </Button>
          </>
        }
      >
        <FieldGroup>
          <IssueIdentityFields
            itemId={form.itemId}
            onItemChange={form.handleItemChange}
            qtyInput={form.qtyInput}
            onQtyChange={form.handleQtyChange}
            qtyError={form.qtyError}
            unit={unit}
            qtyControlRef={form.controlRef("qty")}
            read={read}
            delta={quantity.ok ? quantity.value : 0}
            qty={form.qty}
            unitTags={form.unitTags}
            onUnitTagsChange={form.handleUnitTagsChange}
            errors={form.errors}
            disabled={form.isPending}
          />

          <IssueReceiverFields
            idBase={form.idBase}
            receiverName={form.receiverName}
            onReceiverNameChange={form.handleReceiverNameChange}
            receiverNameControlRef={form.controlRef("receiverName")}
            receiverDepartment={form.receiverDepartment}
            onReceiverDepartmentChange={form.handleReceiverDepartmentChange}
            receiverPhone={form.receiverPhone}
            onReceiverPhoneChange={form.handleReceiverPhoneChange}
            receiverPhoneControlRef={form.controlRef("receiverPhone")}
            errors={form.errors}
            disabled={form.isPending}
          />

          <IssueTermsFields
            idBase={form.idBase}
            purpose={form.purpose}
            onPurposeChange={form.handlePurposeChange}
            purposeControlRef={form.controlRef("purpose")}
            expectedReturnDate={form.expectedReturnDate}
            onExpectedReturnDateChange={form.handleExpectedReturnDateChange}
            expectedReturnControlRef={form.controlRef("expectedReturnDate")}
            approvedBy={form.approvedBy}
            onApprovedByChange={form.handleApprovedByChange}
            note={form.note}
            onNoteChange={form.handleNoteChange}
            errors={form.errors}
            disabled={form.isPending}
          />
        </FieldGroup>
      </LifecycleDialog>

      {/**
       * A sibling of `Dialog`, not a child of `DialogContent`. It used to be rendered
       * inside the dialog's popup, inside a `modal` focus manager that was already
       * trapping — the confirm was competing with the form for the same focus scope.
       * Portalled either way, but the structure was wrong.
       */}
      <IssueConfirmDialog
        open={form.confirmOpen}
        onOpenChange={form.handleConfirmOpenChange}
        qty={form.qty}
        unit={unit ?? "unit"}
        itemName={namedItem}
        receiverName={form.receiverName.trim()}
        namedTags={form.unitTags.length}
        isPending={form.isPending}
        onConfirm={form.handleCommit}
      />
      {form.confirmNode}
    </>
  );
};
