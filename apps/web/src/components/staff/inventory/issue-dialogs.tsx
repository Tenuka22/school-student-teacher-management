"use client";

/**
 * Issues: stock that has permanently left the school, and the certificate naming
 * who took it.
 *
 * Two exports — the raise form and the list that reads it back. The dialog is
 * the only place in the feature where a clerk can make the store's books smaller
 * without anybody signing anything, so most of the copy here exists to make one
 * thing unmissable: **an issue is not a loan.** `createIssue` decrements
 * `inventoryItem.qty`, so the stock stops being the school's, and it sets the
 * units to `issued`, which is terminal. There is no `returnIssue` and no
 * `cancelIssue`. A loan does the opposite and leaves `qty` alone.
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
import { IconArrowUpRight, IconPlus } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import type { IssueRecord } from "@/components/staff/inventory/inventory-types";
import {
  InventoryEmptyState,
  InventoryErrorState,
  InventoryInlineNotice,
  InventorySkeleton,
  ItemPickerField,
  UnitPickerField,
  invalidateInventory,
} from "@/components/staff/inventory/shared";
import {
  PartyName,
  formatDate,
  formatDateTime,
  issuesToFieldErrors,
  toQuantity,
  useDiscardGuard,
} from "@/components/staff/inventory/stock-dialogs";
import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

/** `listIssues`' own default, and its hard ceiling. */
const ISSUE_LIST_LIMIT = 200;

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
      <FieldLabel htmlFor="issue-purpose">Purpose *</FieldLabel>
      <Textarea
        id="issue-purpose"
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
      <FieldLabel htmlFor="issue-expected-return">Expected back by</FieldLabel>
      <Input
        id="issue-expected-return"
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
      <FieldLabel htmlFor="issue-authorised-by">
        Authorised by (recorded, not enforced)
      </FieldLabel>
      <Input
        id="issue-authorised-by"
        value={approvedBy}
        onChange={(event) => onApprovedByChange(event.target.value)}
        placeholder="Name of the person who agreed to it"
        disabled={disabled}
      />
      <FieldDescription>
        Printed on the certificate beside your own name. Nothing is checked
        against it and nothing is refused without it — it is a record of who
        agreed, not an approval.
      </FieldDescription>
    </Field>

    <Field>
      <FieldLabel htmlFor="issue-note">Note</FieldLabel>
      <Textarea
        id="issue-note"
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
  receiverName: string;
  onReceiverNameChange: (value: string) => void;
  receiverDepartment: string;
  onReceiverDepartmentChange: (value: string) => void;
  receiverPhone: string;
  onReceiverPhoneChange: (value: string) => void;
  errors: Record<string, string>;
  disabled: boolean;
}> = ({
  receiverName,
  onReceiverNameChange,
  receiverDepartment,
  onReceiverDepartmentChange,
  receiverPhone,
  onReceiverPhoneChange,
  errors,
  disabled,
}) => (
  <>
    <Field data-invalid={errors.receiverName ? true : undefined}>
      <FieldLabel htmlFor="issue-receiver">Received by *</FieldLabel>
      <Input
        id="issue-receiver"
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
        <FieldLabel htmlFor="issue-department">
          Receiver&rsquo;s department
        </FieldLabel>
        <Input
          id="issue-department"
          value={receiverDepartment}
          onChange={(event) => onReceiverDepartmentChange(event.target.value)}
          placeholder="e.g. Grade 10 Science, or Provincial Office"
          disabled={disabled}
        />
      </Field>

      <Field data-invalid={errors.receiverPhone ? true : undefined}>
        <FieldLabel htmlFor="issue-phone">Contact number</FieldLabel>
        <Input
          id="issue-phone"
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
 * confirmation — and a warning the user has already read three paragraphs of by
 * the time they reach it.
 *
 * The dialog names the quantity and the receiver rather than saying "are you
 * sure", because those are the two facts somebody would need in order to notice
 * they had the wrong row open.
 */
const IssueConfirmDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  qty: number;
  receiverName: string;
  isPending: boolean;
  onConfirm: () => void;
}> = ({ open, onOpenChange, qty, receiverName, isPending, onConfirm }) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogTitle>
        Issue {qty} unit{qty === 1 ? "" : "s"} to {receiverName}?
      </AlertDialogTitle>
      <AlertDialogDescription>
        {receiverName.length > 0
          ? `${qty} unit${
              qty === 1 ? "" : "s"
            } of the chosen item will leave the school permanently. The quantity on hand drops, the asset tags become terminal so the same device can never be issued twice, and there is no return or cancellation procedure.`
          : "The quantity on hand will drop, the asset tags become terminal, and there is no return or cancellation procedure."}
      </AlertDialogDescription>
      <div className="flex justify-end gap-2">
        <AlertDialogCancel>Go back</AlertDialogCancel>
        <AlertDialogAction
          onClick={onConfirm}
          disabled={isPending}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {isPending ? "Issuing..." : "Yes, issue it"}
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
    {/**
     * The irreversibility, stated before anything is filled in.
     *
     * Three things look alike at a school counter — a loan, a disposal and an
     * issue — and only one of them is this form. The difference that matters to
     * the person typing is not procedural: a loan comes back, a disposal needs a
     * signature, and **an issue reduces the school's `qty` immediately and marks
     * the tags `issued`, which is terminal.** So the copy leads with the
     * consequence rather than with the definition.
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

    <Field data-invalid={errors.qty ? true : undefined}>
      <FieldLabel htmlFor="issue-qty">Quantity being issued *</FieldLabel>
      <Input
        id="issue-qty"
        type="number"
        inputMode="numeric"
        min={1}
        value={qtyInput}
        onChange={(event) => onQtyChange(event.target.value)}
        disabled={disabled}
      />
      <FieldDescription>
        The school stops holding these units the moment this is saved.
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
      description="Leave empty and the oldest available units go, which is the order the store counts on. Name the tags when the devices are in front of you — every tag you name is printed in full on the receipt below, because on a record that is only evidence a shortened list is a shortened audit trail."
      disabled={disabled}
    />
  </>
);

/**
 * Hand stock out of the store permanently.
 *
 * `receiverPhone` and `expectedReturnDate` are the two fields where the form and
 * the wire disagree about "blank", and both are handled on the face of the
 * dialog rather than left to the server.
 */
export const IssueDialog = ({
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
  const [receiverName, setReceiverName] = useState("");
  const [receiverDepartment, setReceiverDepartment] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [purpose, setPurpose] = useState("");
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const qty = toQuantity(qtyInput);

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

  const { requestClose, confirmNode } = useDiscardGuard(isDirty, () => {
    reset();
    onOpenChange(false);
  });

  const issueMutation = useMutation(
    orpc.inventory.issues.create.mutationOptions({
      onSuccess: async (result) => {
        toast.success(
          `Issued ${result.qty} × ${result.itemName} to ${result.receiverName} — ${result.remainingQty} now on hand`
        );
        reset();
        onOpenChange(false);
        /**
         * `issue`, not `stock` or `disposal`. The register loses the units, the tag
         * register loses them from the available pool and the issue list gains the
         * certificate — and, as everywhere else, the change log gains the row this
         * just wrote, which is the one the tab's own heading promises.
         */
        await invalidateInventory(queryClient, "issue");
      },
      onError: (error) => {
        toast.error(
          formatApiErrorMessage(error, "Could not record this issue")
        );
      },
    })
  );

  /** One parse, used by the submit gate and again by the confirmed commit. */
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

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = parseForm();

    if (!result.success) {
      setErrors(issuesToFieldErrors(result));
      return;
    }
    setErrors({});

    /**
     * A part-named tag list is refused here rather than at the server.
     *
     * `UnitPickerField` says "1 of 3 selected — 2 still to choose" and lets the
     * form through, and `getAvailableUnits` then answers `CONFLICT` — *"Only 1
     * unit(s) are available"* — which is false: the item has three. Naming tags is
     * optional here, so the refusal names the two ways out.
     */
    if (unitTags.length > 0 && unitTags.length !== qty) {
      setErrors({
        uniqueItemIds: `You named ${unitTags.length} tag${
          unitTags.length === 1 ? "" : "s"
        } but the quantity is ${qty}. Name ${qty} tag${
          qty === 1 ? "" : "s"
        }, or clear this field and the oldest ${qty} will be issued for you.`,
      });
      return;
    }

    // Confirm second. An `AlertDialog` that opens for a form which could not have
    // been submitted is a dialog about nothing.
    setConfirmOpen(true);
  };

  const commit = () => {
    const result = parseForm();
    if (!result.success) {
      setConfirmOpen(false);
      return;
    }

    issueMutation.mutate({
      itemId: result.output.itemId,
      qty: result.output.qty,
      receiverName: result.output.receiverName,
      purpose: result.output.purpose,
      /**
       * Sent as an explicit `null` when the field was blank, and that is a
       * readability choice rather than a workaround: `drizzle-valibot` wraps every
       * nullable column in both `nullable` and `optional`, so omitting the key is
       * perfectly valid and nothing here is compensating for a required key.
       * `null` is written out because "we were not told" is a statement about the
       * certificate, and an absent key is a statement about the form.
       */
      receiverPhone: result.output.receiverPhone ?? null,
      expectedReturnDate: result.output.expectedReturnDate ?? null,
      ...(result.output.receiverDepartment
        ? { receiverDepartment: result.output.receiverDepartment }
        : {}),
      ...(result.output.approvedBy
        ? { approvedBy: result.output.approvedBy }
        : {}),
      ...(result.output.note ? { note: result.output.note } : {}),
      ...(result.output.uniqueItemIds
        ? { uniqueItemIds: result.output.uniqueItemIds }
        : {}),
    });
  };

  const { isPending } = issueMutation;

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
            <DialogTitle>Issue stock out of the store</DialogTitle>
            <DialogDescription>
              Hand equipment to somebody outside the school&rsquo;s daily use,
              and record who received it
            </DialogDescription>
          </DialogHeader>

          <form
            id="issue-form"
            onSubmit={handleSubmit}
            className="flex-1 space-y-6 overflow-y-auto px-6 py-4"
          >
            <FieldGroup>
              <IssueIdentityFields
                itemId={itemId}
                onItemChange={setItemId}
                qtyInput={qtyInput}
                onQtyChange={setQtyInput}
                unitTags={unitTags}
                onUnitTagsChange={setUnitTags}
                errors={errors}
                disabled={isPending}
              />

              <IssueReceiverFields
                receiverName={receiverName}
                onReceiverNameChange={setReceiverName}
                receiverDepartment={receiverDepartment}
                onReceiverDepartmentChange={setReceiverDepartment}
                receiverPhone={receiverPhone}
                onReceiverPhoneChange={setReceiverPhone}
                errors={errors}
                disabled={isPending}
              />

              <IssueTermsFields
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
              form="issue-form"
              variant="destructive"
              disabled={isPending}
              data-icon="inline-start"
            >
              <IconArrowUpRight data-icon="inline-start" />
              {isPending ? "Issuing..." : "Issue stock"}
            </Button>
          </div>
        </DialogContent>

        <IssueConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          qty={qty}
          receiverName={receiverName.trim()}
          isPending={isPending}
          onConfirm={commit}
        />
      </Dialog>
      {confirmNode}
    </>
  );
};

