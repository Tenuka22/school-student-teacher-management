"use client";

/**
 * Lend stock to a member of staff **or a student**. It comes back.
 *
 * A borrow is the one inventory movement that is **not** a movement of stock.
 * Nothing leaves the school, so `inventoryItem.qty` does not change — only
 * `borrowedQty` rises. The return half is in `loans-ledger.tsx`, beside the row that
 * opens it, and the reason it lives there rather than here is in that file.
 *
 * ## A loan is owed to a member of staff **or to a student**
 *
 * `createBorrow` names its borrower as a discriminated union —
 * `{ type: "staff", staffId } | { type: "student", studentId }` — and every read
 * comes back as one `InventoryBorrower` (`type`, `id`, `name`, `reference`,
 * `className`). That is not a cosmetic change: the flat pair it replaced could only
 * ever be right for half the rows in the table, so a loan to a pupil used to render
 * with a blank holder on a page whose entire job is to say who is holding what.
 *
 * The lend form builds the payload through `borrowerInputFrom`, so the union's case
 * is decided once, in one place, and no caller can send a half-populated borrower.
 *
 * **A student is a recorded borrower and never an actor.** The `student` table has
 * no `userId`, so a student can never sign in; the loan is opened by staff here and
 * closed by staff in the return dialog. There is no missing student-facing half of
 * this feature.
 */
import { isoDateSchema } from "@school-student-teacher-management/db/schema/primitives";
import { Button } from "@school-student-teacher-management/ui/components/button";
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
  FieldSet,
  FieldLegend,
} from "@school-student-teacher-management/ui/components/field";
import { Input } from "@school-student-teacher-management/ui/components/input";
import { Textarea } from "@school-student-teacher-management/ui/components/textarea";
import { IconAlertTriangle, IconPlus } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import {
  focusFirstInvalidField,
  useFormIdBase,
} from "@/components/staff/inventory/custody-form";
import {
  isEntered,
  parseQuantity,
} from "@/components/staff/inventory/quantity";
import type { QuantityParse } from "@/components/staff/inventory/quantity";
import type { BorrowerChoice } from "@/components/staff/inventory/shared";
import {
  BorrowerPickerField,
  InventoryInlineNotice,
  ItemPickerField,
  UnitPickerField,
  borrowerInputFrom,
  describeBorrowerChoice,
  invalidateInventory,
} from "@/components/staff/inventory/shared";
import {
  formatDate,
  issuesToFieldErrors,
  useDiscardGuard,
} from "@/components/staff/inventory/stock-form-helpers";
import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

/**
 * Who is taking it, as the **form** holds it.
 *
 * A `v.variant` on `type`, mirroring `createBorrow`'s own `borrowerSchema` one
 * layer up: the two arms differ in the field they carry, so a validation failure on
 * either one is reported against the key this picker is mounted on, and the parsed
 * output is the exact object `borrowerInputFrom` turns into the request.
 *
 * The message is deliberately **mode-agnostic** ("choose who is taking it"). The
 * mode lives in the picker's own state, and a form schema that tried to spell a
 * per-mode message would have to be told which mode the picker was in — a fact this
 * dialog does not own, and coupling the two to get a nicer error message is how a
 * dialog ends up telling the clerk they have not chosen a student when they have not
 * chosen a *teacher*. The field's own label already says which kind of person it is
 * asking for.
 */
const borrowerChoiceSchema = v.variant("type", [
  v.object({
    type: v.literal("staff"),
    id: v.pipe(v.string(), v.minLength(1, "Choose who is taking it")),
  }),
  v.object({
    type: v.literal("student"),
    id: v.pipe(v.string(), v.minLength(1, "Choose who is taking it")),
  }),
]);

