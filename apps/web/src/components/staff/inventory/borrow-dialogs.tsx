"use client";

/**
 * Loans: who has what, and what is late.
 *
 * A borrow is the one inventory movement that is **not** a movement of stock.
 * Nothing leaves the school, so `inventoryItem.qty` does not change — only
 * `borrowedQty` rises, and the pair `(qty, borrowedQty)` is what "how much do we
 * have" and "how much is out" mean everywhere else in this module. The return
 * half is the part people forget to build and the part that actually maintains
 * anything: a check-out moves a counter, a check-in decides that the loan is
 * finished, that the tags are back on the shelf, and **what condition they came
 * back in**.
 *
 * ## A loan is owed to a member of staff **or to a student**
 *
 * `createBorrow` names its borrower as a discriminated union —
 * `{ type: "staff", staffId } | { type: "student", studentId }` — and every
 * read comes back as one `InventoryBorrower` (`type`, `id`, `name`, `reference`,
 * `className`) instead of the old flat `borrowerStaffId` / `borrowerName` pair.
 * That is not a cosmetic change: the pair could only ever be right for half the
 * rows in the table, so a loan to a pupil used to render with a blank holder on a
 * page whose entire job is to say who is holding what.
 *
 * Three consequences run through this file:
 *
 * - The lend form builds the payload through `borrowerInputFrom`, so the union's
 *   case is decided once, in one place, and no caller can send a half-populated
 *   borrower.
 * - The list renders a **student** row differently from a **staff** row — kind,
 *   reference number and current-year class — because "who has the laptop" and
 *   "which class has the projector" are different questions with different
 *   consequences, and colour alone would not carry the difference.
 * - The list filter holds **one** borrower, not two. `listBorrows` refuses both
 *   borrower filters at once with a `BAD_REQUEST`, and a control that can produce
 *   a request the server always rejects is a defect, so the state is shaped so
 *   the request is unconstructible.
 *
 * **A student is a recorded borrower and never an actor.** The `student` table has
 * no `userId`, so a student can never sign in; the loan is opened by staff here
 * and closed by staff in the return dialog. There is no missing student-facing
 * half of this feature.
 */
import type { InferRouterInputs } from "@orpc/server";
import type { AppRouter } from "@school-student-teacher-management/api/routers/index";
import {
  ITEM_CONDITIONS,
  borrowStatusLabel,
  itemConditionLabel,
  itemConditionSchema,
} from "@school-student-teacher-management/db/constants/inventory";
import { isoDateSchema } from "@school-student-teacher-management/db/schema/primitives";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
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
  FieldLegend,
  FieldSet,
} from "@school-student-teacher-management/ui/components/field";
import { Input } from "@school-student-teacher-management/ui/components/input";
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
  IconAlertTriangle,
  IconBackpack,
  IconBriefcase,
  IconPlus,
  IconRotateClockwise,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import type {
  BorrowRecord,
  ItemCondition,
} from "@/components/staff/inventory/inventory-types";
import {
  BorrowerPickerField,
  ConditionBadge,
  InventoryEmptyState,
  InventoryErrorState,
  InventoryInlineNotice,
  InventorySkeleton,
  ItemPickerField,
  UnitPickerField,
  borrowerInputFrom,
  borrowerReferenceLine,
  describeBorrowerChoice,
  invalidateInventory,
} from "@/components/staff/inventory/shared";
import type { BorrowerChoice } from "@/components/staff/inventory/shared";
import {
  formatDate,
  formatDateTime,
  issuesToFieldErrors,
  toQuantity,
  useDiscardGuard,
} from "@/components/staff/inventory/stock-dialogs";
import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

/** `listBorrows`' own default, and its hard ceiling. */
const BORROW_LIST_LIMIT = 200;

/** Same for the four stored conditions, which the return picklist round-trips. */
const isItemCondition = (value: string): value is ItemCondition =>
  (ITEM_CONDITIONS as readonly string[]).includes(value);

/**
 * Who is taking it, as the **form** holds it.
 *
 * A `v.variant` on `type`, mirroring `createBorrow`'s own `borrowerSchema` one
 * layer up: the two arms differ in the field they carry, so a validation failure
 * on either one is reported against the key this picker is mounted on, and the
 * parsed output is the exact object `borrowerInputFrom` turns into the request.
 *
 * The message is deliberately **mode-agnostic** ("choose who is taking it"). The
 * mode lives in the picker's own state, and a form schema that tried to spell a
 * per-mode message would have to be told which mode the picker was in — a fact the
 * dialog does not own, and coupling the two to get a nicer error message is how a
 * dialog ends up telling the clerk they have not chosen a student when they have
 * not chosen a *teacher*. The field's own label already says which kind of person
 * it is asking for.
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
 * The terms of the loan: what it is for, when it is due back, and who agreed to
 * it.
 *
 * Split out because `expectedReturnDate` is the one field here that is required
 * for a reason worth stating on its own — a loan with no date to be late against
 * cannot be chased at the end of term, which is the whole reason a loan has to be
 * attributable to *a person* in the first place, and that person is now either a
 * member of staff or a student. That argument belongs next to the field, not in a
 * banner, and it is deliberately phrased without the kind of person: a laptop that
 * has to be chased back at the end of term has to be chased back from somebody,
 * whichever table they are in.
 */