/**
 * `isOutstanding` is a reconciliation aid and nothing else.
 *
 * An issue is **terminal**: `inventory_issue` has no `updatedAt`, no status
 * column and both of its foreign keys are `restrict`, so there is no return, no
 * cancellation and no transition for a flag to be the first arm of. The server
 * computes the flag on every row anyway, and the only honest thing a UI can do
 * with it is *point at a row worth asking about*.
 *
 * So the badge is neutral rather than destructive — it is not a failure state
 * and there is no task behind it — and the footnote under the table says
 * outright that nothing chases it. Copy that implied a workflow ("overdue",
 * "action required", "pending return") would be describing a state machine this
 * feature does not have.
 *
 * `text-warning-ink` and not `text-gold`: this is body-sized text, and `--gold` is
 * 3.87:1 on the page, which fails AA. `--gold` stays for fills and rules, where it
 * is a surface and not ink; the badge's `border-accent/50` and the striped fill
 * are exactly that use, so both tokens legitimately coexist on one element.
 */
const OutstandingMarker: React.FC<{ record: IssueRecord }> = ({ record }) =>
  record.isOutstanding ? (
    <Badge variant="outline" className="border-accent/50 text-warning-ink">
      Past expected return
    </Badge>
  ) : null;

/**
 * The store's issue history: what has permanently left the building, and to whom.
 *
 * Owns its own create dialog: the "Issue stock" action only makes sense beside
 * the list it will appear in, so there is no reason for the tab container to hold
 * that piece of state. (The two counter movements in the page header are the
 * exception — they have no natural tab, and `lifecycle-tabs.tsx` owns them.)
 */