const borrowSchema = v.object({
  itemId: v.pipe(v.string(), v.minLength(1, "Choose the item to lend")),
  qty: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(1, "Enter how many units are going out")
  ),
  borrower: borrowerChoiceSchema,
  purpose: v.pipe(v.string(), v.trim(), v.minLength(1, "Say what it is for")),
  expectedReturnDate: isoDateSchema,
  approvedBy: v.optional(v.string()),
  note: v.optional(v.string()),
  uniqueItemIds: v.optional(v.array(v.string())),
});

/**
 * The terms of the loan: what it is for, when it is due back, and who agreed to it.
 *
 * Split out because `expectedReturnDate` is the one field here that is required for
 * a reason worth stating on its own — a loan with no date to be late against cannot
 * be chased at the end of term, which is the whole reason a loan has to be
 * attributable to *a person* in the first place, and that person is now either a
 * member of staff or a student. That argument belongs next to the field, not in a
 * banner, and it is deliberately phrased without the kind of person: a laptop that
 * has to be chased back at the end of term has to be chased back from somebody,
 * whichever table they are in.
 *
 * **Every id arrives as a prop, and none of them is a constant.** This block is
 * four controls with four labels and four error regions; a module-level id put the
 * same four into the document again the moment a second instance mounted, and a
 * duplicate `id` is not a cosmetic problem — the second `<label for>` then activates
 * the *first* control, so a clerk fills in the due date and gets the note.
 */
interface BorrowTermsFieldsProps {
  ids: {
    purpose: string;
    expectedReturnDate: string;
    approvedBy: string;
    note: string;
  };
  purpose: string;
  onPurposeChange: (value: string) => void;
  expectedReturnDate: string;
  onExpectedReturnDateChange: (value: string) => void;
  approvedBy: string;
  onApprovedByChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  errors: Record<string, string | undefined>;
  disabled: boolean;
}

const BorrowTermsFields: React.FC<BorrowTermsFieldsProps> = ({
  ids,
  purpose,
  onPurposeChange,
  expectedReturnDate,
  onExpectedReturnDateChange,
  approvedBy,
  onApprovedByChange,
  note,
  onNoteChange,
  errors,
  disabled,
}) => (
  <>
    <Field data-invalid={errors.purpose ? true : undefined}>
      <FieldLabel htmlFor={ids.purpose} required>
        Purpose
      </FieldLabel>
      <Textarea
        id={ids.purpose}
        value={purpose}
        onChange={(event) => onPurposeChange(event.target.value)}
        rows={2}
        placeholder="e.g. Grade 11 practical sessions, weeks 3-6"
        disabled={disabled}
        aria-invalid={errors.purpose ? true : undefined}
        aria-describedby={errors.purpose ? `${ids.purpose}-error` : undefined}
      />
      <FieldDescription>
        Searchable from the loans list, so a clerk looking for &ldquo;who has
        the tripod&rdquo; can find it by what it was for.
      </FieldDescription>
      <FieldError id={`${ids.purpose}-error`}>{errors.purpose}</FieldError>
    </Field>

    <Field data-invalid={errors.expectedReturnDate ? true : undefined}>
      <FieldLabel htmlFor={ids.expectedReturnDate} required>
        Due back on
      </FieldLabel>
      <Input
        id={ids.expectedReturnDate}
        type="date"
        value={expectedReturnDate}
        onChange={(event) => onExpectedReturnDateChange(event.target.value)}
        disabled={disabled}
        aria-invalid={errors.expectedReturnDate ? true : undefined}
        aria-describedby={
          errors.expectedReturnDate
            ? `${ids.expectedReturnDate}-error`
            : undefined
        }
      />
      <FieldDescription>
        Required. This is the date the loan is late against &mdash; the overdue
        flag on the list is computed from it, and a loan with no date cannot be
        chased.
      </FieldDescription>
      <FieldError id={`${ids.expectedReturnDate}-error`}>
        {errors.expectedReturnDate}
      </FieldError>
    </Field>

    {/**
     * **Not "Approved by".** A loan is recorded, not approved: nothing on this form
     * is gated on this field and the server never reads it. The label carries the
     * consequence, because the label is what a reader of the loan record in a year's
     * time actually sees.
     */}
    <Field>
      <FieldLabel htmlFor={ids.approvedBy}>
        Authorised by (recorded, not enforced)
      </FieldLabel>
      <Input
        id={ids.approvedBy}
        value={approvedBy}
        onChange={(event) => onApprovedByChange(event.target.value)}
        placeholder="Name of the person who agreed to this"
        disabled={disabled}
      />
      <FieldDescription>
        Written onto the loan record beside your own name. Nothing is checked
        against it and nothing is refused without it &mdash; it is a record of
        who agreed, not an approval.
      </FieldDescription>
    </Field>

    <Field>
      <FieldLabel htmlFor={ids.note}>Note</FieldLabel>
      <Textarea
        id={ids.note}
        value={note}
        onChange={(event) => onNoteChange(event.target.value)}
        rows={2}
        disabled={disabled}
      />
    </Field>
  </>
);