const BorrowTermsFields: React.FC<{
  purpose: string;
  onPurposeChange: (value: string) => void;
  expectedReturnDate: string;
  onExpectedReturnDateChange: (value: string) => void;
  approvedBy: string;
  onApprovedByChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  errors: Record<string, string>;
  disabled: boolean;
}> = ({
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
      <FieldLabel htmlFor="borrow-purpose">Purpose *</FieldLabel>
      <Textarea
        id="borrow-purpose"
        value={purpose}
        onChange={(event) => onPurposeChange(event.target.value)}
        rows={2}
        placeholder="e.g. Grade 11 practical sessions, weeks 3-6"
        disabled={disabled}
      />
      <FieldDescription>
        Searchable from the loans list, so a clerk looking for &ldquo;who has
        the tripod&rdquo; can find it by what it was for.
      </FieldDescription>
      {errors.purpose ? <FieldError>{errors.purpose}</FieldError> : null}
    </Field>

    <Field data-invalid={errors.expectedReturnDate ? true : undefined}>
      <FieldLabel htmlFor="borrow-expected-return">Due back on *</FieldLabel>
      <Input
        id="borrow-expected-return"
        type="date"
        value={expectedReturnDate}
        onChange={(event) => onExpectedReturnDateChange(event.target.value)}
        disabled={disabled}
        aria-invalid={errors.expectedReturnDate ? true : undefined}
      />
      <FieldDescription>
        Required. This is the date the loan is late against &mdash; the overdue
        flag on the list is computed from it, and a loan with no date cannot be
        chased.
      </FieldDescription>
      {errors.expectedReturnDate ? (
        <FieldError>{errors.expectedReturnDate}</FieldError>
      ) : null}
    </Field>

    {/**
     * **Not "Approved by".** A loan is recorded, not approved: nothing on this form
     * is gated on this field and the server never reads it. The label carries the
     * consequence, because the label is what a reader of the loan record in a
     * year's time actually sees.
     */}
    <Field>
      <FieldLabel htmlFor="borrow-authorised-by">
        Authorised by (recorded, not enforced)
      </FieldLabel>
      <Input
        id="borrow-authorised-by"
        value={approvedBy}
        onChange={(event) => onApprovedByChange(event.target.value)}
        placeholder="Name of the person who agreed to this"
        disabled={disabled}
      />
      <FieldDescription>
        Written onto the loan record beside your own name. Nothing is checked
        against it and nothing is refused without it — it is a record of who
        agreed, not an approval.
      </FieldDescription>
    </Field>

    <Field>
      <FieldLabel htmlFor="borrow-note">Note</FieldLabel>
      <Textarea
        id="borrow-note"
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
 * have picked the projector, so this block reads top to bottom as a sequence
 * (item → how many → which tags → who) and `BorrowTermsFields` reads as the
 * paperwork that follows. It also keeps the one read this dialog performs — the
 * selected item, for its `borrowable` flag — next to the item picker that
 * triggered it.
 */
const BorrowSetupFields: React.FC<{
  itemId: string | null;
  onItemChange: (value: string | null) => void;
  isNotBorrowable: boolean;
  notBorrowableItemName: string;
  qtyInput: string;
  onQtyInputChange: (value: string) => void;
  qty: number;
  unitTags: string[];
  onUnitTagsChange: (value: string[]) => void;
  borrower: BorrowerChoice | null;
  onBorrowerChange: (value: BorrowerChoice | null) => void;
  errors: Record<string, string>;
  disabled: boolean;
}> = ({
  itemId,
  onItemChange,
  isNotBorrowable,
  notBorrowableItemName,
  qtyInput,
  onQtyInputChange,
  qty,
  unitTags,
  onUnitTagsChange,
  borrower,
  onBorrowerChange,
  errors,
  disabled,
}) => (
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
        description={`${
          notBorrowableItemName
        } is marked as not lendable, so the server will refuse it. A fixed projector, a bolt-down set of benches or the school server is issued to somebody or written off — it is not something a person carries off-site and brings back. Pick a different item, or use the Issues tab.`}
      />
    ) : null}

    <Field data-invalid={errors.qty ? true : undefined}>
      <FieldLabel htmlFor="borrow-qty">Quantity going out *</FieldLabel>
      <Input
        id="borrow-qty"
        type="number"
        inputMode="numeric"
        min={1}
        value={qtyInput}
        onChange={(event) => onQtyInputChange(event.target.value)}
        disabled={disabled}
      />
      <FieldDescription>
        Taken off the shelf, not off the books — the school still owns these
        units, so the quantity on hand does not change.
      </FieldDescription>
      {errors.qty ? <FieldError>{errors.qty}</FieldError> : null}
    </Field>

    <UnitPickerField
      itemId={itemId}
      value={unitTags}
      onChange={onUnitTagsChange}
      qty={qty}
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

/**
 * Lend stock to a member of staff **or a student**. It comes back.
 *
 * **`expectedReturnDate` is required here, unlike the issue form next door.** It
 * is `notNull` on `inventory_borrow` and refined with `isoDateSchema`, because a
 * loan with no date to be late against cannot be chased at the end of term.
 *
 * **The borrower is one value, not two fields.** `borrower` is a
 * `BorrowerChoice | null` whose `type` decides which column
 * `inventory_borrow_borrower_exclusive` ends up with, and `borrowerInputFrom`
 * turns it into `createBorrow`'s union in one place. An earlier version of this
 * form held a flat `borrowerStaffId`, which is not merely narrower than the
 * current API — it is a shape the API cannot express, since the server now keys
 * the payload off a `type` discriminator precisely so a caller cannot send an id
 * of the wrong kind.
 */
export const BorrowDialog = ({
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
  const [borrower, setBorrower] = useState<BorrowerChoice | null>(null);
  const [purpose, setPurpose] = useState("");
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const qty = toQuantity(qtyInput);

  /**
   * The `borrowable` check, done here rather than left to a toast.
   *
   * `createBorrow` refuses a non-borrowable item with "This item is not on loan —
   * it can only be issued or written off", and the item's own `borrowable` flag
   * exists precisely so a storekeeper does not have to remember which of a fixed
   * hall projector, a bolt-down set of benches and the school server each one is.
   *
   * The shared `ItemPickerField` greys out items with nothing *available*; it
   * does not know about `borrowable`, and a clerk hunting for a fixed projector
   * deserves an explanation where they are looking rather than after a round
   * trip. So the selected item is read once and the refusal is rendered inline,
   * and submit is blocked with the same sentence the server would have sent.
   */
  const itemQuery = useQuery(
    orpc.inventory.items.get.queryOptions({
      input: { itemId: itemId ?? "" },
      enabled: itemId !== null,
    })
  );

  const isNotBorrowable =
    itemQuery.data !== undefined && !itemQuery.data.borrowable;

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
         * person before the insert and handed the resolved shape back, so the
         * toast says who the loan is to without this file holding a second
         * directory of staff and students — and it says it the same way for a
         * pupil as for a colleague, class included.
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
         * leave the available pool and the change log gains the row this just
         * wrote — the two scopes are deliberately identical because a check-out
         * and a check-in dirty exactly the same set.
         */
        await invalidateInventory(queryClient, "borrow");
      },
      onError: (error) => {
        toast.error(formatApiErrorMessage(error, "Could not record this loan"));
      },
    })
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (isNotBorrowable) {
      setErrors({
        itemId:
          "This item is not on loan — it can only be issued or written off. Use the Issues tab to hand it out, or Remove from stock if it is beyond repair.",
      });
      return;
    }

    const result = v.safeParse(borrowSchema, {
      itemId: itemId ?? "",
      qty,
      /**
       * The unselected case is spelled as a *staff* arm holding an empty id, which
       * sounds arbitrary and is not: it is the arm the picker opens on, it fails
       * `minLength(1)` on the one field the message is about, and the error lands
       * on `borrower` — the key the picker is mounted on — whichever arm was
       * actually active. An absent `type` would have produced a variant-level
       * error with no field to hang it on.
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
      setErrors(issuesToFieldErrors(result));
      return;
    }
    setErrors({});

    /**
     * A part-named tag list is refused here rather than at the server, which would
     * answer "Only 1 unit(s) are available" for an item that has three. Naming tags
     * is optional, so the refusal names the two ways out.
     */
    if (unitTags.length > 0 && unitTags.length !== qty) {
      setErrors({
        uniqueItemIds: `You named ${unitTags.length} tag${
          unitTags.length === 1 ? "" : "s"
        } but the quantity is ${qty}. Name ${qty} tag${
          qty === 1 ? "" : "s"
        }, or clear this field and the oldest ${qty} will be lent for you.`,
      });
      return;
    }

    borrowMutation.mutate({
      itemId: result.output.itemId,
      qty: result.output.qty,
      // The one expression that produces the request's borrower, for either kind.
      borrower: borrowerInputFrom(result.output.borrower),
      purpose: result.output.purpose,
      expectedReturnDate: result.output.expectedReturnDate,
      ...(result.output.uniqueItemIds
        ? { uniqueItemIds: result.output.uniqueItemIds }
        : {}),
      ...(result.output.approvedBy
        ? { approvedBy: result.output.approvedBy }
        : {}),
      ...(result.output.note ? { note: result.output.note } : {}),
    });
  };

  const { isPending } = borrowMutation;

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
            <DialogTitle>Lend stock to a person</DialogTitle>
            <DialogDescription>
              Record who is holding school property &mdash; a member of staff or
              a student &mdash; and the date it is due back
            </DialogDescription>
          </DialogHeader>

          <form
            id="borrow-form"
            onSubmit={handleSubmit}
            className="flex-1 space-y-6 overflow-y-auto px-6 py-4"
          >
            <FieldGroup>
              <InventoryInlineNotice
                tone="info"
                title="A loan is not a movement of stock"
                description="The school still owns what goes out on loan, so the quantity on hand does not change — only the count of units out with a borrower rises. The device comes back, and when it does the return step records what condition it came back in."
              />

              <BorrowSetupFields
                itemId={itemId}
                onItemChange={setItemId}
                isNotBorrowable={isNotBorrowable}
                notBorrowableItemName={itemQuery.data?.name ?? "This item"}
                qtyInput={qtyInput}
                onQtyInputChange={setQtyInput}
                qty={qty}
                unitTags={unitTags}
                onUnitTagsChange={setUnitTags}
                borrower={borrower}
                onBorrowerChange={setBorrower}
                errors={errors}
                disabled={isPending}
              />
              <BorrowTermsFields
                purpose={purpose}
                onPurposeChange={setPurpose}
                expectedReturnDate={expectedReturnDate}
                onExpectedReturnDateChange={setExpectedReturnDate}
                approvedBy={approvedBy}
                onApprovedByChange={setApprovedBy}
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
              form="borrow-form"
              disabled={isPending}
              data-icon="inline-start"
            >
              <IconPlus data-icon="inline-start" />
              {isPending ? "Lending..." : "Lend stock"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {confirmNode}
    </>
  );
};