export const IssuesPanel = () => {
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const issuesQuery = useQuery(
    orpc.inventory.issues.list.queryOptions({
      input: {
        limit: ISSUE_LIST_LIMIT,
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      },
    })
  );

  const issues = useMemo(
    () => issuesQuery.data?.issues ?? [],
    [issuesQuery.data]
  );
  const total = issuesQuery.data?.total ?? 0;
  const hasFilter = Boolean(search.trim() || from || to);
  const outstandingCount = useMemo(
    () => issues.filter((issue) => issue.isOutstanding).length,
    [issues]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56">
            <FieldLabel htmlFor="issues-search">Search</FieldLabel>
            <Input
              id="issues-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Receiver, purpose, item or SKU"
              className="mt-1"
            />
          </div>
          <div>
            <FieldLabel htmlFor="issues-from">Issued from</FieldLabel>
            <Input
              id="issues-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <FieldLabel htmlFor="issues-to">Issued to</FieldLabel>
            <Input
              id="issues-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => setIsDialogOpen(true)}
          data-icon="inline-start"
        >
          <IconPlus data-icon="inline-start" />
          Issue stock
        </Button>
      </div>

      {outstandingCount > 0 ? (
        <p className="text-muted-foreground text-xs">
          {outstandingCount} of the {issues.length} shown were promised back by
          a date that has now passed. Nothing chases them — an issue has no
          return path — so this is a list of rows worth asking about at the end
          of term, not an open task.
        </p>
      ) : null}

      {issuesQuery.isLoading ? <InventorySkeleton rows={8} /> : null}

      {issuesQuery.isError ? (
        <InventoryErrorState
          error={issuesQuery.error}
          onRetry={() => {
            void issuesQuery.refetch();
          }}
        />
      ) : null}

      {!issuesQuery.isLoading && !issuesQuery.isError && issues.length === 0 ? (
        <InventoryEmptyState
          title={
            hasFilter
              ? "No issues match this search"
              : "No stock has left the school"
          }
          description={
            hasFilter
              ? "Nothing in the issue history matches this search or date range. Clear them to see every hand-over on record."
              : "Every unit the school owns is still the school's. An issue is a deliberate hand-over to somebody outside the school's daily use — a graduating student, a contractor, a feeder school — and each one is recorded here with the receiver's name and the asset tags that went out with it."
          }
        />
      ) : null}

      {!issuesQuery.isLoading && !issuesQuery.isError && issues.length > 0 ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Received by</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Asset tags</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Expected back</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {issues.map((issue) => (
                <TableRow key={issue.id}>
                  <TableCell>
                    <span className="block font-medium">{issue.itemName}</span>
                    <span className="text-muted-foreground font-mono text-xs">
                      {issue.itemSku}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {issue.qty}
                  </TableCell>
                  <TableCell>
                    <span className="block">{issue.receiverName}</span>
                    {issue.receiverDepartment ? (
                      <span className="text-muted-foreground text-xs">
                        {issue.receiverDepartment}
                      </span>
                    ) : null}
                    {issue.receiverPhone ? (
                      <span className="text-muted-foreground font-mono text-xs">
                        {issue.receiverPhone}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-72">
                    <span className="line-clamp-2">{issue.purpose}</span>
                    {issue.note ? (
                      <span className="text-muted-foreground line-clamp-1 text-xs italic">
                        {issue.note}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {/**
                     * **Every tag, in full.**
                     *
                     * This was `summariseTags` — three tags and a `+17 more` — and
                     * the field's own copy promised the opposite ("the receipt
                     * quotes them back"). On the one page that exists *only* to
                     * record which devices left the building and to whom, a
                     * shortened tag list is a shortened audit trail, and there is
                     * nothing else on the row that could recover the rest. So the
                     * list wraps instead of truncating, and the footnote under
                     * the table says so.
                     */}
                    {issue.units.length > 0 ? (
                      <ul className="font-mono text-xs">
                        {issue.units.map((unit) => (
                          <li key={unit.id} className="break-all">
                            {unit.uniqueNo}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-muted-foreground">
                        Counted in bulk — no tags
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="block">
                      {formatDateTime(issue.issuedAt)}
                    </span>
                    <PartyName
                      name={issue.issuedByName}
                      staffId={issue.issuedByStaffId}
                      emptyLabel="Issued by an account with no staff record"
                      goneLabel="Issuer no longer on the roll"
                    />
                  </TableCell>
                  <TableCell>
                    {issue.expectedReturnDate ? (
                      <>
                        <span className="block">
                          {formatDate(issue.expectedReturnDate)}
                        </span>
                        <OutstandingMarker record={issue} />
                      </>
                    ) : (
                      <span className="text-muted-foreground">Not stated</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <p className="text-muted-foreground text-xs">
            Showing {issues.length} of {total} issues on record. Every asset tag
            on an issue is listed in full — this page is the only record of
            which devices left the building, so nothing on it is shortened.{" "}
            <span className="font-medium">Past expected return</span> marks
            stock that was promised back and was not &mdash; it is a note for
            the end-of-term reconciliation, not a state this system moves on.
          </p>
        </>
      ) : null}

      <IssueDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </div>
  );
};