/**
 * What is going out, to whom, and in how many units.
 *
 * The first half of the lend form, split out beside `BorrowTermsFields` for one
 * reason: **the order the clerk fills this in is the order the questions arrive.**
 * You cannot say how many projectors or name the person carrying them before you
 * have picked the projector, so this block reads top to bottom as a sequence (item →
 * how many → which tags → who) and `BorrowTermsFields` reads as the paperwork that
 * follows.
 *
 * **The quantity's verdict is a prop, not a re-parse.** `parseQuantity` is the one
 * place in the feature that knows why a count is refused, and it is called once in
 * the dialog so the submit gate, the field's `aria-invalid` and the unit picker's
 * expected count cannot disagree about whether "2.7" is two or a mistake.
 */
interface BorrowSetupFieldsProps {
  quantity: QuantityParse;
  quantityFieldId: string;
  itemId: string | null;
  onItemChange: (value: string | null) => void;
  isNotBorrowable: boolean;
  notBorrowableItemName: string;
  qtyInput: string;
  onQtyInputChange: (value: string) => void;
  unitTags: string[];
  onUnitTagsChange: (value: string[]) => void;
  borrower: BorrowerChoice | null;
  onBorrowerChange: (value: BorrowerChoice | null) => void;
  errors: Record<string, string | undefined>;
  disabled: boolean;
}

const BorrowSetupFields: React.FC<BorrowSetupFieldsProps> = ({
  quantity,
  quantityFieldId,
  itemId,
  onItemChange,
  isNotBorrowable,
  notBorrowableItemName,
  qtyInput,
  onQtyInputChange,
  unitTags,
  onUnitTagsChange,
  borrower,
  onBorrowerChange,
  errors,
  disabled,
}) => {
  const quantityError =
    isEntered(quantity) && !quantity.ok ? quantity.message : errors.qty;

  return (
    <>
      <ItemPickerField
        value={itemId}
        onChange={onItemChange}
        label="Item *"
        description="Only items with units on the shelf are offered."
        error={errors.itemId}
        disabled={disabled}
        onlyAvailable
      />

      {isNotBorrowable ? (
        <InventoryInlineNotice
          tone="danger"
          title="This item is not on loan"
          description={`${notBorrowableItemName} is marked as not lendable, so the server will refuse it. A fixed projector, a bolt-down set of benches or the school server is issued to somebody or written off — it is not something a person carries off-site and brings back. Pick a different item, or use the Issues tab.`}
        />
      ) : null}

      <Field data-invalid={quantityError ? true : undefined}>
        <FieldLabel htmlFor={quantityFieldId} required>
          Quantity going out
        </FieldLabel>
        <Input
          id={quantityFieldId}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={qtyInput}
          onChange={(event) => onQtyInputChange(event.target.value)}
          disabled={disabled}
          aria-invalid={quantityError ? true : undefined}
          aria-describedby={
            quantityError ? `${quantityFieldId}-error` : undefined
          }
        />
        <FieldDescription>
          Taken off the shelf, not off the books — the school still owns these
          units, so the quantity on hand does not change. Whole numbers only:
          this is a count of tagged things going out of a cupboard.
        </FieldDescription>
        <FieldError id={`${quantityFieldId}-error`}>{quantityError}</FieldError>
      </Field>

      <UnitPickerField
        itemId={itemId}
        value={unitTags}
        onChange={onUnitTagsChange}
        qty={quantity.ok ? quantity.value : 0}
        label="Which units"
        error={errors.uniqueItemIds}
        description="Leave empty and the oldest available units go, which is the order the store counts on. Name as many tags as the quantity, or leave the field empty — a part-named list is refused rather than half-applied."
        disabled={disabled}
      />

      <BorrowerPickerField
        value={borrower}
        onChange={onBorrowerChange}
        label="Borrower"
        required
        description="A loan is owed back to one person and is opened and closed by staff either way — a student on the register can hold a loan but has no login of their own, because the student table carries no user account."
        error={errors.borrower}
        disabled={disabled}
      />
    </>
  );
};