const returnSchema = v.object({
  returnCondition: itemConditionSchema,
  returnNote: v.optional(v.string()),
});

/**
 * What each return condition actually does to the register, in the clerk's terms.
 *
 * These are consequences, not labels — `ITEM_CONDITION_LABELS` already owns the
 * wording of the four values, and re-spelling them here would be a second place
 * for the same words to drift. What the picklist cannot say on its own is why the
 * question is being asked at all: the answer **overwrites** the unit's stored
 * condition, so the next person to open the cupboard is reading what this
 * dialog says.
 *
 * **Every sentence is about the register and the device, never about the holder**,
 * and that is deliberate rather than incidental: what a tag comes back in is a fact
 * about school property, not a judgement on who was trusted with it. So these four
 * lines read exactly the same for a laptop coming back from a member of staff and
 * for one coming back from a pupil, and there is no arm here that would have to be
 * reworded the day a school lends to a child. Anything that genuinely *does* differ
 * by borrower is in the dialog description above this field, which names the holder
 * and their class.
 */
const RETURN_CONSEQUENCE: Record<ItemCondition, string> = {
  Good: "Back on the shelf as it left. The tag reads Good, which is what the next clerk will see.",
  Fair: "Usable, with wear. The tag now reads Fair, so the wear is on the record before somebody borrows it again.",
  Damaged:
    "The tag now reads Damaged and stays that way until somebody assesses it again — a write-off is a separate, signed decision.",
  "Under Repair":
    "The tag now reads Under repair, which is a different state from Damaged on purpose: a repaired device comes back into service and a broken one does not. The next person picking this up is being told it does not work.",
};

