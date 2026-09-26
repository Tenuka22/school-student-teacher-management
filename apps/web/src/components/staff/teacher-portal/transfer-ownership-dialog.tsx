"use client";

import { inventoryTransferReasonSchema } from "@school-student-teacher-management/db/constants/inventory";
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
import { Textarea } from "@school-student-teacher-management/ui/components/textarea";
import { IconArrowRight, IconUserCog } from "@tabler/icons-react";
import type * as React from "react";
import { useId, useState } from "react";
import * as v from "valibot";

import type {
  InventoryItemView,
  TransferReason,
} from "@/components/staff/inventory/inventory-types";
import {
  InventoryInlineNotice,
  TransferReasonField,
} from "@/components/staff/inventory/shared";
import {
  PartyName,
  describeParty,
} from "@/components/staff/inventory/stock-dialogs";
import { validationFieldErrors } from "@/lib/api-error";

/**
 * What "nobody holds it" is called on this one row.
 *
 * The predicate behind this dialog's own list — `custody.lent` — requires
 * `custodianStaffId IS NOT NULL`, so the empty case is **unreachable from the
 * page**. It is named anyway rather than left `undefined`, for the same reason
 * `custody-dialogs.tsx` names all three of its empty labels: a null printed as a
 * blank asserts that nothing is recorded, which is a different claim from "the
 * store has it", and the folder's four certificates and register would then
 * disagree with this dialog about what a blank means.
 */
const IN_STORE = "the store";

/** The right-hand side of the preview before a name is known, and a real fallback. */
const CHOSEN_STAFF = "the member of staff you choose";

/** Matches the 500 the note field has always been given, in the folder and here. */
const NOTE_MAX_LENGTH = 500;

type OwnershipErrors = Partial<Record<"reason" | "note", string>>;

/**
 * The form, validated here rather than at the server.
 *
 * **`reason` is the reason this schema exists.** `TransferReasonField` is typed
 * `(reason: string) => void` — it is a shared field over a shared picklist, and it
 * will hand back whatever a `Select` gave it — while `transferOwnership`'s input
 * is the closed `inventoryTransferReasonSchema` union. So without a parse between
 * the two, the page would be asked to send a `string` where a union of eight
 * literals is required, and the only ways to bridge that are a cast (which
 * asserts the value is one of the eight without knowing it) or `string` leaking
 * all the way down to the mutation. **The parse is the honest answer**, and it is
 * what the inventory folder's own dialogs do for the same reason.
 *
 * The note is trimmed and length-capped here for the second reason: the server
 * declares it `optional(pipe(string(), minLength(1)))`, so an all-spaces note is
 * not "no note" — it is a validation failure on a hand-on that otherwise worked.
 */
const ownershipSchema = v.object({
  reason: inventoryTransferReasonSchema,
  note: v.pipe(v.string(), v.trim(), v.maxLength(NOTE_MAX_LENGTH)),
});

/**
 * Only the keys valibot objected to, so each issue lands on the field that caused
 * it. It takes the **issues** rather than the result object because
 * `v.SafeParseResult` is generic over the *schema*, and threading a schema type
 * through a helper whose whole job is to read `issue.path[0].key` would buy
 * nothing. Same shape as the folder's `issuesToErrors`, for the same reason.
 */
const issuesToErrors = (
  issues: readonly {
    path?: readonly { key?: unknown }[] | null;
    message: string;
  }[]
): OwnershipErrors => {
  const errors: OwnershipErrors = {};

  for (const issue of issues) {
    const key = issue.path?.[0]?.key;
    if ((key === "reason" || key === "note") && !(key in errors)) {
      errors[key] = issue.message;
    }
  }

  return errors;
};

/**
 * ## `ChangePreview` is declared here, and this is the folder's second copy
 *
 * The best work in the inventory feature is the before→after sentence in
 * `custody-dialogs.tsx`, and a new dialog without it is a regression — so it is
 * reproduced here, markup and prop-union alike, down to the detail that a caller
 * cannot pass an arrow and a sentence at once. Two things differ, both
 * deliberately:
 *
 * - The folder's copy is **module-private** (a bare `const` beside its three
 *   users) and `inventory/**` is another agent's folder. Re-declaring one
 *   component is a much smaller cost than a cross-folder edit two agents are
 *   making at the same time, and a third copy per dialog would be worse than two
 *   copies in two folders.
 * - It lives in this file rather than in a module of its own because the page's
 *   take dialog needs it too, and a forty-line file whose only content is this is
 *   a worse answer than a second import from a dialog. `take-item-dialog.tsx`
 *   imports it from here.
 *
 * The comment travels with it for the reason the folder's four copies of
 * `likePattern` carry theirs: the reasoning is the part somebody will otherwise
 * simplify away, and what is being protected — *state the change before the
 * button, built from the row's current pointer and never from a guess* — is the
 * whole value of the component.
 */