export interface BorrowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Everything the submit gate needs, gathered so the gate can be a pure function. */
interface BorrowSubmission {
  itemId: string | null;
  itemName: string;
  isNotBorrowable: boolean;
  quantity: QuantityParse;
  unitTags: string[];
  borrower: BorrowerChoice | null;
  purpose: string;
  expectedReturnDate: string;
  approvedBy: string;
  note: string;
}

/**
 * The whole submit gate, as one pure function.
 *
 * **It is a function and not part of the component because there are two kinds of
 * failure here and only one of them has a field.** A missing purpose, an unparseable
 * date and an unchosen borrower are all "this control"; an item marked *not
 * lendable* and a part-named tag list are not — the first is a fact about the item
 * the clerk cannot change from this form, and the second is a disagreement between
 * the quantity and the tag picker that belongs to neither. Filing those two under a
 * field is what the older version of this file did, and the effect was a clerk who
 * pressed the button, saw nothing happen, and had nowhere to look for the reason.
 *
 * So the result is a tagged union: `ok` carries the parsed request, and `refused`
 * carries *both* shapes of problem so the caller can file each one where it belongs
 * and focus the first invalid control.
 */
type BorrowSubmissionResult =
  | {
      ok: true;
      request: {
        itemId: string;
        qty: number;
        borrower: { type: "staff" | "student"; id: string };
        purpose: string;
        expectedReturnDate: string;
        uniqueItemIds?: string[];
        approvedBy?: string;
        note?: string;
      };
    }
  | {
      ok: false;
      /** Problems that belong to a control, keyed by that control's schema key. */
      fieldErrors: Record<string, string | undefined>;
      /** Problems that belong to the submission, in the order they should be read. */
      problems: string[];
    };

/**
 * The three refusals that belong to the submission rather than to a control.
 *
 * Split out of `checkBorrowSubmission` because they are a *list*, not a sequence of
 * gates: a clerk who has both a non-lendable item and a mistyped quantity should be
 * told both, in one place, in one pass — and a function that returned on the first
 * one would only ever tell them one.
 */
const submissionRefusals = (submission: BorrowSubmission): string[] => {
  const { itemName, isNotBorrowable, quantity, unitTags } = submission;
  const problems: string[] = [];

  if (isNotBorrowable) {
    problems.push(
      `${itemName} is marked as not lendable, so the server will refuse this loan. Use the Issues tab to hand it out, or Remove from stock if it is beyond repair.`
    );
  }

  if (isEntered(quantity) && !quantity.ok) {
    problems.push(quantity.message);
  }

  /*
   * A part-named tag list is refused here rather than at the server, which would
   * answer "Only 1 unit(s) are available" for an item that has three. Naming tags is
   * optional, so the refusal names the two ways out — and it is skipped entirely when
   * the quantity itself is already wrong, because one sentence about the tags and
   * another about the count would send the clerk looking at the wrong field.
   */
  const tagsDisagree =
    quantity.ok && unitTags.length > 0 && unitTags.length !== quantity.value;
  if (quantity.ok && tagsDisagree) {
    problems.push(
      `You named ${unitTags.length} tag${unitTags.length === 1 ? "" : "s"} but the quantity is ${quantity.value}. Name ${quantity.value} tag${quantity.value === 1 ? "" : "s"}, or clear this field and the oldest ${quantity.value} will be lent for you.`
    );
  }

  return problems;
};