const RETURN_CONSEQUENCE_TONE: Record<ItemCondition, string> = {
  Good: "text-muted-foreground",
  Fair: "text-muted-foreground",
  Damaged: "text-destructive",
  // `text-warning-ink` and not `text-gold`: `--gold` is 3.87:1 on the page and
  // fails AA for body text, while `--warning-ink` is 6.12:1. The two tokens
  // coexist on purpose — `--gold` still carries the *fills* and rules elsewhere
  // (badge borders, the `accent` stripes), where it is a surface and not ink, and
  // re-tuning it is a product decision rather than a bug fix.
  "Under Repair": "text-warning-ink",
};

/**
 * The condition each tag is carrying **right now**, read off the loan.
 *
 * `listBorrows` returns the borrow's units with the unit row joined, so the
 * outgoing condition is here before the clerk touches anything.
 *
 * **This is the only moment the outgoing value is knowable.** `returnBorrow`
 * overwrites `inventoryUnit.condition` on every unit it releases, and the column
 * keeps no history: the previous value is not on the unit afterwards, not in the
 * loan's `returnCondition` (which is the *new* one), and not anywhere in the
 * audit log, which records entity rows and not a silent per-unit column write. So
 * a mis-click on "Good" against a tag that read "Damaged" writes a permanent lie
 * with no record of what it replaced — and the clerk is the only person in a
 * position to notice, which is why the current value is stated above the picker
 * rather than left to be recalled afterwards.
 *
 * A loan of a bulk item has no tags and therefore no outgoing condition to show;
 * that is stated rather than left as a blank line.
 *
 * **Borrower-blind on purpose.** This reads the units' tags, and a tag's condition
 * is the same fact whether the school lent it to a member of staff or to a
 * student — so nothing here is restated per borrower, and the return dialog does
 * not gain a second variant of this line. The holder is named once, in the dialog
 * description, where it belongs: the point of this line is that the clerk is about
 * to overwrite a value, not who they are about to hand it back to.
 */
const outgoingConditionLine = (borrow: BorrowRecord | null): string | null => {
  if (!borrow) {
    return null;
  }

  const held = borrow.units.filter((unit) => unit.releasedAt === null);
  if (held.length === 0) {
    return null;
  }

  return held
    .map((unit) => `${unit.uniqueNo} · ${itemConditionLabel(unit.condition)}`)
    .join("  |  ");
};

/**
 * Record a return: the device is back, and this is what condition it is in.
 *
 * **No `AlertDialog`, deliberately.** A return is restorative, not destructive —
 * it puts stock back on the shelf and closes a loan. Putting a confirmation step
 * in front of it would train a clerk to click through confirms, which is exactly
 * the habit that makes the write-off and finalise confirmations worthless. A plain
 * submit with a toast is the right weight, and the field is the real decision
 * being made, so that is where the attention goes.
 *
 * **A student loan closes through this dialog exactly as a staff loan does** —
 * same fields, same condition overwrite, same refusals — and the only thing on
 * screen that differs is the description, which names the holder and, for a
 * pupil, their class. That is the correct amount of difference: `returnBorrow`
 * resolves the borrower once and then does not branch on it, so a return screen
 * that read differently by borrower would be inventing a distinction the write
 * does not make.
 */