type ChangePreviewProps = { headline: string; footnote: string } & (
  | { from: string; to: string; unchanged?: never }
  | { from?: never; to?: never; unchanged: string }
);

export const ChangePreview: React.FC<ChangePreviewProps> = (props) => {
  const { headline, footnote, from, to, unchanged } = props;

  return (
    <div className="border-primary/25 bg-primary/5 border p-3">
      <p className="text-muted-foreground text-xs font-medium">
        What this records
      </p>
      <p className="mt-1 text-sm">
        {headline}{" "}
        {unchanged ? (
          <span className="font-medium">{unchanged}</span>
        ) : (
          <span className="inline-flex flex-wrap items-baseline gap-1.5">
            <span className="font-medium">{from}</span>
            <IconArrowRight
              className="text-muted-foreground size-3.5 shrink-0 self-center"
              aria-hidden="true"
            />
            <span className="font-medium">{to}</span>
          </span>
        )}
      </p>
      <p className="text-muted-foreground mt-1 text-xs">{footnote}</p>
    </div>
  );
};

/**
 * "Whose it becomes": the current holder, the one successor, and the loan guard.
 *
 * Its own component for one reason beyond length — **it takes the successor's
 * *name* as a string rather than computing it**, which is what makes the
 * agreement between the notice's title and the preview's arrow structural: there
 * is one `holderLabel` in the parent, and both of them render it. A version that
 * re-derived the name from the row would be two expressions of the same fact, and
 * this is the dialog where "the item goes to S. Fernando" and "S. Fernando is
 * already in charge of this item" would both be catastrophic.
 */
const SuccessorFieldset = ({
  item,
  holderLabel,
  isOnLoan,
}: {
  item: InventoryItemView | null;
  holderLabel: string;
  isOnLoan: boolean;
}) => (
  <FieldSet>
    <FieldLegend>Whose it becomes</FieldLegend>
    <FieldGroup>
      {/*
        The current holder, stated as a fact before anything is chosen — because
        "who has it now" is the context that makes the sentence below mean
        something, and because it is the person this dialog is about to propose.
        `PartyName` and not a bare `??`: the four `*_staff_id` columns on the
        history are `set null` rather than cascaded, so a colleague who has since
        left the school still has a row, a name that renders struck through, and a
        claim this dialog would make real.

        A `<p>` and not a `FieldLabel`, because there is no control here to label —
        an unassociated `<label>` announces itself and then activates nothing.
      */}
      <Field>
        <p className="text-sm font-medium">Held by, right now</p>
        <p className="text-sm">
          {item ? (
            <PartyName
              name={item.custodianName}
              staffId={item.custodianStaffId}
              emptyLabel={IN_STORE}
            />
          ) : (
            <span className="text-muted-foreground">{CHOSEN_STAFF}</span>
          )}
        </p>
        <FieldDescription>
          Handing it on is not the same as asking for it back. Call it back if
          you want the item; hand it on if you want to stop being the person who
          answers for it.
        </FieldDescription>
      </Field>

      {/*
        The one successor, named in the interface rather than offered as a search
        that would fail. See the long note on `TransferOwnershipDialog`: the
        assignable-staff list is `adminProcedure`, so no picker on this page can
        be built at all, and the colleague holding the item is both the case
        `transferOwnership` was written for and the only person the caller has a
        legitimate way to name. Saying so here is what turns a limitation into
        something the teacher can act on.
      */}
      <InventoryInlineNotice
        tone="info"
        title={`This will put ${holderLabel} in charge of it`}
        description="They can be nobody else from this page. The list of staff school property may be given to is an administrator's read, and this page has no version of it, so the person holding the item is the one successor offered here — which is the ordinary case. To hand an item to somebody who is not holding it, ask an administrator, or ask the person in charge of it to sign it over to themselves first."
      />

      {isOnLoan ? (
        <InventoryInlineNotice
          tone="warning"
          title="This item may be out on a dated loan"
          description="Ownership cannot change while units are away: the loan has to be returned through its own record first, so the return date and the condition it came back in are kept. Go ahead — if that is the case, the server will say so."
        />
      ) : null}
    </FieldGroup>
  </FieldSet>
);