const checkBorrowSubmission = (
  submission: BorrowSubmission
): BorrowSubmissionResult => {
  const {
    itemId,
    quantity,
    unitTags,
    borrower,
    purpose,
    expectedReturnDate,
    approvedBy,
    note,
  } = submission;

  const problems = submissionRefusals(submission);

  if (problems.length > 0) {
    return { ok: false, fieldErrors: {}, problems };
  }

  const result = v.safeParse(borrowSchema, {
    itemId: itemId ?? "",
    qty: quantity.ok ? quantity.value : 0,
    /**
     * The unselected case is spelled as a *staff* arm holding an empty id, which
     * sounds arbitrary and is not: it is the arm the picker opens on, it fails
     * `minLength(1)` on the one field the message is about, and the error lands on
     * `borrower` — the key the picker is mounted on — whichever arm was actually
     * active. An absent `type` would have produced a variant-level error with no
     * field to hang it on.
     */
    borrower: borrower
      ? { type: borrower.type, id: borrower.id }
      : { type: "staff", id: "" },
    purpose,
    expectedReturnDate,
    approvedBy: approvedBy.trim() || undefined,
    note: note.trim() || undefined,
    uniqueItemIds: unitTags.length > 0 ? unitTags : undefined,
  });

  if (!result.success) {
    return {
      ok: false,
      fieldErrors: issuesToFieldErrors(result),
      problems: [],
    };
  }

  return {
    ok: true,
    request: {
      itemId: result.output.itemId,
      qty: result.output.qty,
      borrower: result.output.borrower,
      purpose: result.output.purpose,
      expectedReturnDate: result.output.expectedReturnDate,
      ...(result.output.uniqueItemIds
        ? { uniqueItemIds: result.output.uniqueItemIds }
        : {}),
      ...(result.output.approvedBy
        ? { approvedBy: result.output.approvedBy }
        : {}),
      ...(result.output.note ? { note: result.output.note } : {}),
    },
  };
};

/**
 * The form body, so `BorrowDialog` is the state, the mutation and the chrome rather
 * than also being the place eleven controls are wired up.
 *
 * The handlers arrive as a single `onFieldChange` rather than eleven callbacks: every
 * one of them does the same two things — store the value, and clear that field's
 * error — and eleven near-identical closures in the parent was the reason the
 * component had grown past three hundred lines.
 */