export const ReturnBorrowDialog = ({
  borrow,
  open,
  onOpenChange,
}: {
  borrow: BorrowRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const queryClient = useQueryClient();
  const [condition, setCondition] = useState<string>("");
  const [returnNote, setReturnNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const outgoing = outgoingConditionLine(borrow);
  const isDirty = condition !== "" || returnNote.trim().length > 0;

  const { requestClose, confirmNode } = useDiscardGuard(isDirty, () => {
    setCondition("");
    setReturnNote("");
    setErrors({});
    onOpenChange(false);
  });

  const returnMutation = useMutation(
    orpc.inventory.borrows.return.mutationOptions({
      onSuccess: async (result) => {
        /*
         * The count is `units.length` **only for a tagged loan**, and that is why
         * the null case cannot be papered over with `?? 0`. `returnBorrow` returns
         * `null` when the loan was a bulk one — counted, not tagged, so there were
         * no unit rows to release — and "0 unit(s) back on the shelf" printed
         * immediately after forty chairs came back is the sort of sentence that
         * makes a clerk stop believing the register. The counted case gets its own
         * clause, and the condition is still named in both: `returnCondition` is
         * required by `inventory_borrow_return_state` and it is the same question
         * for a bulk loan as for a laptop.
         */
        const conditionLabel = itemConditionLabel(result.returnCondition);
        const { availableQty } = result.item;
        toast.success(
          result.units
            ? `${result.units.length} unit(s) back on the shelf in ${conditionLabel} condition — ${availableQty} now available`
            : `Bulk loan closed — the counted units are back on the books as ${conditionLabel} condition, ${availableQty} now available`
        );
        setCondition("");
        setReturnNote("");
        setErrors({});
        onOpenChange(false);
        /**
         * `return`, not `borrow`. Same key set on purpose: a check-in dirties
         * exactly what a check-out dirties, and an asymmetric table here is a bug
         * waiting to be written.
         */
        await invalidateInventory(queryClient, "return");
      },
      onError: (error) => {
        toast.error(formatApiErrorMessage(error, "Could not close this loan"));
      },
    })
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const result = v.safeParse(returnSchema, {
      returnCondition: condition,
      returnNote: returnNote.trim() || undefined,
    });

    if (!result.success) {
      setErrors(issuesToFieldErrors(result));
      return;
    }
    if (!borrow) {
      return;
    }
    setErrors({});

    returnMutation.mutate({
      borrowId: borrow.id,
      returnCondition: result.output.returnCondition,
      ...(result.output.returnNote
        ? { returnNote: result.output.returnNote }
        : {}),
    });
  };

  const { isPending } = returnMutation;

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
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle>Record a return</DialogTitle>
            <DialogDescription>
              {borrow
                ? `${borrow.qty} × ${borrow.itemName}, on loan to ${describeBorrowerChoice(
                    borrow.borrower
                  )} — due back ${formatDate(borrow.expectedReturnDate)}`
                : "Close an open loan"}
            </DialogDescription>
          </DialogHeader>

          <form
            id="return-borrow-form"
            onSubmit={handleSubmit}
            className="flex-1 space-y-6 overflow-y-auto px-6 py-4"
          >
            {/**
             * What the tag says right now, above the picker.
             *
             * Placed above rather than below because the picker is a set of four
             * one-click buttons and "Good" is the first of them: a clerk who has
             * not read this line can set a damaged device to Good in a single
             * click, and the return **overwrites** the tag with no record of what
             * it replaced. This is the only moment the outgoing value is knowable
             * at all — see `outgoingConditionLine`.
             */}
            <InventoryInlineNotice
              tone={outgoing === null ? "info" : "warning"}
              title="The tag currently reads"
              description={
                outgoing ??
                "This loan is counted in bulk, so there is no per-tag condition to overwrite. The count is what changes."
              }
            />

            <FieldSet>
              <FieldLegend>Condition it came back in *</FieldLegend>
              <div className="flex flex-wrap gap-2">
                {ITEM_CONDITIONS.map((option) => {
                  const isSelected = condition === option;
                  return (
                    <Button
                      key={option}
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      aria-pressed={isSelected}
                      disabled={isPending}
                      onClick={() => {
                        setCondition(option);
                      }}
                    >
                      {itemConditionLabel(option)}
                    </Button>
                  );
                })}
              </div>
              <FieldDescription>
                Required, and required by the database too: a returned loan with
                no condition is refused at the column. Pick what is true of the
                device in your hand, not what was true when it went out &mdash;
                this <span className="font-medium">overwrites</span> the
                tag&rsquo;s recorded condition, it does not add to it, and the
                value above is not kept anywhere afterwards.
              </FieldDescription>
              {errors.returnCondition ? (
                <FieldError>{errors.returnCondition}</FieldError>
              ) : null}
            </FieldSet>

            {isItemCondition(condition) ? (
              <p
                className={`border-border border-l-2 pl-3 text-sm ${
                  RETURN_CONSEQUENCE_TONE[condition]
                }`}
              >
                {RETURN_CONSEQUENCE[condition]}
              </p>
            ) : null}

            <Field>
              <FieldLabel htmlFor="return-note">Return note</FieldLabel>
              <Textarea
                id="return-note"
                value={returnNote}
                onChange={(event) => setReturnNote(event.target.value)}
                rows={3}
                placeholder="e.g. Charger missing; the hinge is stiff but the screen is fine"
                disabled={isPending}
              />
              <FieldDescription>
                Optional, and the only place the *reason* for a condition
                survives. Recorded on the loan and on the movement it writes to
                the ledger, so &ldquo;came back without its charger&rdquo; is a
                fact somebody can find later &mdash; which, on a tag whose
                condition has just been overwritten, is the difference between a
                record and an assertion.
              </FieldDescription>
            </Field>
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
              form="return-borrow-form"
              disabled={isPending}
            >
              {isPending ? "Recording..." : "Record return"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {confirmNode}
    </>
  );
};

/**
 * The borrower column, and the reason a student row does not look like a staff
 * row.
 *
 * `listBorrows` used to hand this page a flat `borrowerStaffId` / `borrowerName`
 * pair and `PartyName` rendered it. That pair could only ever be right for half
 * the table — a loan to a pupil had no name to show at all — so the server now
 * returns one resolved `InventoryBorrower` and the three states `PartyName` exists
 * for (a name, a name with no id, an id with no name) are **unreachable here**:
 * `borrowerOf` throws rather than returning a partial row, `name` is always
 * populated, and both borrower foreign keys are `restrict`, so a pointer cannot
 * dangle. `PartyName` is still exactly right for the `*ByStaffId` *actors* on this
 * screen's neighbours, which are `set null` and genuinely can lose their person;
 * it is simply the wrong component for a column that is resolved.
 *
 * **What distinguishes the two cases is the kind of claim, not the colour.** A
 * staff loan and a student loan are different obligations with different
 * consequences: a member of staff signs for a device and can be chased for it, a
 * student's device is the property of a class and its return is a conversation
 * with a class teacher. So the row states the kind in words and in an icon, gives
 * the reference number in the vocabulary of that kind (`EMP-0417` versus
 * `STU/2025/001` are not interchangeable and a clerk reads one aloud at a front
 * office and the other across a corridor), and adds the student's current-year
 * class — because "Grade 9B has the projector" is the sentence this table is
 * queried to produce, and it is the answer `resolveBorrowerStudentBatch` exists to
 * compute.
 *
 * **`className: null` is stated, not hidden and not dashed.** It is a real answer
 * from a left join against `academicYear.isCurrent`: the student is on the roll
 * and is in no class this year. Printing a dash there would leave the clerk unable
 * to tell "no class" from "the register did not say", and hiding the row would
 * make a child who *can* be named unnameable.
 */
const BorrowerCell: React.FC<{ borrower: BorrowRecord["borrower"] }> = ({
  borrower,
}) => {
  const isStudent = borrower.type === "student";

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={isStudent ? "outline" : "secondary"}>
          {isStudent ? <IconBackpack /> : <IconBriefcase />}
          {isStudent ? "Student" : "Staff"}
        </Badge>
        <span className="font-medium">{borrower.name}</span>
      </div>
      <span className="text-muted-foreground font-mono text-xs">
        {borrowerReferenceLine(borrower)}
      </span>
      {/**
       * Printed for a student and **not** for a member of staff, and the branch is
       * on `type` rather than on whether `className` happens to be null: a teacher
       * is not on the class roll in this system at all (`class_` is keyed to
       * `student` through `studentClassAssignment`), so their `className` is a
       * structural null and rendering it as "no class this year" would be a
       * category error about a person who was never supposed to be on a class.
       */}
      {isStudent ? (
        <span className="text-muted-foreground text-xs">
          {borrower.className ?? "no class this year"}
        </span>
      ) : null}
    </div>
  );
};

/**
 * The overdue treatment, given the most visual weight on the row.
 *
 * A loan that is late is the one row on this screen a clerk has to act on, and
 * three things say so: a destructive-toned badge, the number of days, and the
 * server's own ordering, which puts every overdue loan at the top of the list
 * ahead of everything that is merely recent.
 *
 * **`overdueDays` is a difference in whole days from Postgres, not a figure
 * recomputed in the browser** — `current_date - expected_return_date::date` — so
 * the number on screen is the same number the filter used, in the same
 * timezone-free calendar.
 *
 * **What a late loan costs is not the same for both kinds of borrower, and this
 * row does not pretend it is.** The badge states one thing — *when* — and "when" is
 * the same measure for a teacher and for a pupil. But the response is not the same
 * act: a member of staff's overdue projector is chased with the person who signed
 * for it and is an accountability question between colleagues, while a student's
 * overdue laptop is a conversation with a class teacher and a parent, and a set of
 * calculators sitting in Grade 9B is a question about a department rather than an
 * asset incident. So the weight is deliberately not escalated by borrower type —
 * no second, louder badge, no "escalate" wording — because a register that treats
 * a nine-year-old's borrowed calculator as a property breach would be making a
 * judgement the ledger has no standing to make. The days are the fact; who to talk
 * to is the clerk's, and the `BorrowerCell` above is what tells them.
 */
const OverdueBadge: React.FC<{ record: BorrowRecord }> = ({ record }) =>
  record.isOverdue ? (
    <Badge variant="destructive">
      <IconAlertTriangle />
      {record.overdueDays === null
        ? "Overdue"
        : `${record.overdueDays} day${record.overdueDays === 1 ? "" : "s"} overdue`}
    </Badge>
  ) : null;

/** The four queue presets, in the shape `leave-management` uses for its review queues. */
type LoanPreset = "all" | "borrowed" | "returned" | "overdue";

const LOAN_PRESETS: { value: LoanPreset; label: string }[] = [
  { value: "all", label: "All loans" },
  { value: "borrowed", label: "Out on loan" },
  { value: "returned", label: "Returned" },
  { value: "overdue", label: "Overdue only" },
];

interface LoansPanelProps {
  /**
   * The school-wide count of late loans, read by the tab container from a
   * dedicated `overdueOnly` query. It comes from the server's own `total`, so it
   * is exact rather than a count of whatever page happens to be loaded — which is
   * what makes it safe to put on the tab label.
   */
  overdueCount: number;
}

/** `listBorrows`'s own input, projected off the router rather than re-declared. */
type ListBorrowsInput =
  InferRouterInputs<AppRouter>["inventory"]["borrows"]["list"];

/**
 * The borrow ledger: every check-out and every check-in.
 *
 * **The list does not re-sort.** `listBorrows` orders by
 * `isOverdue DESC, expectedReturnDate ASC, borrowedAt DESC` in SQL, using the
 * same expression as the `isOverdue` column, so the ordering and the badge cannot
 * drift apart. Sorting again in the browser would mean a second implementation of
 * a rule the server already owns, which is the one thing that must not happen to a
 * number a clerk acts on.
 *
 * **There is one borrower filter, not two**, and the reason the request cannot
 * name both is `listBorrowsInput` below.
 */
/**
 * The queue presets, as a row of pressed-state buttons.
 *
 * Its own component so that `LoansPanel`'s own body is the query, the table and the
 * two dialogs — the part with a rule in it — rather than also being the place four
 * buttons and their badges are drawn.
 */
const LoanPresetFilter: React.FC<{
  preset: LoanPreset;
  onPresetChange: (value: LoanPreset) => void;
  overdueCount: number;
}> = ({ preset, onPresetChange, overdueCount }) => (
  <div className="flex flex-wrap items-center gap-2">
    {LOAN_PRESETS.map((option) => (
      <Button
        key={option.value}
        type="button"
        size="sm"
        variant={preset === option.value ? "default" : "outline"}
        aria-pressed={preset === option.value}
        onClick={() => {
          onPresetChange(option.value);
        }}
      >
        {option.label}
        {option.value === "overdue" && overdueCount > 0 ? (
          <Badge
            variant={preset === "overdue" ? "secondary" : "destructive"}
            className="ml-2 tabular-nums"
          >
            {overdueCount}
          </Badge>
        ) : null}
      </Button>
    ))}
  </div>
);

/**
 * Free text and one borrower, side by side.
 *
 * The two sit in one row because they answer the same question asked two ways —
 * "whose loan is this?" — and putting a search box about items above a filter about
 * a person would make the panel read as two screens. The borrower field is the
 * `BorrowerPickerField` and not a second, staff-only combobox, so "which kind of
 * person am I asking about" is answered in the same way here as it is on the lend
 * form; a reader who has used one has used the other.
 */
const LoanFilterBar: React.FC<{
  search: string;
  onSearchChange: (value: string) => void;
  borrowerFilter: BorrowerChoice | null;
  onBorrowerFilterChange: (value: BorrowerChoice | null) => void;
}> = ({ search, onSearchChange, borrowerFilter, onBorrowerFilterChange }) => (
  <div className="flex flex-wrap items-end justify-between gap-3">
    <div className="flex flex-wrap items-end gap-4">
      <div className="min-w-56">
        <FieldLabel htmlFor="loans-search">Search</FieldLabel>
        <Input
          id="loans-search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Item, SKU, purpose or borrower"
          className="mt-1"
        />
        {/**
         * The search reaches a **person** as well as a thing, and the placeholder
         * alone could not say so in the room available. `listBorrows` matches the
         * item's name, its SKU, the stated purpose, and — through a left join onto
         * `student` — a student's name written as one string or their admission
         * number. The admission number is searched on its own because it is the
         * string a front office actually reads down a telephone, and half the rows
         * in this table are now student loans: a register that could not be searched
         * by the name of the child carrying the laptop is not searchable by the
         * person an anxious parent will ask about.
         */}
        <FieldDescription className="mt-1.5">
          Item name, SKU, what the loan was for, or a borrower&rsquo;s name or
          admission number &mdash; so &ldquo;Nimali&rdquo; and
          &ldquo;STU/2025/001&rdquo; both find the child carrying it.
        </FieldDescription>
      </div>
      <div className="min-w-72">
        <BorrowerPickerField
          value={borrowerFilter}
          onChange={onBorrowerFilterChange}
          label="Filter by borrower"
          allowClear
          description="One person at a time. The register can only ask about a staff member or a student, never both at once."
        />
      </div>
    </div>
  </div>
);

/**
 * `listBorrows`'s input, built from the panel's filter state.
 *
 * **This is the only place the "exactly one borrower" rule reaches the wire.**
 * `listBorrows` takes `borrowerStaffId` and `borrowerStudentId` as separate
 * optionals and refuses both at once with a `BAD_REQUEST` — "Pick either a staff
 * member or a student to filter by" — because a loan has exactly one borrower and
 * a request naming two is a contradiction rather than a narrower filter. The panel
 * holds a single `BorrowerChoice | null` whose `type` is the discriminator, so the
 * two spread keys below are mutually exclusive **by construction**: there is no
 * ordering of clicks, and no intermediate state, that produces both keys. Two
 * separate comboboxes that cleared each other would also mostly work, and would
 * still be a control that *can* produce the rejected request for the instant
 * between the two clicks.
 *
 * A named function rather than an inline literal, for one reason: this is the
 * request, and a request is worth being able to read on its own. Its input type is
 * `listBorrows`'s own, projected off the router, so renaming a filter key on the
 * server is a compile error here rather than a request that is quietly dropped.
 */
const listBorrowsInput = ({
  preset,
  search,
  borrowerFilter,
}: {
  preset: LoanPreset;
  search: string;
  borrowerFilter: BorrowerChoice | null;
}): ListBorrowsInput => {
  const trimmedSearch = search.trim();

  return {
    limit: BORROW_LIST_LIMIT,
    ...(preset === "overdue" ? { overdueOnly: true } : {}),
    ...(preset === "borrowed" || preset === "returned"
      ? { status: preset }
      : {}),
    ...(trimmedSearch ? { search: trimmedSearch } : {}),
    ...(borrowerFilter?.type === "staff"
      ? { borrowerStaffId: borrowerFilter.id }
      : {}),
    ...(borrowerFilter?.type === "student"
      ? { borrowerStudentId: borrowerFilter.id }
      : {}),
  };
};

export const LoansPanel = ({ overdueCount }: LoansPanelProps) => {
  const [preset, setPreset] = useState<LoanPreset>("borrowed");
  const [search, setSearch] = useState("");
  const [borrowerFilter, setBorrowerFilter] = useState<BorrowerChoice | null>(
    null
  );
  const [returningBorrow, setReturningBorrow] = useState<BorrowRecord | null>(
    null
  );
  const [isLendOpen, setIsLendOpen] = useState(false);

  const borrowsQuery = useQuery(
    orpc.inventory.borrows.list.queryOptions({
      input: listBorrowsInput({ preset, search, borrowerFilter }),
    })
  );

  const borrows = useMemo(
    () => borrowsQuery.data?.borrows ?? [],
    [borrowsQuery.data]
  );
  const total = borrowsQuery.data?.total ?? 0;
  const hasFilter =
    preset !== "all" || Boolean(search.trim()) || borrowerFilter !== null;

  return (
    <div className="space-y-4">
      <LoanPresetFilter
        preset={preset}
        onPresetChange={setPreset}
        overdueCount={overdueCount}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <LoanFilterBar
          search={search}
          onSearchChange={setSearch}
          borrowerFilter={borrowerFilter}
          onBorrowerFilterChange={setBorrowerFilter}
        />
        <Button
          type="button"
          size="sm"
          onClick={() => setIsLendOpen(true)}
          data-icon="inline-start"
        >
          <IconPlus data-icon="inline-start" />
          Lend stock
        </Button>
      </div>

      {borrowsQuery.isLoading ? <InventorySkeleton rows={8} /> : null}

      {borrowsQuery.isError ? (
        <InventoryErrorState
          error={borrowsQuery.error}
          onRetry={() => {
            void borrowsQuery.refetch();
          }}
        />
      ) : null}

      {!borrowsQuery.isLoading &&
      !borrowsQuery.isError &&
      borrows.length === 0 ? (
        <InventoryEmptyState
          title={
            hasFilter ? "No loans match this view" : "Nothing is out on loan"
          }
          description={
            hasFilter
              ? "No loan matches this queue, search or borrower filter. Clear them to see every check-out and check-in on record."
              : "Every tagged unit in the store is on the shelf it belongs to. A loan appears here the moment a member of staff or a student takes equipment off — each row naming the person it is owed back to, their reference number, and for a pupil the class it is in, with the date it is due. A loan past that date sorts to the top of this list with the number of days it is late."
          }
        />
      ) : null}

      {!borrowsQuery.isLoading &&
      !borrowsQuery.isError &&
      borrows.length > 0 ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Borrower</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Due back</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Asset tags</TableHead>
                <TableHead>Returned</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {borrows.map((borrow) => (
                <TableRow key={borrow.id}>
                  <TableCell>
                    {/**
                     * One resolved borrower, rendered by kind. The flat
                     * `borrowerName` / `borrowerStaffId` pair this cell used to
                     * read no longer exists on the row, and no amount of
                     * null-guarding would have brought it back: for a student loan
                     * both fields were `null`, so the old cell rendered a cell that
                     * said the register had lost the holder of a laptop that was
                     * sitting in a child's bag. See `BorrowerCell` for what the two
                     * kinds render differently.
                     */}
                    <BorrowerCell borrower={borrow.borrower} />
                    <span className="text-muted-foreground line-clamp-1 text-xs">
                      {borrow.purpose}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="block">{borrow.itemName}</span>
                    <span className="text-muted-foreground font-mono text-xs">
                      {borrow.itemSku}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {borrow.qty}
                  </TableCell>
                  <TableCell>
                    <span className="block">
                      {formatDate(borrow.expectedReturnDate)}
                    </span>
                    <OverdueBadge record={borrow} />
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        borrow.status === "returned" ? "secondary" : "outline"
                      }
                    >
                      {borrowStatusLabel(borrow.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {/**
                     * Every tag, in full, and every released tag with the moment it
                     * went back. This column used to open with `summariseTags` —
                     * three names and a count — which is the one place on the row
                     * that answers "which machines went out on this loan", and a
                     * partial answer there is a partial audit trail.
                     */}
                    {borrow.units.length > 0 ? (
                      <ul className="font-mono">
                        {borrow.units.map((unit) => (
                          <li key={unit.id} className="break-all">
                            {unit.uniqueNo}
                            {unit.releasedAt === null ? null : (
                              <span className="text-muted-foreground block">
                                released {formatDateTime(unit.releasedAt)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-muted-foreground">
                        &mdash; counted in bulk
                      </span>
                    )}
                    {/**
                     * Released units are shown, not filtered out.
                     *
                     * `listBorrows` deliberately returns the join rows for the
                     * whole page including released ones: "this laptop came back
                     * in Fair condition on 3 March" is a fact about the past, and
                     * a loan record that could only describe the present would not
                     * be an audit trail. Each released tag is labelled with the
                     * moment it went back rather than dropped.
                     */}
                  </TableCell>
                  <TableCell>
                    {borrow.status === "returned" ? (
                      <span className="block">
                        {borrow.returnedAt ? (
                          <span className="block">
                            {formatDateTime(borrow.returnedAt)}
                          </span>
                        ) : null}
                        {borrow.returnCondition ? (
                          <ConditionBadge condition={borrow.returnCondition} />
                        ) : null}
                        {borrow.returnNote ? (
                          <span className="text-muted-foreground line-clamp-2 text-xs italic">
                            {borrow.returnNote}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setReturningBorrow(borrow);
                        }}
                        data-icon="inline-start"
                      >
                        <IconRotateClockwise data-icon="inline-start" />
                        Record return
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <p className="text-muted-foreground text-xs">
            Showing {borrows.length} of {total} loans. Overdue loans are listed
            first, soonest due date at the top within them; everything else is
            newest first.
          </p>
        </>
      ) : null}

      <BorrowDialog open={isLendOpen} onOpenChange={setIsLendOpen} />
      <ReturnBorrowDialog
        borrow={returningBorrow}
        open={returningBorrow !== null}
        onOpenChange={(next) => {
          if (!next) {
            setReturningBorrow(null);
          }
        }}
      />
    </div>
  );
};