/**
 * "Why": the required cause, and the sentence beside it.
 *
 * **The requirement is presented as required from the first render, with the
 * button reflecting it rather than an error reporting it afterwards.**
 * `transferOwnership` declares `reason` as a required
 * `inventoryTransferReasonSchema`, and the database CHECK behind it
 * (`inventory_custody_history_reason_required`) refuses a `manager_changed` row
 * without a cause, because `manager_changed` is not one of the two exempt change
 * types. `TransferReasonField` carries the asterisk, the `aria-required` and the
 * explanation; the submit button staying shut until a cause is chosen is the other
 * half of the same promise. A warning that can only appear after the failure it
 * exists to prevent is a worse warning than none at all.
 */
const WhyFieldset = ({
  formId,
  reason,
  onReasonChange,
  note,
  onNoteChange,
  errors,
  isPending,
}: {
  formId: string;
  reason: string;
  onReasonChange: (reason: string) => void;
  note: string;
  onNoteChange: (note: string) => void;
  errors: OwnershipErrors;
  isPending: boolean;
}) => (
  <FieldSet>
    <FieldLegend>Why</FieldLegend>
    <FieldGroup>
      <TransferReasonField
        value={reason}
        onChange={onReasonChange}
        error={errors.reason}
        label="Why it is being handed on"
        description="Required, and written onto this item's history. A report can group handovers by cause, and this row is what it reads."
      />
      <Field data-invalid={Boolean(errors.note)}>
        <FieldLabel htmlFor={`${formId}-note`}>Note</FieldLabel>
        <Textarea
          id={`${formId}-note`}
          value={note}
          rows={3}
          maxLength={NOTE_MAX_LENGTH}
          placeholder="Optional. The detail the eight reasons above cannot carry — who has the other projector, which room it is going to."
          disabled={isPending}
          aria-invalid={errors.note ? true : undefined}
          aria-describedby={errors.note ? `${formId}-note-error` : undefined}
          onChange={(event) => onNoteChange(event.target.value)}
        />
        <FieldDescription>
          The reason is the category; this is the sentence. Both land on the
          same history row, and only the sentence survives a later question that
          turns out to be about one specific pair of people.
        </FieldDescription>
        <FieldError id={`${formId}-note-error`}>{errors.note}</FieldError>
      </Field>
    </FieldGroup>
  </FieldSet>
);

interface TransferOwnershipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItemView | null;
  /**
   * The current owner's name, for the preview's left-hand side. `null` only while
   * the first read is in flight, and the preview says "you" in that case — a
   * person reading a page about their own things is not a third person.
   */
  ownerName: string | null;
  isPending: boolean;
  /**
   * Resolves only on success. A refusal — the item is out on a dated loan, or the
   * successor is somebody school property may not be given to — rejects, and the
   * page's mutation handler toasts that sentence rather than a generic failure.
   * Those words are the most useful thing the API says here, so this dialog owns
   * no toast of its own: the outcome is reported once, from the one place that
   * owns the mutation.
   *
   * `newOwnerStaffId` arrives from here rather than being read by the page, because
   * **the successor is a fact this dialog is about** — it is the row's own
   * custodian pointer, named and shown in the preview, and a page that went and
   * fetched it independently would be trusting a second copy of the same row. The
   * type is the plain `string` the `staff` table's id is, and the server's
   * `staffIdSchema` is what validates it on the way in.
   */
  onSubmit: (values: {
    newOwnerStaffId: string;
    reason: TransferReason;
    note?: string;
  }) => Promise<void>;
}