const BorrowFormBody: React.FC<{
  formId: string;
  formRef: React.Ref<HTMLFormElement>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  isBusy: boolean;
  ids: {
    quantity: string;
    purpose: string;
    expectedReturnDate: string;
    approvedBy: string;
    note: string;
  };
  values: {
    itemId: string | null;
    itemName: string;
    isNotBorrowable: boolean;
    quantity: QuantityParse;
    qtyInput: string;
    unitTags: string[];
    borrower: BorrowerChoice | null;
    purpose: string;
    expectedReturnDate: string;
    approvedBy: string;
    note: string;
  };
  handlers: BorrowFieldHandlers;
  errors: Record<string, string | undefined>;
}> = ({ formId, formRef, onSubmit, isBusy, ids, values, handlers, errors }) => (
  <form
    ref={formRef}
    id={formId}
    onSubmit={onSubmit}
    aria-busy={isBusy || undefined}
    className="flex-1 space-y-6 overflow-y-auto px-6 py-4"
  >
    <FieldGroup>
      <InventoryInlineNotice
        tone="info"
        title="A loan is not a movement of stock"
        description="The school still owns what goes out on loan, so the quantity on hand does not change — only the count of units out with a borrower rises. The device comes back, and when it does the return step records what condition it came back in."
      />

      <BorrowSetupFields
        itemId={values.itemId}
        onItemChange={handlers.handleItemIdChange}
        isNotBorrowable={values.isNotBorrowable}
        notBorrowableItemName={values.itemName}
        qtyInput={values.qtyInput}
        onQtyInputChange={handlers.handleQtyInputChange}
        unitTags={values.unitTags}
        onUnitTagsChange={handlers.handleUnitTagsChange}
        borrower={values.borrower}
        onBorrowerChange={handlers.handleBorrowerChange}
        errors={errors}
        disabled={isBusy}
        quantity={values.quantity}
        quantityFieldId={ids.quantity}
      />

      <FieldSet>
        <FieldLegend>The paperwork</FieldLegend>
        <FieldGroup>
          <BorrowTermsFields
            ids={{
              purpose: ids.purpose,
              expectedReturnDate: ids.expectedReturnDate,
              approvedBy: ids.approvedBy,
              note: ids.note,
            }}
            purpose={values.purpose}
            onPurposeChange={handlers.handlePurposeChange}
            expectedReturnDate={values.expectedReturnDate}
            onExpectedReturnDateChange={handlers.handleExpectedReturnDateChange}
            approvedBy={values.approvedBy}
            onApprovedByChange={handlers.handleApprovedByChange}
            note={values.note}
            onNoteChange={handlers.handleNoteChange}
            errors={errors}
            disabled={isBusy}
          />
        </FieldGroup>
      </FieldSet>
    </FieldGroup>
  </form>
);

/** Every control's setter, so `BorrowFormBody` is not handed eleven callbacks. */
interface BorrowFieldHandlers {
  handleItemIdChange: (value: string | null) => void;
  handleQtyInputChange: (value: string) => void;
  handleUnitTagsChange: (value: string[]) => void;
  handleBorrowerChange: (value: BorrowerChoice | null) => void;
  handlePurposeChange: (value: string) => void;
  handleExpectedReturnDateChange: (value: string) => void;
  handleApprovedByChange: (value: string) => void;
  handleNoteChange: (value: string) => void;
}

/**
 * The whole lend form's state, mutation and guard, as one hook.
 *
 * **It is a hook and not part of the component because the component is then
 * nothing but chrome.** Every rule that matters here is a rule about *when* a write
 * may happen — the discard guard, the double-submit guard, the two shapes of refused
 * submit, the busy sentence — and those rules are hard to check when they are
 * interleaved with forty lines of JSX.
 *
 * **`clearFieldError` is the one behaviour every handler shares**, and it is the one
 * that used not happen: an error stayed on screen after the clerk had fixed the
 * field, so a form could show "Say what it is for" next to a perfectly good purpose
 * until the next submit. The form-level problems are deliberately *not* cleared
 * here — they are a statement about the submission as a whole, so it is the next
 * submit that replaces them, and clearing them on the first character of an
 * unrelated field would hide the one explanation nobody has been shown yet.
 */