/**
 * "This is yours now, and you are answerable for it."
 *
 * ## The verb, and why the successor is not a search box
 *
 * `transferOwnership` moves **the owner**, permanently. The item is in the same
 * cupboard it was in and it will be in the same cupboard afterwards; what changes
 * is the name a principal reads out when the microscope cannot be found. That is
 * why it is a separate verb from `transferCustody` (who is carrying it today) and
 * from `reclaimCustody` (take it back off them) rather than another mode of
 * either.
 *
 * **`newOwnerStaffId` is required and non-nullable here, and that is the whole
 * design in one line: this verb cannot leave the item unowned.** Leaving it with
 * nobody in charge of it is `assignManager({ newManagerStaffId: null })`, which is
 * gated on `update` and is therefore administrator-only. Two verbs writing one
 * column is deliberate rather than a duplicate — one says "somebody different is
 * answerable for this" and the other says "nobody is" — and a single nullable
 * input could not have told a caller which of those a `null` was going to do. So
 * there is no "leave it with nobody" path on this page, and there could not
 * honestly be one.
 *
 * **The successor offered here is the colleague currently holding the item, and
 * that is the only person this page can honestly offer.** The obvious
 * implementation is `StaffComboboxField`, and it is wrong here for one reason
 * that was read rather than assumed: it is built on
 * `orpc.inventory.options.assignableStaff`, which is `adminProcedure`
 * (`list-teacher-options.ts:145` — the export; the file kept its old name because
 * two files outside it cite the path). That gate was chosen *because*
 * `requireInventoryPermission("read")` is teacher-reachable, and it did not
 * change when the predicate did: the widening removed the `staffCategory`
 * restriction and left the audience alone, which makes this list **more** of a
 * staff directory than it was, not less. A FORBIDDEN picker inside a teacher's own
 * dialog is a control that always fails, which is the defect this feature already
 * removed from this page twice, in a new place.
 * `staff.listStaff` is no help either — it is `requireStaffPermission("read")`
 * and the `teacher` role grants no `staff` permission at all. There is still
 * **no** teacher-reachable procedure in the app that lists assignable staff, so a
 * general name picker on this dialog cannot be built from anything.
 *
 * What *is* legitimate is the holder, and for a stronger reason than necessity:
 * `transfer-ownership.ts` names this as the motivating case — "the motivating
 * scenario is an item lent to a colleague" — and the id is already on the row the
 * teacher is looking at, because `custody.lent` put it there under a gate a
 * `teacher` holds. So the dialog names one successor rather than offering a search
 * that would fail, and says so in the interface rather than failing quietly.
 *
 * The honest widening is a narrow `options.assignableOwners` procedure on
 * `read`, projected to `id` and `name` and nothing else and modelled on
 * `listTakeableItems`. That is a **server** change, not a permission change, and
 * it is not one a page can make for itself — and the widened
 * `listAssignableStaff` does not supply it, because that one is `adminProcedure`
 * and is meant to stay so.
 */
export const TransferOwnershipDialog = ({
  open,
  onOpenChange,
  item,
  ownerName,
  isPending,
  onSubmit,
}: TransferOwnershipDialogProps) => {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<OwnershipErrors>({});
  const formId = useId();

  /**
   * The holder, resolved to a **string** for the preview.
   *
   * `describeParty` is the folder's own string form of the same three cases
   * `PartyName` renders — a name, a departed staff record, an empty slot — so the
   * preview and the statement beside it cannot disagree about who is being talked
   * about. It is read off the row rather than off a picker, which is what makes
   * the sentence checkable: the pointer on this row is the pointer that will be
   * sent.
   */
  const holderLabel = item
    ? describeParty({
        name: item.custodianName,
        staffId: item.custodianStaffId,
        emptyLabel: IN_STORE,
      })
    : CHOSEN_STAFF;

  const ownerLabel = ownerName ?? "you";

  /**
   * The successor's id, and the one place this dialog refuses to continue.
   *
   * `newOwnerStaffId` is non-nullable on the wire, and the only thing that could
   * be sent in its place is nothing — which `transferOwnership` cannot express.
   * The predicate behind this dialog's list guarantees a holder
   * (`custodianStaffId IS NOT NULL AND custodianStaffId <> me`), so this is
   * unreachable from the page; it is here because `TransferOwnershipDialog` is a
   * component that could be handed any row, and "the write needs a person" is a
   * condition the write path must not be able to reach with a null. A silent
   * early return is deliberate: the alternative is rendering a preview whose arrow
   * points at nothing.
   */
  const successorId = item?.custodianStaffId ?? null;

  /**
   * The one server guard this dialog *states* and does not enforce — the same
   * column, and the same treatment, as `TakeOrReleaseDialog`'s loan notice on the
   * hand-back.
   *
   * `transferOwnership` refuses an item with units out on a dated loan: the borrow
   * has a due date, a borrower and a condition assessment, and moving the owner
   * would create a record the register cannot honour — an owner who has never
   * seen the equipment, answerable for somebody else's loan. Shutting the button
   * on `borrowedQty > 0` would hide the one thing the teacher most needs, which is
   * *why*, so the condition is written out and the server's own sentence is shown
   * verbatim on refusal. A guard is stated in exactly one place: this notice, and
   * not also in the preview's footnote.
   */
  const isOnLoan = (item?.borrowedQty ?? 0) > 0;

  const reset = () => {
    setReason("");
    setNote("");
    setErrors({});
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!item || successorId === null) {
      return;
    }

    const result = v.safeParse(ownershipSchema, { reason, note });

    if (!result.success) {
      setErrors(issuesToErrors(result.issues));
      return;
    }

    try {
      await onSubmit({
        newOwnerStaffId: successorId,
        reason: result.output.reason,
        ...(result.output.note ? { note: result.output.note } : {}),
      });
      reset();
    } catch (error) {
      /*
       * `setErrors(validationFieldErrors(error))` and nothing else — the folder's
       * rule, for the reason its comment gives: the page's `onError` has already
       * toasted the server's sentence, and a dialog that toasted as well would
       * print the identical words twice for every refusal. The toast is also the
       * only report that survives this dialog unmounting. Note *which* errors can
       * land here: the reason cannot be empty (the button is shut until one is
       * chosen), so the fields a refusal can be about are the two the server
       * declares — and a refusal that is a policy rather than a validation
       * (`assertStaffIsAssignable` refusing the successor) arrives as an
       * `ORPCError` sentence with no issues at all, and is carried by the toast
       * alone.
       */
      setErrors(validationFieldErrors<keyof OwnershipErrors>(error));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isPending) {
          reset();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Hand this on to somebody else</DialogTitle>
          <DialogDescription>
            {item ? (
              <>
                {item.name}{" "}
                <span className="font-mono text-xs">({item.sku})</span> stays
                the school&rsquo;s and does not move. What changes is whose name
                is read out when somebody asks where it is.
              </>
            ) : (
              "The item stays the school’s and does not move. What changes is whose name is read out when somebody asks where it is."
            )}
          </DialogDescription>
        </DialogHeader>

        <form
          id={formId}
          onSubmit={handleSubmit}
          className="flex-1 space-y-5 overflow-y-auto px-6 py-4"
        >
          <SuccessorFieldset
            item={item}
            holderLabel={holderLabel}
            isOnLoan={isOnLoan}
          />

          <WhyFieldset
            formId={formId}
            reason={reason}
            onReasonChange={setReason}
            note={note}
            onNoteChange={setNote}
            errors={errors}
            isPending={isPending}
          />

          {/*
            The preview sits last in the form, directly above the button that acts
            on it, so the sentence and the click are adjacent. It is built from the
            row's **current** pointers and the one successor this page can name —
            never from a guess about the two history rows the server will write, or
            about the `changeType` either of them carries.

            The footnote carries the one consequence with nowhere else to live: the
            server clears the holder as part of the transfer, so if the successor is
            physically sitting on the item, **the record stops saying so** and putting
            that back becomes their own `takeItem` to perform. A user must not meet
            that for the first time in the history sheet.
          */}
          <ChangePreview
            headline="In charge of this item"
            from={ownerLabel}
            to={holderLabel}
            footnote={`They become the person the school asks where it is, and you stop being it. The server also clears the current holder, so if ${holderLabel} is physically on it they will have to record that themselves. Two rows go onto this item's history — the change of who is in charge, and the release of the holder — and nothing about the item itself changes.`}
          />
        </form>

        <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            // The reason is a closed picklist with a database CHECK behind it, so
            // an empty submit is a refusal the user can be spared rather than one
            // worth learning from — and the field has been marked required on the
            // face of the form the whole time. The missing successor is the other
            // half of the same rule: this verb cannot leave the item unowned.
            disabled={isPending || reason === "" || successorId === null}
            data-icon="inline-start"
          >
            <IconUserCog data-icon="inline-start" />
            {isPending ? "Recording..." : "Hand it on"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