const useBorrowForm = (onOpenChange: (open: boolean) => void) => {
  const queryClient = useQueryClient();
  const idBase = useFormIdBase();
  const formId = `${idBase}-form`;
  const formRef = useRef<HTMLFormElement>(null);

  const [itemId, setItemId] = useState<string | null>(null);
  const [qtyInput, setQtyInput] = useState("1");
  const [unitTags, setUnitTags] = useState<string[]>([]);
  const [borrower, setBorrower] = useState<BorrowerChoice | null>(null);
  const [purpose, setPurpose] = useState("");
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [submissionProblems, setSubmissionProblems] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const quantity = parseQuantity(qtyInput);

  /**
   * The `borrowable` check, done here rather than left to a toast.
   *
   * `createBorrow` refuses a non-borrowable item with "This item is not on loan — it
   * can only be issued or written off", and the item's own `borrowable` flag exists
   * precisely so a storekeeper does not have to remember which of a fixed hall
   * projector, a bolt-down set of benches and the school server each one is.
   *
   * The shared `ItemPickerField` greys out items with nothing *available*; it does
   * not know about `borrowable`, and a clerk hunting for a fixed projector deserves
   * an explanation where they are looking rather than after a round trip.
   */
  const itemQuery = useQuery(
    orpc.inventory.items.get.queryOptions({
      input: { itemId: itemId ?? "" },
      enabled: itemId !== null,
    })
  );

  const isNotBorrowable =
    itemQuery.data !== undefined && !itemQuery.data.borrowable;
  const itemName = itemQuery.data?.name ?? "This item";

  const reset = () => {
    setItemId(null);
    setQtyInput("1");
    setUnitTags([]);
    setBorrower(null);
    setPurpose("");
    setExpectedReturnDate("");
    setApprovedBy("");
    setNote("");
    setErrors({});
    setSubmissionProblems([]);
    setIsSubmitting(false);
  };

  const isDirty =
    itemId !== null ||
    qtyInput !== "1" ||
    unitTags.length > 0 ||
    borrower !== null ||
    purpose.trim().length > 0 ||
    expectedReturnDate !== "" ||
    approvedBy.trim().length > 0 ||
    note.trim().length > 0;

  const { requestClose, confirmNode } = useDiscardGuard(isDirty, () => {
    reset();
    onOpenChange(false);
  });

  const borrowMutation = useMutation(
    orpc.inventory.borrows.create.mutationOptions({
      onSuccess: async (result) => {
        const onLoan = result.item.borrowedQty;
        /**
         * `result.borrower`, not a name the client kept. The server resolved the
         * person before the insert and handed the resolved shape back, so the toast
         * says who the loan is to without this file holding a second directory of
         * staff and students — and it says it the same way for a pupil as for a
         * colleague, class included.
         */
        toast.success(
          `Lent ${result.qty} × ${result.itemName} to ${describeBorrowerChoice(
            result.borrower
          )} — ${onLoan} now out on loan, due back ${formatDate(
            result.expectedReturnDate
          )}`
        );
        reset();
        onOpenChange(false);
        /**
         * `borrow`, not `return`. The loan's own record is the new row, the units
         * leave the available pool and the change log gains the row this just wrote —
         * the two scopes are deliberately identical because a check-out and a
         * check-in dirty exactly the same set.
         */
        await invalidateInventory(queryClient, "borrow");
      },
      onError: (error) => {
        toast.error(formatApiErrorMessage(error, "Could not record this loan"));
      },
    })
  );

  const busy = borrowMutation.isPending || isSubmitting;

  const clearFieldError = (key: string) => {
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  };

  const handlers: BorrowFieldHandlers = {
    handleItemIdChange: (value) => {
      setItemId(value);
      clearFieldError("itemId");
    },
    handleQtyInputChange: (value) => {
      setQtyInput(value);
      clearFieldError("qty");
    },
    handleUnitTagsChange: (value) => {
      setUnitTags(value);
      clearFieldError("uniqueItemIds");
    },
    handleBorrowerChange: (value) => {
      setBorrower(value);
      clearFieldError("borrower");
    },
    handlePurposeChange: (value) => {
      setPurpose(value);
      clearFieldError("purpose");
    },
    handleExpectedReturnDateChange: (value) => {
      setExpectedReturnDate(value);
      clearFieldError("expectedReturnDate");
    },
    handleApprovedByChange: setApprovedBy,
    handleNoteChange: setNote,
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) {
      return;
    }

    const verdict = checkBorrowSubmission({
      itemId,
      itemName,
      isNotBorrowable,
      quantity,
      unitTags,
      borrower,
      purpose,
      expectedReturnDate,
      approvedBy,
      note,
    });

    if (!verdict.ok) {
      setErrors(verdict.fieldErrors);
      setSubmissionProblems(verdict.problems);
      focusFirstInvalidField(formRef.current);
      return;
    }

    setErrors({});
    setSubmissionProblems([]);
    setIsSubmitting(true);

    borrowMutation.mutate({
      ...verdict.request,
      // The one expression that produces the request's borrower, for either kind.
      borrower: borrowerInputFrom(verdict.request.borrower),
    });
  };

  const ids = {
    quantity: `${idBase}-quantity`,
    purpose: `${idBase}-purpose`,
    expectedReturnDate: `${idBase}-due`,
    approvedBy: `${idBase}-authorised`,
    note: `${idBase}-note`,
  };

  const values = {
    itemId,
    itemName,
    isNotBorrowable,
    quantity,
    qtyInput,
    unitTags,
    borrower,
    purpose,
    expectedReturnDate,
    approvedBy,
    note,
  };

  /**
   * What the strip above the buttons says, in words.
   *
   * Three states, and a bare live region cannot carry a different tone for two of
   * them, so this is a named function with early returns: a refusal is the
   * destructive tone, a set of field errors is a neutral nudge, a write in flight is
   * a sentence, and an idle form says nothing at all.
   */
  const status = ((): { text: string; isRefusal: boolean } => {
    if (submissionProblems.length > 0) {
      return { text: submissionProblems.join(" "), isRefusal: true };
    }
    if (busy) {
      return { text: "Recording the loan…", isRefusal: false };
    }
    if (Object.keys(errors).length > 0) {
      return { text: "Check the marked fields above.", isRefusal: false };
    }
    return { text: "", isRefusal: false };
  })();

  return {
    busy,
    confirmNode,
    errors,
    formId,
    formRef,
    handleSubmit,
    handlers,
    ids,
    requestClose,
    status,
    values,
  };
};

export const BorrowDialog = ({ open, onOpenChange }: BorrowDialogProps) => {
  const {
    busy,
    confirmNode,
    errors,
    formId,
    formRef,
    handleSubmit,
    handlers,
    ids,
    requestClose,
    status,
    values,
  } = useBorrowForm(onOpenChange);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next || busy) {
            onOpenChange(next);
            return;
          }
          requestClose();
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle>Lend stock to a person</DialogTitle>
            <DialogDescription>
              Record who is holding school property &mdash; a member of staff or
              a student &mdash; and the date it is due back
            </DialogDescription>
          </DialogHeader>

          <BorrowFormBody
            errors={errors}
            formId={formId}
            formRef={formRef}
            handlers={handlers}
            ids={ids}
            isBusy={busy}
            onSubmit={handleSubmit}
            values={values}
          />

          {/*
            The submission's own problems, above the buttons, in an `<output>` — which
            carries an implicit `role="status"`, so the sentence is announced when it
            appears. `loading` empties the submit button's own label, so without a
            visible strip the only sign of a slow write on a school LAN is a spinner
            where a sentence used to be, and a silent submit is the definition of a
            dangling state.
          */}
          {status.text ? (
            <output
              className={`flex shrink-0 items-start gap-2 border-t px-6 py-2.5 text-sm ${
                status.isRefusal ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {status.isRefusal ? (
                <IconAlertTriangle
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
              ) : null}
              <span>{status.text}</span>
            </output>
          ) : null}

          <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={requestClose}
              disabled={busy}
            >
              Cancel
            </Button>
            {/*
              `loading` rather than a swapped label: the label stays in the layout
              and a spinner of the same footprint goes on top, so the button the
              pointer was travelling toward does not resize mid-press. The prop also
              stops a second activation and sets `aria-busy`, and it is the reason
              this form can be pressed twice on one click.
            */}
            <Button
              type="submit"
              form={formId}
              loading={busy}
              data-icon="inline-start"
            >
              <IconPlus data-icon="inline-start" />
              Lend stock
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {confirmNode}
    </>
  );
};
