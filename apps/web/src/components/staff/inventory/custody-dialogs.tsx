"use client";

import {
  inventoryTransferReasonLabel,
  inventoryTransferReasonSchema,
} from "@school-student-teacher-management/db/constants/inventory";
import { inventoryItemIdSchema } from "@school-student-teacher-management/db/schema/inventory";
import { staffIdSchema } from "@school-student-teacher-management/db/schema/staff";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
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
  FieldLegend,
  FieldSet,
} from "@school-student-teacher-management/ui/components/field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@school-student-teacher-management/ui/components/sheet";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import { Textarea } from "@school-student-teacher-management/ui/components/textarea";
import {
  IconArrowRight,
  IconBuildingWarehouse,
  IconPackageExport,
  IconUserCheck,
  IconUserCog,
  IconUserMinus,
  IconUserPlus,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type * as React from "react";
import { useState, useReducer, useMemo } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import type {
  CustodyHistoryEntry,
  InventoryItemView,
} from "@/components/staff/inventory/inventory-types";
import {
  InventoryEmptyState,
  InventoryErrorState,
  InventoryInlineNotice,
  StaffComboboxField,
  TransferReasonField,
  invalidateInventory,
  useAssignableStaffOptions,
} from "@/components/staff/inventory/shared";
import { PartyName } from "@/components/staff/inventory/stock-dialogs";
import { formatApiErrorMessage, validationFieldErrors } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

/**
 * What "nobody" is called on each side of a change.
 *
 * These are three different facts and one blank is not a name for any of them. A
 * *previous* custodian that is null means the item was sitting in the store
 * unheld; a *new* custodian that is null on a `custody_released` row means it has
 * gone back on a shelf; and a new manager that is null on a `manager_cleared` row
 * means the school has decided nobody is accountable for it. Writing "None" for
 * all three would flatten the only distinction that matters on an audit line, and
 * the third of those is the one this feature exists to close.
 */
const IN_STORE = "the store";
const NO_MANAGER = "nobody";

/**
 * One side of a before-and-after pair.
 *
 * A **null name beside a non-null id means the staff record has since been
 * deleted**, which is not the same as an empty slot: the four `*_staff_id` columns
 * on `inventoryCustodyHistory` are `set null` rather than cascade, precisely so a
 * departure retires the name without deleting the trail. The row still says what
 * happened and which pointer moved — the change type is intact, the reason is
 * intact — and the only thing missing is who. Rendering that as a blank would
 * assert something false ("nobody did this"); rendering it as an em-dash would
 * shrug at the reader. A struck-through label says *the record is gone and the
 * change was real*, and the strike-through is a second channel so the distinction
 * survives without relying on colour or weight.
 *
 * A null on **both** the id and the name is the other case: the slot was empty at
 * the time, which is a fact about the change rather than a missing value. That is
 * the `IN_STORE` / `NO_MANAGER` label, chosen per side.
 *
 * `PartyName` itself is shared — it was a third copy of this logic here, with its
 * own wording for the departed case, and one fact rendered three ways is how a
 * register starts lying about its own history.
 */
/** From, an arrow, to — the two sides given the weight they deserve. */
const PartyPair = ({
  previous,
  next,
}: {
  previous: React.ReactNode;
  next: React.ReactNode;
}) => (
  <span className="flex flex-wrap items-center gap-1.5">
    {previous}
    <IconArrowRight
      className="text-muted-foreground size-3.5 shrink-0"
      aria-hidden="true"
    />
    {next}
  </span>
);

/**
 * The before-and-after sentence, in the plain language an administrator would use
 * to tell a colleague what they just did.
 *
 * **This is the most valuable sentence in the feature and it costs one string.**
 * Every one of these changes writes a permanent row, and the question it will be
 * asked months later is "what happened here" — which the `reason` picklist answers
 * in eight words. Stating the change *before* the button is pressed is what
 * catches the genuinely expensive mistake: picking the wrong person out of a
 * roll of fifty with very similar names.
 *
 * The wording is built from the item's **current** pointer and the selection in
 * the form, never from a guess about the `changeType` the server will write. What
 * the server records is a first claim (`custody_taken`) when nothing holds the
 * item and a `custody_transferred` when somebody does, and the sentence says the
 * same thing in words: from the store, or from the person who has it.
 *
 * **There are two shapes, and the type makes the caller pick one.** A `from`/`to`
 * pair draws a move, so it is only honest for a request that will move something.
 * A request that records nothing — the manager dialog's "leave as is" state, or a
 * somebody re-appointed over themselves — gets `unchanged` instead, which is a
 * *sentence* and not an arrow, because an arrow drawn for a change that will not
 * happen is a description of a state the register is already in and invites the
 * reader to believe something is about to happen to it. The union is the
 * enforcement: there is no way to pass a pair and a sentence at once, and no way
 * to pass neither. (A blank is not an option here either — the whole value of this
 * component is that it always says something true.)
 */
type ChangePreviewProps = { headline: string; footnote: string } & (
  | { from: string; to: string; unchanged?: never }
  | { from?: never; to?: never; unchanged: string }
);

const ChangePreview: React.FC<ChangePreviewProps> = (props) => {
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
 * Resolve a staff id to a display name, for the preview only.
 *
 * The combobox's contract is an id out and an id in, and the assignable-staff
 * list is paged at fifty — so on a school with more eligible members of staff
 * than fit on the first page, the name of a *selected* person can genuinely be
 * outside what the client holds. Rather than print a UUID, the preview falls back
 * to a phrase that is true in both cases, and the server's response carries the
 * authoritative name: the success toast says "Custody moved to S. Fernando" and
 * the register row shows it a moment later. A preview that is occasionally a UUID
 * is worse than one that is occasionally a phrase.
 */
const usePartyName = (staffId: string | null): string | null => {
  const { options } = useAssignableStaffOptions();

  if (!staffId) {
    return null;
  }

  return options.find((option) => option.id === staffId)?.name ?? null;
};

/**
 * The receiving side of a preview, when the name is not (or not yet) known.
 *
 * Interpolated into four prose blocks in this file — the transfer, manager and
 * hand-on previews — and it says *member of staff* because that is the whole set
 * the field now offers. "Teacher" here would be a claim about a person the reader
 * has not chosen yet, and it would be wrong for the bursar.
 */
const CHOSEN_STAFF = "the member of staff you choose";

type CustodyErrors = Partial<
  Record<"newCustodianStaffId" | "reason" | "note", string>
>;

/**
 * The same record with the successor's own key, because the key has to match the
 * wire: `transferOwnership`'s input is `newOwnerStaffId`, and an error filed under
 * a different name lands nowhere on the form.
 */
type OwnershipErrors = Partial<
  Record<"newOwnerStaffId" | "reason" | "note", string>
>;

/**
 * `transferOwnership`'s input, as a form shape: a successor that must be a person
 * and a cause that must be one of the eight.
 *
 * **The successor is a plain `string` here and a non-nullable id on the wire, and
 * the empty string is what "nobody chosen yet" looks like on the way in.** There is
 * no third state to encode because this verb cannot express one — see the two-verb
 * banner above `TransferOwnershipDialog` — so the field is the ordinary picker and
 * the schema is what turns an untouched form into a message on the right control.
 */
const ownershipSchema = v.object({
  newOwnerStaffId: v.pipe(
    v.string(),
    v.minLength(
      1,
      "Choose the member of staff who will be in charge of this item"
    )
  ),
  reason: inventoryTransferReasonSchema,
  note: v.pipe(v.string(), v.trim(), v.maxLength(500)),
});

const transferSchema = v.object({
  newCustodianStaffId: v.pipe(
    v.string(),
    v.minLength(1, "Choose the member of staff who will hold this item")
  ),
  reason: inventoryTransferReasonSchema,
  note: v.pipe(v.string(), v.trim(), v.maxLength(500)),
});

/**
 * `reason` plus the optional note, for the verbs that take nothing else.
 *
 * **One schema for two dialogs, because the pair really is the same shape.**
 * `assignManager`, `transferOwnership` and `reclaim` all take a cause and a
 * sentence and nothing more — the difference between them is *who* may press the
 * button and *what else moves*, neither of which is a field. Spelling the object
 * out three times is how `AssignManagerDialog` and `ReclaimCustodyDialog` end up
 * asking for the reason in different words, and the reason is the one thing on
 * these rows an audit reads.
 *
 * `note` is trimmed and capped at 500, and **only sent when it is non-empty**:
 * the server's own input is `optional(pipe(string(), minLength(1)))`, so an empty
 * string is not "no note" there, it is a validation failure. Every caller spreads
 * it conditionally for that reason.
 */
const reasonAndNoteSchema = v.object({
  reason: inventoryTransferReasonSchema,
  note: v.pipe(v.string(), v.trim(), v.maxLength(500)),
});

const noteSchema = v.pipe(v.string(), v.trim(), v.maxLength(500));

/**
 * Only the keys valibot objected to, so each issue lands on the field that caused
 * it. It takes the **issues** rather than the result object because
 * `v.SafeParseResult` is generic over the *schema*, and threading a schema type
 * through a helper whose whole job is to read `issue.path[0].key` would buy
 * nothing.
 */
const issuesToErrors = <T extends string>(
  issues: readonly {
    path?: readonly { key?: unknown }[] | null;
    message: string;
  }[]
): Partial<Record<T, string>> => {
  const errors: Partial<Record<T, string>> = {};

  for (const issue of issues) {
    const key = issue.path?.[0]?.key;
    if (typeof key === "string" && !(key in errors)) {
      errors[key as T] = issue.message;
    }
  }

  return errors;
};

/** The button label for a dialog that writes, so four dialogs agree on the wording. */
const submitLabel = (isPending: boolean, done: string): string =>
  isPending ? "Recording..." : done;

/** "Currently held by …", and the two states it can be in.
 *
 * Extracted because the honest version of this is a *pair* of outcomes rather
 * than a fallback string: a named holder, or a stated fact that there is none.
 * An em-dash would have been the third option and would have been the wrong one,
 * because it reads as missing data rather than as the answer.
 */
const CurrentHolderBadge: React.FC<{ item: InventoryItemView | null }> = ({
  item,
}) => (
  <div className="flex flex-wrap items-center gap-2">
    <span className="text-muted-foreground text-sm">Currently held by</span>
    {item?.custodianName ? (
      <Badge>
        <IconUserCheck />
        {item.custodianName}
      </Badge>
    ) : (
      <Badge variant="outline" className="border-dashed">
        <IconBuildingWarehouse />
        Nobody — it is in the store
      </Badge>
    )}
  </div>
);

/** "Currently in charge …", with the same two states. */
const CurrentManagerBadge: React.FC<{ item: InventoryItemView | null }> = ({
  item,
}) => (
  <div className="flex flex-wrap items-center gap-2">
    <span className="text-muted-foreground text-sm">Currently in charge</span>
    {item?.managerName ? (
      <Badge className="border-primary/30 bg-primary/10 text-primary">
        <IconUserCheck />
        {item.managerName}
      </Badge>
    ) : (
      <Badge variant="outline" className="border-dashed">
        <IconUserCog />
        Nobody
      </Badge>
    )}
  </div>
);

interface TransferCustodyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItemView | null;
  isPending: boolean;
  /**
   * Resolves only on success. A refusal — "R. Perera is already the custodian of
   * this item" — rejects, and the page's mutation handler toasts that sentence
   * rather than a generic failure. Those words are the most useful thing the API
   * says anywhere in this feature, so the dialogs deliberately do **not** toast:
   * the outcome is reported once, from the one place that owns the mutation.
   */
  onSubmit: (values: {
    itemId: string;
    newCustodianStaffId: string;
    reason: string;
    note?: string;
  }) => Promise<void>;
}

/**
 * Hand an item from one member of staff to another.
 *
 * **The reason is presented as required from the first render, never as an error
 * the user discovers on submit.** `transferCustody` declares `reason` as a required
 * `inventoryTransferReasonSchema`, and the database CHECK behind it
 * (`inventory_custody_history_reason_required`) refuses a row that replaces or
 * clears a holder without recording a cause. `TransferReasonField` carries the
 * asterisk and the explanation itself, so this dialog's job is *not* to add a
 * warning that the field is required — a warning that can only appear after the
 * failure it exists to prevent is a worse warning than none at all.
 *
 * Note the asymmetry the server keeps, because the copy has to match it: the
 * database exempts a *first* claim on an unheld item from needing a reason
 * (nothing was displaced), while the API input demands one unconditionally. The
 * dialog therefore always asks, and says below the field why — "recorded as a
 * first claim" — rather than pretending the answer will be ignored.
 */
export const TransferCustodyDialog = ({
  open,
  onOpenChange,
  item,
  isPending,
  onSubmit,
}: TransferCustodyDialogProps) => {
  const [receiverId, setReceiverId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<CustodyErrors>({});
  const receiverName = usePartyName(receiverId);

  const isFirstClaim = item !== null && item.custodianStaffId === null;
  const isUnchanged =
    receiverId !== null && receiverId === item?.custodianStaffId;
  const currentHolder = item?.custodianName ?? IN_STORE;

  const reset = () => {
    setReceiverId(null);
    setReason("");
    setNote("");
    setErrors({});
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!item) {
      return;
    }

    const result = v.safeParse(transferSchema, {
      newCustodianStaffId: receiverId ?? "",
      reason,
      note,
    });

    if (!result.success) {
      setErrors(issuesToErrors<keyof CustodyErrors>(result.issues));
      return;
    }

    /*
     * `reset()` inside the `try` and not after it, which is the whole point of the
     * wrapper: a rejected write must leave the dialog open with the reason, the note
     * and the chosen person intact, because the user is being asked to *change*
     * something after reading the server's sentence. The page's `onError` has
     * already toasted that sentence — these dialogs deliberately own no toast of
     * their own, so the outcome is still reported once, from the one place that owns
     * the mutation. Swallowing the rejection here does not swallow the report.
     */
    try {
      await onSubmit({
        itemId: item.id,
        newCustodianStaffId: result.output.newCustodianStaffId,
        reason: result.output.reason,
        ...(result.output.note ? { note: result.output.note } : {}),
      });
      reset();
    } catch {
      // Refused, or the connection dropped mid-transfer. Either way the data stays.
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
          <DialogTitle>Transfer custody</DialogTitle>
          <DialogDescription>
            {item ? (
              <>
                {item.name}{" "}
                <span className="font-mono text-xs">({item.sku})</span> — this
                records who held it, who holds it now, and why
              </>
            ) : (
              "This records who held the item, who holds it now, and why"
            )}
          </DialogDescription>
        </DialogHeader>

        <form
          id="transfer-custody-form"
          onSubmit={handleSubmit}
          className="flex-1 space-y-5 overflow-y-auto px-6 py-4"
        >
          <FieldSet>
            <FieldLegend>Hands</FieldLegend>
            <FieldGroup>
              {/*
                The current holder, stated as a fact before the receiver is even
                chosen — and stated when there is nobody, because "nobody holds
                this, so this is a first claim" is the context that decides whether
                the reason below is a real cause or a formality.
              */}
              <CurrentHolderBadge item={item} />

              {isFirstClaim ? (
                <InventoryInlineNotice
                  tone="info"
                  title="This will be recorded as a first claim"
                  description="Nobody is holding this, so nothing is being displaced and the change is logged as a claim rather than a transfer. The reason is asked for anyway: a later audit cannot tell a first claim from a hand-over without it."
                />
              ) : null}

              <StaffComboboxField
                value={receiverId}
                onChange={setReceiverId}
                label="Hand it to"
                description="Only members of staff who are still employed can be given school property — teaching staff and office staff alike. This is the same list the server accepts, so anybody offered here will be accepted."
                disabled={isPending}
                error={errors.newCustodianStaffId}
                placeholder="Search for the member of staff taking it..."
                allowClear
              />

              {isUnchanged ? (
                <InventoryInlineNotice
                  tone="warning"
                  title="That person already holds this item"
                  description="The server refuses a transfer to the current custodian, because that would be a no-op on the record. Pick somebody else, or use Return to the store if the item is going back on the shelf."
                />
              ) : null}
            </FieldGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend>Why</FieldLegend>
            <FieldGroup>
              <TransferReasonField
                value={reason}
                onChange={setReason}
                error={errors.reason}
                description="Required on every transfer, not only this one."
              />
              <Field data-invalid={Boolean(errors.note)}>
                <FieldLabel htmlFor="transfer-custody-note">Note</FieldLabel>
                <Textarea
                  id="transfer-custody-note"
                  value={note}
                  rows={3}
                  maxLength={500}
                  placeholder="Optional. The detail the eight reasons above cannot carry — who has the other projector, which room it is going to."
                  disabled={isPending}
                  aria-invalid={errors.note ? true : undefined}
                  aria-describedby={
                    errors.note ? "transfer-custody-note-error" : undefined
                  }
                  onChange={(event) => setNote(event.target.value)}
                />
                <FieldDescription>
                  The reason is the category; this is the sentence. Both land on
                  the same history row, and only the sentence survives a later
                  question that turns out to be about one specific pair of
                  people.
                </FieldDescription>
                <FieldError id="transfer-custody-note-error">
                  {errors.note}
                </FieldError>
              </Field>
            </FieldGroup>
          </FieldSet>

          {/*
            The preview sits last in the form, directly above the button that acts
            on it, so the sentence and the click are adjacent. The unknown-name
            fallback is deliberate — see `usePartyName` — and the wording is true
            whether or not the name resolves.
          */}
          <ChangePreview
            headline="Custody moves"
            from={currentHolder}
            to={receiverName ?? CHOSEN_STAFF}
            footnote={
              isUnchanged
                ? "Nothing to record yet — that is the person who already holds it."
                : "A row is appended to this item's custody history. Nothing is deleted, and a transfer cannot be undone from the register: a second transfer is what corrects it, and it carries its own reason."
            }
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
            form="transfer-custody-form"
            disabled={isPending}
            data-icon="inline-start"
          >
            <IconUserCheck data-icon="inline-start" />
            {submitLabel(isPending, "Record transfer")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/**
 * **What this dialog has been asked to do, which is not the same as what is in the
 * person field.**
 *
 * There are three answers and only two of them name a person:
 *
 * - `leave` — nobody was chosen, so there is no request. Nothing is sent.
 * - `appoint` — a staff id, which may be a first appointment or a replacement.
 * - `clear` — a deliberate removal, reached only through a confirmed second step.
 *
 * **A binary cannot express these, which is the bug this type exists to prevent.**
 * The field is `string | null`, so the only two things it can hold are "a person"
 * and "nobody", and the obvious encoding — `null` meaning "nobody chosen" —
 * makes *not touching the dialog* identical to *removing the manager*. Those are
 * opposite requests with opposite consequences, and the destructive one is the
 * default. An administrator who opens the dialog on a projector that has a manager,
 * picks a reason, forgets the person field and presses the button is three clicks
 * from an item nobody is accountable for — which is the exact state this feature
 * was built to close.
 *
 * So the untouched state is `undefined`: not a person, not a name,
 * and above all not a request. `null` can only be reached by pressing "No manager —
 * clear the slot" and then confirming, and the `reset` action puts the field back to
 * `undefined` rather than to `null` — a dialog that reopens in its destructive state
 * is the original bug, and closing it must not be the only way out of it. If this
 * ever goes back to two states, the label, the submit button and the preview all
 * have to be re-read together: the bug was never the state itself, it was three
 * places agreeing that a blank was an instruction.
 */
type ManagerDecision =
  | { kind: "leave" }
  | { kind: "appoint"; staffId: string; name: string | null }
  | { kind: "clear" };

/** The three states, read off the field's own value. */
const managerDecision = (
  choice: string | null | undefined,
  name: string | null
): ManagerDecision => {
  if (choice === undefined) {
    return { kind: "leave" };
  }

  if (choice === null) {
    return { kind: "clear" };
  }

  return { kind: "appoint", staffId: choice, name };
};

/**
 * The same person twice, which the server refuses.
 *
 * A warning rather than a disabled button, because the refusal's own sentence is
 * better than anything guessed here — the same reasoning that leaves the
 * `releaseCustody` loan guard to the server.
 */
const isNoopAppointment = (
  decision: ManagerDecision,
  currentManagerId: string | null
): boolean =>
  decision.kind === "appoint" &&
  currentManagerId !== null &&
  decision.staffId === currentManagerId;

/**
 * The dialog's own form state, as one reducer.
 *
 * **The invariant this buys is that a reset cannot be half-applied.** Five fields
 * change together when the dialog closes or a write succeeds, and the one that
 * matters most is `choice`: a dialog that reopens with a leftover `null` in it is
 * the destructive-default bug this whole rewrite exists to prevent, so clearing
 * everything *except* the dangerous field would be the worst possible refactor.
 * With a reducer that is a structural impossibility rather than a convention
 * somebody has to remember, and the project's own rule agrees.
 *
 * `confirmClear` is one action for the same reason: closing the confirm and
 * setting the cleared state cannot come apart, so there is no ordering in which the
 * dialog says "nobody" without the confirmation having happened, or shows a
 * confirmation for a clearing that was never applied.
 */
interface ManagerFormState {
  /** A staff id to appoint, `null` for a confirmed clearing, or untouched. */
  choice: string | null | undefined;
  reason: string;
  note: string;
  errors: CustodyErrors;
  isClearConfirmOpen: boolean;
}

const INITIAL_MANAGER_FORM: ManagerFormState = {
  choice: undefined,
  reason: "",
  note: "",
  errors: {},
  isClearConfirmOpen: false,
};

type ManagerFormAction =
  | { type: "choose"; staffId: string | null }
  | { type: "reason"; value: string }
  | { type: "note"; value: string }
  | { type: "invalid"; errors: CustodyErrors }
  | { type: "openClearConfirm" }
  | { type: "cancelClearConfirm" }
  | { type: "confirmClear" }
  | { type: "keepManager" }
  | { type: "reset" };

const managerFormReducer = (
  state: ManagerFormState,
  action: ManagerFormAction
): ManagerFormState => {
  switch (action.type) {
    /*
     * A `null` here cannot mean "clear": the combobox is given no clear affordance
     * (`allowClear` is off) and the only route to `null` is `confirmClear`. The
     * combobox's own contract is `string | null`, so a null arriving on the
     * selection callback is not a state this form has — and reading it as untouched
     * is the only safe way to absorb it, because the other reading is a removal
     * nobody asked for.
     */
    case "choose": {
      return { ...state, choice: action.staffId ?? state.choice ?? undefined };
    }
    case "reason": {
      return { ...state, reason: action.value };
    }
    case "note": {
      return { ...state, note: action.value };
    }
    case "invalid": {
      return { ...state, errors: action.errors };
    }
    case "openClearConfirm": {
      return { ...state, isClearConfirmOpen: true };
    }
    case "cancelClearConfirm": {
      return { ...state, isClearConfirmOpen: false };
    }
    case "confirmClear": {
      return { ...state, choice: null, isClearConfirmOpen: false };
    }
    case "keepManager": {
      return { ...state, choice: undefined };
    }
    case "reset": {
      return INITIAL_MANAGER_FORM;
    }
    default: {
      return state;
    }
  }
};

/**
 * The preview for all four outcomes — appoint over nobody, replace somebody, clear
 * somebody, and record nothing at all.
 *
 * Returned as `ChangePreviewProps` rather than a bespoke shape so the two states
 * that record nothing cannot be rendered as a move: a caller spreading this into
 * `ChangePreview` gets the union's own enforcement, and a branch that forgot which
 * of the two it was would not type-check.
 *
 * "Accountability moves" appears twice on purpose — a replacement and a clearing
 * are different `changeType`s with different consequences, and the footnote is what
 * tells them apart.
 */
const buildManagerPreview = (
  decision: ManagerDecision,
  currentManager: string | null,
  currentManagerId: string | null
): ChangePreviewProps => {
  const from = currentManager ?? NO_MANAGER;

  if (decision.kind === "leave") {
    return {
      headline: "Nothing will be written",
      unchanged: currentManager
        ? `Accountability is unchanged: ${currentManager} stays in charge.`
        : "Accountability is unchanged: this item still has nobody in charge.",
      footnote:
        "This dialog records a change, so while nobody is chosen nothing is sent to the server and no history row is appended. Choosing somebody above appoints or replaces; clearing the slot is a separate, confirmed step.",
    };
  }

  if (decision.kind === "clear") {
    if (!currentManager) {
      return {
        headline: "There is nothing to record —",
        unchanged:
          "This item has nobody in charge, so there is no manager to remove.",
        footnote:
          "The server refuses clearing a slot that is already empty, and this one already is.",
      };
    }

    return {
      headline: "Accountability moves",
      from,
      to: "nobody — this item will have no manager",
      footnote: `A manager-cleared row is appended to this item's history, naming ${from} and the cause you pick. The item keeps its custodian and does not move: clearing accountability never moves custody.`,
    };
  }

  /*
   * `isNoopAppointment` rather than the condition written out again: the warning
   * notice above the fields and the sentence here are the same claim about the same
   * form, and two copies of that condition is one copy waiting to be edited.
   */
  if (isNoopAppointment(decision, currentManagerId)) {
    return {
      headline: "There is nothing to record —",
      unchanged: `${from} is already in charge of this item.`,
      footnote:
        "The server refuses a change to the manager who is already in charge, so this would not be recorded. Choose somebody else, or close the dialog and leave it as it is.",
    };
  }

  const footnote =
    "A row is appended to this item's history, naming the new person and the cause. The custodian is not touched — the two are separate facts with separate halves of this trail.";

  if (currentManager) {
    return {
      headline: "Accountability moves",
      from,
      to: decision.name ?? CHOSEN_STAFF,
      footnote,
    };
  }

  return {
    headline: "Accountability is recorded as",
    from,
    to: decision.name ?? CHOSEN_STAFF,
    footnote,
  };
};

/**
 * The confirm on the destructive third state.
 *
 * `allowClear` is not a convenience on this field — it is the feature, and it is the
 * reason the field has three states rather than two. The manager is the person a
 * principal asks why the science cupboard is short, and an item can genuinely have
 * nobody: a line of stock nobody has taken responsibility for yet, or a manager who
 * has left and whose replacement has not been decided. `assignManager` takes
 * `newManagerStaffId: null` and writes a `manager_cleared` history row, so "remove
 * the current manager" and "leave it alone" are two different requests and the
 * field has to be able to say both — which means the removal needs its own
 * confirmation rather than a badge that appears because a box is empty.
 *
 * The dialog says what the removal *is* and what it is *not*: the custodian is
 * untouched and the item does not move, which is the two things a reader of an
 * accountability trail will assume happened.
 */
const ClearManagerDialog: React.FC<{
  isOpen: boolean;
  isPending: boolean;
  itemName: string;
  currentManager: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ isOpen, isPending, itemName, currentManager, onCancel, onConfirm }) => (
  <AlertDialog
    open={isOpen}
    onOpenChange={(next) => {
      if (!next) {
        onCancel();
      }
    }}
  >
    <AlertDialogContent className="sm:max-w-md">
      <AlertDialogTitle>Clear the manager for {itemName}?</AlertDialogTitle>
      <AlertDialogDescription>
        {currentManager
          ? `${currentManager} will stop being accountable for this item, and that is written to the item's history as a manager-cleared row with the reason you pick.`
          : "Nobody will be accountable for this item, and that is written to the item's history as a manager-cleared row with the reason you pick."}{" "}
        The item keeps its custodian and does not move: accountability and
        custody are separate facts on this trail, and clearing one never moves
        the other.
        {currentManager
          ? ` If you meant to leave ${currentManager} in charge, cancel — the dialog defaults to changing nothing.`
          : " If you meant to appoint somebody instead, cancel."}
      </AlertDialogDescription>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isPending}>
          Leave {currentManager ?? "it"} as it is
        </AlertDialogCancel>
        <AlertDialogAction
          onClick={onConfirm}
          disabled={isPending}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {isPending ? "Recording..." : "Clear the manager"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

/**
 * The label, the explanation and the button, one per state.
 *
 * All three are derived from the same `ManagerDecision` so they cannot disagree
 * about what the form is about to do — the original bug was three components each
 * reading `managerId === null` and each concluding that the dialog was asking for a
 * removal.
 */
const managerFieldLabel = (decision: ManagerDecision): string => {
  if (decision.kind === "clear") {
    return "In charge of this item — will become nobody";
  }

  if (decision.kind === "leave") {
    return "In charge of this item — leaving as is";
  }

  return "In charge of this item";
};

const managerFieldDescription = (
  decision: ManagerDecision,
  currentManager: string | null
): string => {
  if (decision.kind === "clear") {
    return "This records a manager-cleared row with your reason. The item keeps its custodian: clearing accountability never moves custody.";
  }

  if (decision.kind === "leave") {
    return "Nobody is chosen, so nothing is recorded and the current manager stays exactly as they are. Choosing somebody here appoints or replaces; clearing the slot is a separate, confirmed step below — the two write different rows, so the field has to be able to say which one you meant.";
  }

  return currentManager
    ? `This replaces ${currentManager} as the manager of this item. The custodian is not touched — accountability and custody are separate facts on this trail.`
    : "This appoints the person a principal would ask about this item. The custodian is not touched — accountability and custody are separate facts on this trail.";
};

const managerSubmitLabel = (
  isPending: boolean,
  decision: ManagerDecision
): string => {
  if (isPending) {
    return "Recording...";
  }

  if (decision.kind === "leave") {
    return "Nothing to record";
  }

  return decision.kind === "clear" ? "Record removal" : "Record manager";
};

interface AssignManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItemView | null;
  isPending: boolean;
  onSubmit: (values: {
    itemId: string;
    newManagerStaffId: string | null;
    reason: string;
    note?: string;
  }) => Promise<void>;
}

/**
 * Appoint, replace or remove the person in charge of an item.
 *
 * **The field opens on the untouched state and the untouched state records
 * nothing.** See `ManagerDecision` for why a binary field cannot carry these three
 * answers; the short version is that a `string | null` picker makes "nobody was
 * chosen" and "nobody is in charge" the same value, and only one of those is
 * something anybody meant to do. So `managerChoice` starts `undefined`, the
 * combobox is given no clear affordance of its own (`allowClear` is off), and the
 * removal is a button that opens a confirm. The `reset` on close puts the field
 * back to `undefined` — a dialog that reopens in its destructive state is the
 * original bug, and closing it must not be the only way out of it.
 *
 * Clearing the manager does **not** touch the custodian. They are two separate
 * facts with two separate halves of the same history table, and the dialog says so
 * at the moment it clears one while the other is set.
 *
 * **This is the other of the two verbs that write the owner column, and the one
 * that can leave it empty.** `transferOwnership` is the owner's own hand-on, gated
 * on `manageOwn` with a required successor; this one is gated on `update` and its
 * successor is nullable. The argument for keeping them apart is written out above
 * `TransferOwnershipDialog`, and the short version is that a single nullable input
 * could not tell a caller whether a `null` was going to name somebody else or
 * nobody — which is the ambiguity `ManagerDecision` already had to be built to
 * survive in this very dialog.
 */
export const AssignManagerDialog = ({
  open,
  onOpenChange,
  item,
  isPending,
  onSubmit,
}: AssignManagerDialogProps) => {
  /*
   * One reducer, whose initial `choice` is `undefined` with no initialiser to forget:
   * the untouched state *is* the absence of a value, and the reset action is the
   * only thing that clears it. See `ManagerFormState`.
   */
  const [form, dispatch] = useReducer(managerFormReducer, INITIAL_MANAGER_FORM);
  const { choice: managerChoice, reason, note, errors } = form;

  const currentManager = item?.managerName ?? null;
  const currentManagerId = item?.managerStaffId ?? null;
  const incomingName = usePartyName(managerChoice ?? null);
  const decision = managerDecision(managerChoice, incomingName);
  const isNoop = isNoopAppointment(decision, currentManagerId);
  const preview = buildManagerPreview(
    decision,
    currentManager,
    currentManagerId
  );

  /**
   * Only a manager the item actually has can be removed: `assignManager` refuses
   * clearing a slot that is already empty, so with nobody in charge the button
   * would offer a request the server always rejects.
   */
  const canClear = currentManagerId !== null && decision.kind !== "clear";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!item) {
      return;
    }

    /*
     * The third state is the absence of a request, not a request to clear, so it
     * is refused here rather than being left to a disabled button: a form submits
     * on Enter, and a disabled submit button does not stop that. Sending `null` for
     * "the user did not choose anyone" is the exact bug this dialog was rewritten
     * to remove, and it must not be reachable by any route.
     */
    if (managerChoice === undefined) {
      return;
    }

    const result = v.safeParse(reasonAndNoteSchema, { reason, note });
    if (!result.success) {
      dispatch({
        type: "invalid",
        errors: issuesToErrors<keyof CustodyErrors>(result.issues),
      });
      return;
    }

    try {
      await onSubmit({
        itemId: item.id,
        newManagerStaffId: managerChoice,
        reason: result.output.reason,
        ...(result.output.note ? { note: result.output.note } : {}),
      });
      dispatch({ type: "reset" });
    } catch {
      // Refused, or the connection dropped. The dialog keeps the chosen person, the
      // reason and the note; the page's `onError` has already toasted the server's
      // sentence, and these dialogs deliberately own no toast of their own.
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !isPending) {
            dispatch({ type: "reset" });
          }
          onOpenChange(next);
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle>Assign or change manager</DialogTitle>
            <DialogDescription>
              {item ? (
                <>
                  Who is accountable for {item.name} — a different question from
                  who is holding it
                </>
              ) : (
                "Who is accountable for this item, which is a different question from who is holding it"
              )}
            </DialogDescription>
          </DialogHeader>

          <form
            id="assign-manager-form"
            onSubmit={handleSubmit}
            className="flex-1 space-y-5 overflow-y-auto px-6 py-4"
          >
            <FieldSet>
              <FieldLegend>Accountability</FieldLegend>
              <FieldGroup>
                <CurrentManagerBadge item={item} />

                <StaffComboboxField
                  /*
                   * `undefined` and `null` both render as an empty field, because
                   * the combobox's contract is `string | null` — so the *label* and
                   * the *description* are what carry the difference, and they are
                   * derived from the same decision the preview and the button use.
                   * `onChange` never sees a null: the clear affordance is the button
                   * below, and a null arriving anyway is read as "nothing chosen",
                   * which is the only safe reading of it.
                   */
                  value={managerChoice ?? null}
                  onChange={(next) =>
                    dispatch({ type: "choose", staffId: next })
                  }
                  label={managerFieldLabel(decision)}
                  description={managerFieldDescription(
                    decision,
                    currentManager
                  )}
                  disabled={isPending}
                  placeholder="Search for the person in charge..."
                />

                {/*
                  The removal is an explicit, separately confirmed act rather than
                  the meaning of an empty box. The badge states the state the field
                  is in, and the button beside it is the way back — a removal the
                  user cannot undo inside the form is a removal they will be afraid
                  to attempt.
                */}
                {decision.kind === "clear" ? (
                  <Field>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="text-muted-foreground w-fit border-dashed"
                      >
                        <IconUserMinus />
                        Will be recorded as: nobody
                      </Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() => dispatch({ type: "keepManager" })}
                      >
                        Keep {currentManager ?? "the current manager"}
                      </Button>
                    </div>
                  </Field>
                ) : null}

                {canClear ? (
                  <Field>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => dispatch({ type: "openClearConfirm" })}
                      data-icon="inline-start"
                    >
                      <IconUserMinus data-icon="inline-start" />
                      No manager — clear the slot
                    </Button>
                    <FieldDescription>
                      Removes {currentManager} as the manager of this item and
                      records it. This is not what the empty field above means:
                      the empty field means nothing was chosen, and choosing
                      nothing records nothing.
                    </FieldDescription>
                  </Field>
                ) : null}

                {isNoop ? (
                  <InventoryInlineNotice
                    tone="warning"
                    title="That is already the current manager"
                    description="The server refuses a change to the manager who is already in charge, so pick somebody else, or close the dialog and leave it as it is."
                  />
                ) : null}
              </FieldGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend>Why</FieldLegend>
              <FieldGroup>
                <TransferReasonField
                  value={reason}
                  onChange={(value) => dispatch({ type: "reason", value })}
                  error={errors.reason}
                  description="Required on an appointment, a replacement and a clearing alike."
                />
                <Field data-invalid={Boolean(errors.note)}>
                  <FieldLabel htmlFor="assign-manager-note">Note</FieldLabel>
                  <Textarea
                    id="assign-manager-note"
                    value={note}
                    rows={3}
                    maxLength={500}
                    placeholder="Optional. What the next person to read this row will want to know."
                    disabled={isPending}
                    aria-invalid={errors.note ? true : undefined}
                    aria-describedby={
                      errors.note ? "assign-manager-note-error" : undefined
                    }
                    onChange={(event) =>
                      dispatch({ type: "note", value: event.target.value })
                    }
                  />
                  <FieldError id="assign-manager-note-error">
                    {errors.note}
                  </FieldError>
                </Field>
              </FieldGroup>
            </FieldSet>

            <ChangePreview {...preview} />
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
              form="assign-manager-form"
              disabled={isPending || decision.kind === "leave"}
              data-icon="inline-start"
            >
              <IconUserCog data-icon="inline-start" />
              {managerSubmitLabel(isPending, decision)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ClearManagerDialog
        isOpen={form.isClearConfirmOpen}
        isPending={isPending}
        itemName={item?.name ?? "this item"}
        currentManager={currentManager}
        onCancel={() => dispatch({ type: "cancelClearConfirm" })}
        onConfirm={() => dispatch({ type: "confirmClear" })}
      />
    </>
  );
};

/**
 * ## The two verbs that write the owner column, and why there are two
 *
 * `transferOwnership` and `assignManager` both write `managerStaffId`, and they
 * are **not** two modes of one thing:
 *
 * - **`transferOwnership`** — *somebody different is now the person the school
 *   asks about this item.* Gated on `requireInventoryPermission("manageOwn")`, so
 *   the owner (who in this school is usually a `teacher`) is the one who can use
 *   it, and narrowed **in the handler** to the caller being `managerStaffId` or
 *   sitting in one of the three leadership seats on an owner's behalf.
 * - **`assignManager`** — *nobody is, or the record is being corrected.* Gated on
 *   `update`, which is administrator-only, and its `newManagerStaffId` is
 *   nullable so the same verb can also **clear** the slot into a
 *   `manager_cleared` row.
 *
 * **Two verbs, one column, on purpose, and a single nullable input could not have
 * been one dialog.** A `null` in one field would have to mean either "somebody
 * else is answerable" or "nobody is", and a caller could not tell which a `null`
 * was going to do — which is precisely the ambiguity `ManagerDecision` above
 * exists to prevent, where "nobody was chosen" and "nobody is in charge" became
 * the same value and the destructive reading was the default. Here the server
 * refuses to let the ambiguity through, so the dialog must not create it either:
 * `newOwnerStaffId` is **required and non-nullable**, and that is what lets this
 * dialog's picker be an ordinary `string | null` with no third state to guard.
 * `null` here can only mean *nobody chosen yet*, nothing is sent until a successor
 * exists, and there is no destructive default to be three clicks away from.
 *
 * The two are also two different **authorities**. One is a grant to the owner, the
 * other is the administrator's. Folding them together would either hand every
 * teacher the power to appoint and clear an owner, or take the hand-on away from
 * the one person who is allowed to make it — and the hand-on is the whole reason
 * `manageOwn` exists.
 */
export interface TransferOwnershipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItemView | null;
  /**
   * What the server wrote, so whatever sits behind this dialog stops showing the
   * row as it was. The register hands a dialog a *snapshot* of the row it was
   * opened from, and a snapshot is stale the instant the write lands — which would
   * leave the custody sheet behind it offering to reclaim an item that is already
   * in the store, on a holder it no longer has.
   */
  onRecorded: (owner: { staffId: string; name: string | null }) => void;
}

/**
 * The preview for all three outcomes: nobody chosen yet, the successor is already
 * the owner, and the hand-on itself.
 *
 * Returned as `ChangePreviewProps` so the two states that record nothing cannot be
 * rendered as a move — the union's own enforcement, exactly as `buildManagerPreview`
 * uses it. A hand-on drawn before a successor has been picked would describe a
 * state the register is already in and invite the reader to believe something is
 * about to happen to it.
 */
const buildOwnershipPreview = (
  successorId: string | null,
  successorName: string | null,
  item: InventoryItemView | null
): ChangePreviewProps => {
  const currentOwner = item?.managerName ?? null;
  const currentOwnerId = item?.managerStaffId ?? null;
  const from = currentOwner ?? NO_MANAGER;
  const to = successorName ?? CHOSEN_STAFF;
  const holder = item?.custodianName ?? null;

  if (successorId === null) {
    return {
      headline: "Nothing will be written",
      unchanged: currentOwner
        ? `Accountability is unchanged: ${currentOwner} stays the person the school asks about this item.`
        : "Accountability is unchanged: this item still has nobody in charge of it.",
      footnote:
        "This dialog hands the ownership on, so while nobody is chosen nothing is sent to the server and no history row is appended. To leave an item with nobody in charge of it, close this and use Assign or change manager instead: that is a different verb on a different gate, and it is the only one that can clear the slot.",
    };
  }

  if (currentOwnerId !== null && successorId === currentOwnerId) {
    return {
      headline: "There is nothing to record —",
      unchanged: `${from} is already in charge of this item.`,
      footnote:
        "The server refuses a hand-on to the person who already owns it, so this would not be recorded. Choose somebody else, or close the dialog and leave it as it is.",
    };
  }

  if (holder) {
    return {
      headline: "The person the school asks becomes",
      from,
      to,
      footnote: `${from} stops being the person the school asks about this item and ${to} takes it on, and that is the whole of what changes hands. The server clears the current holder in the same transaction, so ${holder} is recorded as no longer holding it — if the item is physically in their hands, recording that is a deliberate act they make themselves, not a side effect of somebody else's paperwork. Two rows are appended to this item's history, one for each pointer, and no counter moves: nothing was counted, because nothing changed hands.`,
    };
  }

  return {
    headline: "The person the school asks becomes",
    from,
    to,
    footnote: `${from} stops being the person the school asks about this item and ${to} takes it on. Nobody is holding it, so the one row appended to this item's history is the owner change — there is no second row to write. No counter moves: nothing was counted, because nothing changed hands.`,
  };
};

/**
 * Hand the item the caller is answerable for to somebody else, permanently.
 *
 * **Reached from the custody history sheet and the register's row menu, not from
 * the item form.** `updateItem` refuses `managerStaffId` precisely because the
 * history row is the record of it, so there is no field to edit and no
 * "manager" dropdown here that could be saved by accident. Everything this dialog
 * writes lands on the permanent trail with a cause, and the two consequences that
 * are not obvious — who answers for the item afterwards, and the fact that the
 * current holder is cleared as part of the same write — are both on the face of
 * the form before the button is pressed.
 *
 * **The reason is required from the first render, never as a submit-time error.**
 * `transferOwnership` declares `reason` as a required
 * `inventoryTransferReasonSchema`, and the database CHECK behind it
 * (`inventory_custody_history_reason_required`) refuses this row without one:
 * `manager_changed` is not one of the two exempt change types, so a hand-on with
 * no cause cannot be written at all. `TransferReasonField` carries the asterisk
 * and the explanation, and a warning that could only appear after the failure it
 * exists to prevent would be worse than none.
 *
 * **Two server refusals are stated in the server's own words, and neither is
 * turned into a disabled button.**
 *
 * - *Out on a dated loan.* The units are with a borrower, not with the custodian
 *   pointer, and the return flow is what records the condition they came back in.
 *   The notice says so and the button stays enabled: the loan is a per-item fact
 *   the dialog can see, and a refusal the user cannot act on is exactly the thing
 *   this notice prevents.
 * - *Neither the owner nor a leadership seat.* That is a property of the **caller**
 *   — this register is admin-only and the seeded leadership accounts hold their
 *   authority with no staff row at all — so the browser cannot know it, and a
 *   disabled button with no explanation is the failure mode. The rule is stated
 *   and the server's own sentence is quoted next to it.
 */
export const TransferOwnershipDialog = ({
  open,
  onOpenChange,
  item,
  onRecorded,
}: TransferOwnershipDialogProps) => {
  const queryClient = useQueryClient();
  const [successorId, setSuccessorId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<OwnershipErrors>({});
  const successorName = usePartyName(successorId);

  const currentOwnerId = item?.managerStaffId ?? null;
  const isNoop = successorId !== null && successorId === currentOwnerId;
  const isOnLoan = (item?.borrowedQty ?? 0) > 0;
  const preview = buildOwnershipPreview(successorId, successorName, item);

  const reset = () => {
    setSuccessorId(null);
    setReason("");
    setNote("");
    setErrors({});
  };

  /**
   * The write, its toast and its invalidation, owned here rather than handed up to
   * the page.
   *
   * The three older dialogs in this file take an `onSubmit` prop because their page
   * already owned four mutations for them; these two are reached from a sheet, and a
   * sheet is not the place to own a query client. The split of responsibilities is
   * the one the rest of the feature uses: **`onError` owns the toast** — it is the
   * only thing that survives the dialog unmounting — and the dialog's own `catch`
   * does nothing but file field errors.
   */
  const transferOwnershipMutation = useMutation(
    orpc.inventory.custody.transferOwnership.mutationOptions({
      onSuccess: async (result) => {
        /*
         * The server returns the previous owner's name as well as the new one, and
         * that is what lets this sentence be the whole confirmation: it says what
         * the school will now ask, and who it stopped asking. Building it from the
         * form's selection would print whatever the client guessed the name to be.
         */
        toast.success(
          `${result.managerName} is now the person the school asks about this item${
            result.previousOwnerName
              ? ` — ${result.previousOwnerName} is not`
              : ""
          }`
        );
        onOpenChange(false);
        onRecorded({
          staffId: result.managerStaffId,
          name: result.managerName,
        });
        await invalidateInventory(queryClient, "custody");
      },
      onError: (error) => {
        toast.error(
          formatApiErrorMessage(
            error,
            "Could not hand on the ownership of this item"
          )
        );
      },
    })
  );

  const { isPending } = transferOwnershipMutation;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!item) {
      return;
    }

    const result = v.safeParse(ownershipSchema, {
      newOwnerStaffId: successorId ?? "",
      reason,
      note,
    });

    if (!result.success) {
      setErrors(issuesToErrors<keyof OwnershipErrors>(result.issues));
      return;
    }

    try {
      await transferOwnershipMutation.mutateAsync({
        itemId: v.parse(inventoryItemIdSchema, item.id),
        newOwnerStaffId: v.parse(staffIdSchema, result.output.newOwnerStaffId),
        reason: result.output.reason,
        ...(result.output.note ? { note: result.output.note } : {}),
      });
      reset();
    } catch (error) {
      /*
       * Field errors only. A refused hand-on is reported once, by the mutation's
       * `onError` above, and a refusal worth reading is a sentence about an item or
       * a person rather than a bad field — so this exists to catch the case the
       * toast cannot: a valibot failure from the server, filed on the control that
       * caused it. Everything the user typed stays put either way.
       */
      setErrors(validationFieldErrors<keyof OwnershipErrors>(error));
    }
  };

  if (!item) {
    return null;
  }

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
          <DialogTitle>Hand on the ownership</DialogTitle>
          <DialogDescription>
            {item.name} <span className="font-mono text-xs">({item.sku})</span>{" "}
            — this makes one member of staff the person the school asks about
            this item, and stops asking you
          </DialogDescription>
        </DialogHeader>

        <form
          id="transfer-ownership-form"
          onSubmit={handleSubmit}
          className="flex-1 space-y-5 overflow-y-auto px-6 py-4"
        >
          <FieldSet>
            <FieldLegend>Accountability</FieldLegend>
            <FieldGroup>
              {/*
                The register's own badge, under the register's own wording. It is
                the same column this dialog calls "the owner", and reusing it is the
                point: two badges saying the same fact in two vocabularies is how a
                register starts disagreeing with itself.
              */}
              <CurrentManagerBadge item={item} />

              <StaffComboboxField
                value={successorId}
                onChange={setSuccessorId}
                label="Hand it on to"
                description="The member of staff who becomes the person the school is answerable to about this item. Only members of staff who are still employed are offered, which is the same list the server accepts."
                disabled={isPending}
                error={errors.newOwnerStaffId}
                placeholder="Search for the member of staff taking it on..."
                /*
                 * No `allowClear`, and that is the verb talking rather than the
                 * widget: this input cannot be null on the wire, so there is no
                 * "cleared" state to offer. An empty field here means *not chosen
                 * yet*, which is the safe reading and the one the preview and the
                 * submit handler both take.
                 */
              />

              {isNoop ? (
                <InventoryInlineNotice
                  tone="warning"
                  title="That person is already in charge of this item"
                  description="The server refuses a hand-on to the current owner, because that would be a no-op on the record. Pick somebody else, or close the dialog and leave it as it is."
                />
              ) : null}

              {/*
                The consequence nobody would guess, and the reason it is a notice
                rather than a line in the footnote: the write clears the current
                holder in the same transaction. `transfer-ownership.ts` argues it at
                length — a record reading "X owns it, Y is holding it" straight
                after the ownership changed hands is a data-entry slip far more often
                than an intent — and the user has to be told before they press the
                button, because afterwards it is on the register whether they
                expected it or not.
              */}
              {item.custodianStaffId === null ? null : (
                <InventoryInlineNotice
                  tone="info"
                  title="This also clears the current holder"
                  description={`${item.custodianName ?? "The current holder"} is recorded as no longer holding it, in the same transaction and on the same reason. If the item is physically in their hands, that is a record they make themselves — a hand-on is not a hand-back, and it does not fetch anything from anybody's desk.`}
                />
              )}

              {isOnLoan ? (
                <InventoryInlineNotice
                  tone="warning"
                  title="This may be refused while units are out on loan"
                  description="An item with units away on a dated loan is not the owner's to hand on: the return has to be recorded first, because the return flow is what notes the condition the units came back in. Go ahead — if that is the case, the server will say so: “This item is out on loan, so the loan has to be closed through the borrow return flow before the ownership of it can change hands”."
                />
              ) : null}

              <InventoryInlineNotice
                tone="info"
                title="Who can do this"
                description="Only the person currently in charge of the item, or one of the three leadership seats (admin, principal, deputy principal) acting on an owner's behalf. An ordinary member of staff is refused even though their role holds the permission, and the server names who to ask: “R. Perera is in charge of this item, so only they can hand on the ownership of it”."
              />
            </FieldGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend>Why</FieldLegend>
            <FieldGroup>
              <TransferReasonField
                value={reason}
                onChange={setReason}
                error={errors.reason}
                description="Required on every hand-on, and a report of who passed what on can only be built from it."
              />
              <Field data-invalid={Boolean(errors.note)}>
                <FieldLabel htmlFor="transfer-ownership-note">Note</FieldLabel>
                <Textarea
                  id="transfer-ownership-note"
                  value={note}
                  rows={3}
                  maxLength={500}
                  placeholder="Optional. Why the responsibility is moving — they are taking over the lab, they are on maternity cover from March."
                  disabled={isPending}
                  aria-invalid={errors.note ? true : undefined}
                  aria-describedby={
                    errors.note ? "transfer-ownership-note-error" : undefined
                  }
                  onChange={(event) => setNote(event.target.value)}
                />
                <FieldDescription>
                  Both land on the same history row, and only the sentence
                  survives a later question that turns out to be about one
                  particular handover.
                </FieldDescription>
                <FieldError id="transfer-ownership-note-error">
                  {errors.note}
                </FieldError>
              </Field>
            </FieldGroup>
          </FieldSet>

          <ChangePreview {...preview} />
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
            form="transfer-ownership-form"
            /*
             * Never disabled for want of a successor, and the difference from
             * `AssignManagerDialog` is the point: an untouched field here has no
             * destructive meaning, so the honest response is a message on the
             * control the user has to fill in — which is what the schema produces.
             * Disabling it would hide the requirement until they found it by
             * pressing a button that does nothing.
             */
            disabled={isPending}
            data-icon="inline-start"
          >
            <IconUserPlus data-icon="inline-start" />
            {submitLabel(isPending, "Hand on the ownership")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/**
 * The confirmation in front of a reclaim, and the asymmetry it creates on purpose.
 *
 * **Handing an item *back* gets no confirm; calling one *in* does.** Both write a
 * `custody_released` row and both clear the same pointer, so the difference is not
 * the shape of the write — it is whose idea the write is:
 *
 * - `releaseCustody` is the holder's own voluntary hand-back, narrowed in its
 *   handler to the person already holding the item, and it exists so `takeItem` is
 *   not a one-way door. A second click to confirm a decision the caller has already
 *   made about their own property teaches people to dismiss confirms.
 * - `reclaimCustody` is the owner reaching into a colleague's hands. The holder did
 *   not ask for it, cannot see it coming, and is the person the record will say no
 *   longer has the item. The reason is not optional here either: a closed
 *   vocabulary is what lets a department head ask "how much equipment did owners
 *   have to call back, and why", and that question is unanswerable without one.
 *
 * **The confirm says the three things the button does not:** the holder loses the
 * item, the owner keeps it, and the row is permanent. "You keep it" is the half
 * that stops a reader assuming a reclaim is a handover in the other direction — it
 * is not, and the server does not touch `managerStaffId` at all. It also says what
 * the register will now claim about where the item *is*, because clearing the
 * pointer asserts that it is on the shelf, and a colleague who has not physically
 * returned it needs to know that is what the books now say.
 */
const ReclaimConfirmDialog: React.FC<{
  isOpen: boolean;
  isPending: boolean;
  itemName: string;
  holder: string | null;
  owner: string | null;
  reason: string;
  note: string;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({
  isOpen,
  isPending,
  itemName,
  holder,
  owner,
  reason,
  note,
  onCancel,
  onConfirm,
}) => (
  <AlertDialog
    open={isOpen}
    onOpenChange={(next) => {
      if (!next) {
        onCancel();
      }
    }}
  >
    <AlertDialogContent className="sm:max-w-md">
      <AlertDialogTitle>
        {holder
          ? `Call ${itemName} back from ${holder}?`
          : `Call ${itemName} back to the store?`}
      </AlertDialogTitle>
      <AlertDialogDescription>
        {holder
          ? `${holder} will no longer be recorded as holding it, and the register will say this item is in the store.`
          : "The register will say this item is in the store."}{" "}
        {owner
          ? `The ownership does not move: ${owner} is still the person the school asks about it.`
          : "The ownership does not move, and this item still has nobody in charge of it — it is not a hand-on, and it does not appoint anybody."}{" "}
        It is written to the permanent trail as a{" "}
        {inventoryTransferReasonLabel(reason)} row
        {note ? ", with your note," : ""} and a trail row is not editable from
        here. Nothing in this fetches the item from anybody&rsquo;s desk — it
        records who is accountable for it, and the next person to open the
        register will be told it is on the shelf.
      </AlertDialogDescription>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isPending}>
          Leave it with {holder ?? "its holder"}
        </AlertDialogCancel>
        <AlertDialogAction
          onClick={onConfirm}
          disabled={isPending}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {isPending ? "Recording..." : "Call it back"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export interface ReclaimCustodyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItemView | null;
  /**
   * Who had it, from the server's own row, so whatever sits behind this dialog can
   * stop showing a holder it no longer has.
   *
   * **The name is for the caller's benefit, not for the register's benefit.** The
   * server returns `custodianStaffId: null` and `custodianName: null` together, and
   * that pair is what a row snapshot has to be corrected with — see the hand-on
   * sheet's handler, which deliberately does not carry the old name across. A
   * caller that keeps a local copy of the row wants the name here to say *who* it
   * took it off ("Called back from S. Fernando"); a caller re-reading the row does
   * not, and a name attached to a cleared pointer would be the one combination this
   * file has argued must never be rendered.
   */
  onRecorded: (holder: { name: string | null }) => void;
}

/**
 * The owner demands an item back off the colleague who is holding it.
 *
 * **This is not `releaseCustody`, and the fact that it is not is the reason there
 * are two verbs rather than one with a flag.** `releaseCustody` is the holder's own
 * hand-back: it sits on the narrow `take` grant and is deliberately narrowed in
 * its handler to the person holding the item, so that giving something back is
 * always voluntary. This is the other direction — somebody who is **not** holding
 * the item uses their standing as the person answerable for it to take it back.
 * Folding the two together would either let a hand-back be demanded by anyone, which
 * is the opposite of what `take` means, or make a reclaim fail whenever the owner
 * was not the holder — which is every reclaim, because not holding the item is the
 * premise.
 *
 * **Only `custodianStaffId` moves.** `managerStaffId` is not in the server's
 * `set` and saying so here is not pedantry: reclaiming custody is not handing
 * responsibility on, and a dialog that let a reader assume otherwise would be
 * describing a bigger change than the one that happens. The preview carries the
 * same sentence, and the confirm repeats it, because it is the half a reader of
 * the trail will get wrong.
 *
 * **The reason is required from the first render**, and here the database is not
 * the only reason: this is the act that takes property out of a colleague's hands
 * and it lands in a permanent trail, and the closed vocabulary is what makes "how
 * much did owners have to call back, and why" answerable.
 */
export const ReclaimCustodyDialog = ({
  open,
  onOpenChange,
  item,
  onRecorded,
}: ReclaimCustodyDialogProps) => {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<CustodyErrors>({});
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const holder = item?.custodianName ?? null;
  const owner = item?.managerName ?? null;
  const isOnLoan = (item?.borrowedQty ?? 0) > 0;

  const reset = () => {
    setReason("");
    setNote("");
    setErrors({});
    setIsConfirmOpen(false);
  };

  /*
   * `custody.reclaimCustody`, not `custody.reclaim`. The router key is
   * `reclaimCustody` (`packages/api/src/routers/inventory/index.ts:94`) and the
   * folder's own banner calls the verb "`reclaim`" in prose while exporting it
   * under the procedure's name — the same `transferCustody` → `transfer` /
   * `releaseCustody` → `release` shorthand the group uses elsewhere. The client
   * path is the one that has to compile, and the procedure table in `UI.md` records
   * the mismatch so the next reader is not looking for a key that does not exist.
   */
  const reclaimMutation = useMutation(
    orpc.inventory.custody.reclaimCustody.mutationOptions({
      onSuccess: async (result) => {
        /*
         * The server names who had it, so the toast can be the whole outcome. It
         * deliberately does not say the item came back: nothing came back, and the
         * phrasing that would imply it is the one thing this dialog must not do.
         */
        toast.success(
          `${result.previousCustodianName ?? "The custodian"} no longer holds this item — it is recorded as being in the store, and ${owner ?? "the owner"} is still in charge of it`
        );
        setIsConfirmOpen(false);
        onOpenChange(false);
        onRecorded({ name: result.previousCustodianName });
        await invalidateInventory(queryClient, "custody");
      },
      onError: (error) => {
        toast.error(
          formatApiErrorMessage(
            error,
            "Could not call this item back from its holder"
          )
        );
      },
    })
  );

  const { isPending } = reclaimMutation;

  /**
   * Validate, then ask. The order matters: the confirm names the cause and the
   * holder, so it is only opened once both are real, and a form that cannot be
   * written should say so on the field rather than behind a second dialog.
   */
  const requestConfirm = (event: React.FormEvent) => {
    event.preventDefault();
    if (!item) {
      return;
    }

    const result = v.safeParse(reasonAndNoteSchema, { reason, note });
    if (!result.success) {
      setErrors(issuesToErrors<keyof CustodyErrors>(result.issues));
      return;
    }

    setIsConfirmOpen(true);
  };

  const confirmReclaim = async () => {
    if (!item) {
      return;
    }

    try {
      await reclaimMutation.mutateAsync({
        itemId: v.parse(inventoryItemIdSchema, item.id),
        reason: v.parse(inventoryTransferReasonSchema, reason),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      reset();
    } catch (error) {
      /*
       * Field errors only, for the same reason as the hand-on above: the refusal
       * itself is already on screen from the mutation's `onError`, and the reason,
       * the note and the open confirm all stay exactly as they were so the user is
       * being asked to *change* something after reading the server's sentence.
       */
      setErrors(validationFieldErrors<keyof CustodyErrors>(error));
    }
  };

  /*
   * An item nobody is holding has nothing to call back, and `reclaimCustody`
   * refuses it with "This item is not in anybody's custody, so there is nothing to
   * call back". The same rule as `AssignManagerDialog`'s `canClear`: a control the
   * server always rejects is not offered, and a dialog that is nevertheless mounted
   * for one — which is what happens the moment a row menu can open it — renders
   * nothing rather than a button that cannot work.
   */
  if (!item || item.custodianStaffId === null) {
    return null;
  }

  return (
    <>
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
            <DialogTitle>Call it back from its holder</DialogTitle>
            <DialogDescription>
              {item.name}{" "}
              <span className="font-mono text-xs">({item.sku})</span> — take it
              back off {holder ?? "its holder"} and record it as being in the
              store. You stay in charge of it
            </DialogDescription>
          </DialogHeader>

          <form
            id="reclaim-custody-form"
            onSubmit={requestConfirm}
            className="flex-1 space-y-5 overflow-y-auto px-6 py-4"
          >
            <FieldSet>
              <FieldLegend>Who has it</FieldLegend>
              <FieldGroup>
                <CurrentHolderBadge item={item} />

                {isOnLoan ? (
                  <InventoryInlineNotice
                    tone="warning"
                    title="This may be refused while units are out on loan"
                    description="Units away on a dated loan are with a borrower, not with the holder this record names, and clearing the holder would claim somebody is looking after equipment that is actually with a student. The return flow has to record the condition the units came back in first. Go ahead — if that is the case, the server will say so: “This item is out on loan, so it has to come back through the borrow return flow (`borrows.return`), which records the condition it came back in, before its custody can be called in”."
                  />
                ) : null}

                <InventoryInlineNotice
                  tone="info"
                  title="Who can do this"
                  description="Only the person in charge of the item, or one of the three leadership seats (admin, principal, deputy principal) acting on the owner's behalf. An ordinary member of staff is refused even though their role holds the permission, and the server names who to ask: “R. Perera is in charge of this item, so only they can call it back”."
                />
              </FieldGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend>Why</FieldLegend>
              <FieldGroup>
                <TransferReasonField
                  value={reason}
                  onChange={setReason}
                  error={errors.reason}
                  description="Required, and the closed list of reasons is what lets a report say how much equipment owners had to call back and why."
                />
                <Field data-invalid={Boolean(errors.note)}>
                  <FieldLabel htmlFor="reclaim-custody-note">Note</FieldLabel>
                  <Textarea
                    id="reclaim-custody-note"
                    value={note}
                    rows={3}
                    maxLength={500}
                    placeholder="Optional. What you have already arranged with them — it is in the lab cupboard, it was never meant to leave the site."
                    disabled={isPending}
                    aria-invalid={errors.note ? true : undefined}
                    aria-describedby={
                      errors.note ? "reclaim-custody-note-error" : undefined
                    }
                    onChange={(event) => setNote(event.target.value)}
                  />
                  <FieldError id="reclaim-custody-note-error">
                    {errors.note}
                  </FieldError>
                </Field>
              </FieldGroup>
            </FieldSet>

            <ChangePreview
              headline="Custody moves"
              from={holder ?? "nobody — it is already in the store"}
              to={IN_STORE}
              footnote="You keep the ownership: this is not a hand-on, and nothing about who answers for the item changes. A custody-released row is appended to this item's history with the reason you pick — and the ledger row for it will show no counter movement on either side, because the item never physically moved. That is the record saying the register was corrected, not a missing entry."
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
              form="reclaim-custody-form"
              /*
               * This is the one submit in the file that opens another dialog rather
               * than writing. It is not decoration: the confirm restates the three
               * consequences (the holder loses it, the owner keeps it, the row is
               * permanent) to a person who is about to take something out of a
               * colleague's hands, and a submit button is the last place to
               * discover that they had not read any of it.
               */
              disabled={isPending}
              data-icon="inline-start"
            >
              <IconUserMinus data-icon="inline-start" />
              {submitLabel(isPending, "Call it back")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ReclaimConfirmDialog
        isOpen={isConfirmOpen}
        isPending={isPending}
        itemName={item.name}
        holder={holder}
        owner={owner}
        reason={reason}
        note={note.trim()}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={() => {
          void confirmReclaim();
        }}
      />
    </>
  );
};

export type CustodyHoldMode = "take" | "release";

interface TakeOrReleaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: CustodyHoldMode;
  item: InventoryItemView | null;
  isPending: boolean;
  onSubmit: (values: { itemId: string; note?: string }) => Promise<void>;
}

/** Who the item is coming from, for the take/release preview. */
const holdPreviewFrom = (
  isTake: boolean,
  item: InventoryItemView | null
): string => {
  if (isTake) {
    return item?.custodianName ?? IN_STORE;
  }

  return item?.custodianName ?? "nobody — it is already in the store";
};

/** What a claim or a release does to the counters, in one sentence each. */
const holdPreviewFootnote = (isTake: boolean): string => {
  if (isTake) {
    return "A first claim on an unheld item is recorded as a claim rather than a transfer, and carries no reason; a claim taken from somebody else is recorded as a transfer. Assigning an item to yourself records it without moving any stock — the borrow flow is what moves counters.";
  }

  return "Releases are recorded with the cause the server fixes for them — returned to store — and the custodian pointer is cleared. A departure does not need this dialog: an administrator can clear a pointer for somebody who has already left, which is exactly what this action is for.";
};

/**
 * The self-service pair, as one dialog with two modes.
 *
 * `takeItem` **narrows** the write rather than widening it: the custodian is
 * always the caller's own staff row and `newCustodianStaffId` is deliberately not
 * an input, so a teacher can claim an item for themselves and can never take one
 * away from a colleague. `releaseCustody` is the other half — without it,
 * `takeItem` is a one-way door, a teacher who claims a tripod in September has no
 * route to give it back in July, and every later claim on that item is refused as
 * "already yours". The register offers both as row actions because an
 * administrator standing at a cupboard is doing the same job, and making them hand
 * over to a teacher in order to hand something back would be a worse product than
 * the one that exists.
 *
 * **The one server guard this dialog *does* state, and the one it does not, and
 * why the difference is not an inconsistency.** Read this before "simplifying" the
 * wording back.
 *
 * - `releaseCustody` refuses an item with units out on loan. The guard is
 *   per-*item* and the dialog knows the item, and the server's message names the
 *   reason — the loan has to be closed through the borrow record so the return date
 *   and the signature are kept. Pre-empting that with a disabled button would hide
 *   the one thing the user most needs to know, which is *why*, so it is left to the
 *   server.
 * - `takeItem` refuses an account with **no staff row**, which is a property of the
 *   *caller* and not of anything on screen. This is the second reason, and it is the
 *   reason the original "Take this item" wording was wrong.
 *
 * **"Don't pre-empt the server" is right on a teacher's own page and wrong on an
 * admin-only register, and the difference is who is looking.** On a teacher's
 * holdings page the audience for a self-claim is somebody who has a staff row, so
 * guessing costs nothing. The register is admin-only by decision
 * (`routes/_auth/admin/$year/staff/inventory.tsx` says leadership is deliberately
 * not given the route), and the three seeded accounts that can reach it — `admin`,
 * `principal`, `vicePrincipal` — hold their authority with **no staff row at all**,
 * by design. `take-item.ts` refuses those before opening a transaction: *"Your
 * account has no staff record, so equipment cannot be assigned to you."* So on the
 * only screen where this dialog appears, the action is guaranteed to fail for the
 * default audience, while a dialog titled "Take this item" with a preview reading
 * `the store → you` describes the outcome as if it were going to happen.
 *
 * Two routes were available and **hiding the action was the wrong one**. It needs
 * `custody.myItems` read on the admin register to learn the actor's `staffId`
 * (`string | null`) — an extra request on an admin-only page, to gate a control
 * whose fate is already known: this route is admin-only, and the admin account has
 * no staff row. It would also make the control's visibility depend on a read whose
 * failure mode is a spinner rather than a sentence, and the one case where the
 * action *does* work (a storekeeper who is also an admin, or a leadership account
 * that has been linked to a staff profile since) would be the case where the button
 * silently vanished.
 *
 * So the choice is the other one: **name the action for what it is.** The title and
 * the button say "Assign to yourself", the preview's right-hand side is `yourself`
 * rather than the pronoun `you`, and the one condition that decides whether the
 * write can succeed is stated in the dialog as a rule, in the server's own terms.
 * The button stays enabled on purpose — the rule is per-account, a browser cannot
 * know it, and a disabled button with no explanation is the failure mode this is
 * avoiding. A storekeeper is not blocked from claiming a tripod, and an
 * administrator learns why it did not work instead of wondering what "it" was.
 */
export const TakeOrReleaseDialog = ({
  open,
  onOpenChange,
  mode,
  item,
  isPending,
  onSubmit,
}: TakeOrReleaseDialogProps) => {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const isTake = mode === "take";
  const isOnLoan = (item?.borrowedQty ?? 0) > 0;

  const reset = () => {
    setNote("");
    setError("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!item) {
      return;
    }

    const result = v.safeParse(noteSchema, note);
    if (!result.success) {
      setError(
        issuesToErrors<"note">(result.issues).note ?? "This note is too long"
      );
      return;
    }

    try {
      await onSubmit({
        itemId: item.id,
        ...(result.output ? { note: result.output } : {}),
      });
      reset();
    } catch {
      // Refused, or the connection dropped. The note stays, the dialog stays, and
      // the page's `onError` has already toasted the server's sentence.
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
          {/*
            "Assign to yourself", not "Take this item". The action assigns the item
            to the staff row behind the caller's own account, and naming it that way
            is the only way the sentence is true on every account that can reach
            this screen — including the admin account, for which the server refuses
            the write outright. "Take" implied an outcome the browser cannot promise.
            The release half keeps its wording: it is an ordinary hand-back and the
            server has no per-caller condition on it.
          */}
          <DialogTitle>
            {isTake ? "Assign to yourself" : "Return it to the store"}
          </DialogTitle>
          <DialogDescription>
            {item && isTake
              ? `Put ${item.name} under the staff record behind your own account. It stays the school's property — this is a change of hands, not a loan.`
              : null}
            {item && !isTake
              ? `Clear the custodian on ${item.name} and record that it is back in the store.`
              : null}
          </DialogDescription>
        </DialogHeader>

        <form
          id="take-release-form"
          onSubmit={handleSubmit}
          className="flex-1 space-y-5 overflow-y-auto px-6 py-4"
        >
          <ChangePreview
            headline="Custody moves"
            from={holdPreviewFrom(isTake, item)}
            to={isTake ? "yourself" : IN_STORE}
            footnote={holdPreviewFootnote(isTake)}
          />

          {isTake ? (
            <InventoryInlineNotice
              tone="info"
              title="This is not a loan"
              description="Assigning an item to yourself records it without moving any stock. To take one away from the building, raise a borrow — and the item has to be marked borrowable for that to be possible at all."
            />
          ) : null}

          {/*
            The one guard this dialog states rather than defers, and the reason is
            in the banner comment: the register is admin-only and the seeded
            leadership accounts have no staff row, so this write is the one an
            administrator is most likely to be refused. Stating the condition up
            front turns a guaranteed failure into something they can act on — link
            the account to a staff profile, or use Transfer custody to name somebody
            else. The button stays enabled: the condition is about the account, not
            about anything on this screen, and a disabled control would hide the
            action from the storekeeper for whom it works.
          */}
          {isTake ? (
            <InventoryInlineNotice
              tone="warning"
              title="This needs a staff record behind your account"
              description="A self-assignment is written to the staff row that belongs to your login, so an account with no staff profile cannot take one. The three seeded leadership accounts — admin, principal and deputy principal — hold their authority without one by design. If that is you, ask an administrator to link your account, or use Transfer custody to put the item in somebody else's name."
            />
          ) : null}

          {isTake || !isOnLoan ? null : (
            <InventoryInlineNotice
              tone="warning"
              title="This item may be out on loan"
              description="A release is refused while units are away: the loan has to be returned through its own record first, so the return date and the signature are kept. Go ahead — if that is the case, the server will say so."
            />
          )}

          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="take-release-note">Note</FieldLabel>
            <Textarea
              id="take-release-note"
              value={note}
              rows={2}
              maxLength={500}
              placeholder="Optional. Why you are taking it, or where it is going back to."
              disabled={isPending}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "take-release-note-error" : undefined}
              onChange={(event) => setNote(event.target.value)}
            />
            <FieldError id="take-release-note-error">{error}</FieldError>
          </Field>
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
            form="take-release-form"
            disabled={isPending}
            data-icon="inline-start"
          >
            {isTake ? (
              <IconPackageExport data-icon="inline-start" />
            ) : (
              <IconUserMinus data-icon="inline-start" />
            )}
            {submitLabel(
              isPending,
              isTake ? "Assign to yourself" : "Return to the store"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * Days per unit, for the coarse end of the ladder.
 *
 * The approximations a calendar would not agree with — a month is not 30 days — are
 * deliberate and confined to the *readable* half of the answer. The claim an auditor
 * acts on is the exact timestamp, which rides along in the `sr-only` span beside
 * this string and in the `datetime` attribute.
 */
const DAYS_PER_WEEK = 7;
const DAYS_PER_MONTH = 30.44;
const DAYS_PER_YEAR = 365.25;

const RELATIVE_FORMATTER = new Intl.RelativeTimeFormat("en-GB", {
  numeric: "auto",
});

/** Built once rather than per row: a `DateTimeFormat` is not cheap to construct. */
const ABSOLUTE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * The instant one history sheet is measured against, and the midnight it is measured
 * from.
 *
 * A trail is read as a list, and a list has one "now". Taking `Date.now()` per row
 * means two rows either side of a render boundary can disagree about the instant —
 * a row can read "2 days ago" next to a row that reads "3 days ago" about the same
 * evening — and the ladder below is then walked once per row per render, which is
 * 2,400 comparisons on a 400-row page. Hoisting it to one call per sheet makes it
 * one.
 *
 * `midnight` is what turns "yesterday" into a calendar fact. A fixed 86,400,000 ms
 * is right only at noon; at 11am, 36 hours ago is a day *and a half* ago and would
 * print as "yesterday" under a naive threshold, which for a record is a claim
 * about a date and not merely a rounding.
 */
interface RelativeClock {
  now: number;
  midnight: number;
}

const startOfLocalDay = (timestamp: number): number => {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const createRelativeClock = (): RelativeClock => {
  const now = Date.now();
  return { now, midnight: startOfLocalDay(now) };
};

/**
 * "3 days ago", read upwards from the smallest unit.
 *
 * The original walked a six-entry table from the largest unit down, so *every* row
 * paid six comparisons to discover that a transfer from this morning is a matter of
 * minutes — and recent rows are nearly all of them. Ascending, the common case
 * costs two.
 *
 * `suppressHydrationWarning` is still needed on the element that prints this: the
 * value depends on `Date.now()`, which can land on either side of a render boundary
 * between the server's HTML and the client's first paint.
 */
const formatRelative = (iso: string, clock: RelativeClock): string => {
  const then = Date.parse(iso);

  if (Number.isNaN(then)) {
    return "at an unrecorded time";
  }

  const elapsed = clock.now - then;

  if (Math.abs(elapsed) < MINUTE_MS) {
    return "just now";
  }

  const minutes = Math.round(elapsed / MINUTE_MS);
  if (Math.abs(minutes) < 60) {
    return RELATIVE_FORMATTER.format(-minutes, "minute");
  }

  const hours = Math.round(elapsed / HOUR_MS);
  if (Math.abs(hours) < 24) {
    return RELATIVE_FORMATTER.format(-hours, "hour");
  }

  const days = Math.round((clock.midnight - startOfLocalDay(then)) / DAY_MS);
  if (Math.abs(days) < DAYS_PER_WEEK) {
    return RELATIVE_FORMATTER.format(-days, "day");
  }

  if (Math.abs(days) < DAYS_PER_MONTH) {
    return RELATIVE_FORMATTER.format(-Math.round(days / DAYS_PER_WEEK), "week");
  }

  if (Math.abs(days) < DAYS_PER_YEAR) {
    return RELATIVE_FORMATTER.format(
      -Math.round(days / DAYS_PER_MONTH),
      "month"
    );
  }

  return RELATIVE_FORMATTER.format(-Math.round(days / DAYS_PER_YEAR), "year");
};

const formatAbsolute = (iso: string): string =>
  ABSOLUTE_FORMATTER.format(new Date(iso));

/**
 * Manager changes and custody changes, told apart at a glance.
 *
 * The two live in one table (`inventoryCustodyHistory`) and in one timeline here,
 * on purpose. An audit asks "what happened to this item", and splitting the two
 * kinds of change onto separate screens would answer half of that question — and
 * the halves interleave, because a hand-over in March is often followed by an
 * accountability change in April on the same cupboard. So they share the trail and
 * are distinguished by four channels at once: the icon on the marker, the
 * `changeTypeLabel` the server generated, the badge's treatment, and the wording
 * of the before-and-after pair. Colour is the last of those and never the only
 * one.
 */
const CustodyHistoryEntryRow = ({
  entry,
  clock,
}: {
  entry: CustodyHistoryEntry;
  /** The sheet's single instant, so every row is measured against the same one. */
  clock: RelativeClock;
}) => {
  /**
   * `changeType` is the closed six-value picklist from `CUSTODY_CHANGE_TYPES`,
   * split three-and-three between the two kinds, so the prefix is an exact
   * discriminator rather than a guess. Deriving the *kind* from the change type —
   * rather than from "which id happens to be non-null" — is what stops a
   * `custody_released` row (whose new custodian is null by definition) from being
   * misread as a manager row.
   */
  const isManagerChange = entry.changeType.startsWith("manager");
  const isCustodyChange = !isManagerChange;

  const previousName = isCustodyChange
    ? entry.previousCustodianName
    : entry.previousManagerName;
  const previousId = isCustodyChange
    ? entry.previousCustodianStaffId
    : entry.previousManagerStaffId;
  const nextName = isCustodyChange
    ? entry.newCustodianName
    : entry.newManagerName;
  const nextId = isCustodyChange
    ? entry.newCustodianStaffId
    : entry.newManagerStaffId;

  /**
   * What the empty side of each pair is called. A custodian that becomes nobody
   * has gone back on a shelf; a manager that becomes nobody has been left
   * unaccountable for, which is a different and more serious thing to read in a
   * register — and it is the state this feature exists to close.
   */
  const emptyPrevious = isCustodyChange ? IN_STORE : NO_MANAGER;
  const emptyNext = isCustodyChange ? IN_STORE : NO_MANAGER;
  const Icon = isCustodyChange ? IconUserCheck : IconUserCog;
  /*
   * `text-warning-ink`, not `text-gold`, and the two tokens coexist on purpose.
   * `--gold` (#a8730b) is a *fill* token for this feature — it is the accent behind
   * `accent/25`, the timeline dot, the dashed borders — and on the page background
   * it is 3.87:1, under the 4.5:1 AA threshold for body text. `--warning-ink` is the
   * same hue darkened to #7f5605 for ink specifically: 6.12:1 on the page and 5.65:1
   * on the badge fill, so the same word reads the same way wherever it lands. Only
   * the ink is swapped; `border-accent/50` and `bg-accent/25` stay on `--gold`,
   * because a surface is not held to a text contrast ratio and re-tuning a token
   * the rest of the app uses is a product decision, not a drive-by. The arithmetic
   * is in `packages/ui/src/styles/globals.css`; the same token carries the register's
   * `Borrowed` badge and the warning notices.
   */
  const markerClass = isCustodyChange
    ? "bg-accent/25 text-warning-ink"
    : "bg-primary/25 text-primary";

  return (
    <li className="relative pl-7">
      <span
        aria-hidden="true"
        className={`ring-background absolute top-1.5 left-0 flex size-4 items-center justify-center rounded-full ring-2 ${markerClass}`}
      >
        <Icon className="size-2.5" />
      </span>

      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={isCustodyChange ? "outline" : "default"}
          className={
            isCustodyChange ? "border-accent/50 text-warning-ink" : undefined
          }
        >
          {entry.changeTypeLabel}
        </Badge>
        {/*
          The instant is in the accessibility tree, not only in a `title`. A trail
          is read to answer *when*, and the relative string is a lossy answer: "2
          days ago" is a different claim on the third of March than on the fifth.
          `title` is a mouse affordance — `<time>` is not focusable, so a keyboard
          or screen-reader user never reached the exact value that the file's own
          comment called "the claim that matters". The `sr-only` span is announced
          by everyone; the `title` stays for the pointer. It is placed *after* the
          visible text so the reading order is "3 days ago" then the full stamp,
          which is how a person would say it.
        */}
        <time
          dateTime={entry.changedAt}
          title={formatAbsolute(entry.changedAt)}
          suppressHydrationWarning
          className="text-muted-foreground text-xs tabular-nums"
        >
          {formatRelative(entry.changedAt, clock)}
          <span className="sr-only">
            {" — "}
            {formatAbsolute(entry.changedAt)}
          </span>
        </time>
      </div>

      <p className="mt-1 text-sm">
        <PartyPair
          previous={
            <PartyName
              name={previousName}
              staffId={previousId}
              emptyLabel={emptyPrevious}
            />
          }
          next={
            <PartyName
              name={nextName}
              staffId={nextId}
              emptyLabel={emptyNext}
            />
          }
        />
      </p>

      <p className="text-muted-foreground mt-0.5 text-xs">
        {entry.reasonLabel}
        {entry.note ? (
          <>
            {" — "}
            <span className="text-foreground/80">{entry.note}</span>
          </>
        ) : null}
      </p>
    </li>
  );
};

/**
 * The panel's three bodies, so `CustodyHistorySheet` stays a composition rather
 * than a four-way branch in a scroll container.
 */
const CustodyHistoryBody: React.FC<{
  isLoading: boolean;
  error: unknown;
  entries: CustodyHistoryEntry[];
  onRetry: () => void;
}> = ({ isLoading, error, entries, onRetry }) => {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-hidden="true">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
            <Skeleton className="h-3 w-48" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return <InventoryErrorState error={error} onRetry={onRetry} />;
  }

  if (entries.length === 0) {
    return (
      <InventoryEmptyState
        title="No custody changes recorded"
        description="This item has never been assigned to a manager or held by a member of staff. The first transfer, appointment or claim will appear here — and nothing before that point is missing. The item was simply in the store."
      />
    );
  }

  /*
   * One clock for the whole sheet, taken after the states above have been settled
   * and above the `map`. Two reasons, and both are about the list rather than the
   * sheet: every row is measured against the same instant, so two rows cannot
   * disagree about what "now" is across a render boundary, and `Date.now()` is
   * called once per render rather than once per row per render. A `useMemo` would
   * be the wrong tool — a sheet re-rendered by anything at all has to re-measure.
   */
  const clock = createRelativeClock();

  return (
    /*
      The rail is drawn once for the whole list rather than per row: a `before`
      pseudo-element on the wrapper would be a flex item inside the `ol`, so it
      lives on the non-flex parent instead. `pointer-events-none` is what stops a
      hairline from ever being the thing a click lands on.
    */
    <div className="before:bg-border relative before:pointer-events-none before:absolute before:top-2 before:bottom-2 before:left-2 before:w-px">
      <ol className="flex flex-col gap-5">
        {entries.map((entry) => (
          <CustodyHistoryEntryRow key={entry.id} entry={entry} clock={clock} />
        ))}
      </ol>
    </div>
  );
};

interface CustodyHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItemView | null;
}

/**
 * The trail, in a `Sheet` and not a `Dialog`.
 *
 * It is a timeline the reader scrolls, and the reason to reach for a side panel
 * rather than a centred modal is that the register stays behind it: a reader who
 * opens the trail for one row and then wants it for the next is doing a
 * comparison, and a modal makes that two dismissals per row. The panel is also the
 * only place in the feature where the two halves of the history can be read against
 * each other at once, which is the entire reason they share a table.
 *
 * **The two owner verbs are reached from the foot of this panel, and this is a
 * considered place for them rather than a convenient one.** A reader who has just
 * read a trail is the one person on the screen who knows *why* a change happened,
 * and an owner deciding to call something back is making a decision about the same
 * two columns the timeline above is about. The alternative — the register's row
 * menu — is the other door to the same dialogs and a sibling's file; the dialogs
 * are exported, take their item as a prop and own their mutations, so either door
 * works and neither is a special case.
 */
export const CustodyHistorySheet = ({
  open,
  onOpenChange,
  item,
}: CustodyHistorySheetProps) => {
  /**
   * The wire carries `id` as a plain `string` where the procedure's input is the
   * branded `InventoryItemId`, so it is parsed through the repository's own id
   * schema here — a validation rather than an assertion, at the one place in this
   * file where the two meet. It cannot throw for a string input, and the query is
   * disabled unless there is an item, so the empty-string fallback is never sent.
   */
  const itemId = v.parse(inventoryItemIdSchema, item?.id ?? "");

  const historyQuery = useQuery(
    orpc.inventory.custody.history.queryOptions({
      input: { itemId },
      enabled: open && item !== null,
    })
  );

  const entries = historyQuery.data ?? [];

  const [isOwnershipOpen, setIsOwnershipOpen] = useState(false);
  const [isReclaimOpen, setIsReclaimOpen] = useState(false);

  /**
   * What one of the two dialogs below has written while this panel is open.
   *
   * `item` is the register's **snapshot** of the row, taken when the sheet was
   * opened, and a snapshot is stale the moment a write lands: without this the
   * panel would keep offering to call back an item that is already in the store,
   * and the hand-on dialog would keep telling a storekeeper that the previous owner
   * is still the owner. It is cleared when the panel closes, because a fresh open
   * hands over a freshly fetched row and an override from the last visit would
   * then be masking somebody else's change rather than this panel's own.
   *
   * `useMemo` rather than a `useEffect` that copies `item` into state: the value
   * is *derived* from the prop plus the override, so deriving it during render is
   * the whole of the requirement and an effect would only add a frame in which the
   * two disagree.
   */
  const [written, setWritten] = useState<{
    itemId: string;
    managerStaffId: string | null;
    managerName: string | null;
    custodianStaffId: string | null;
    custodianName: string | null;
  } | null>(null);

  const view: InventoryItemView | null = useMemo(() => {
    if (!item || !written || written.itemId !== item.id) {
      return item;
    }

    return { ...item, ...written };
  }, [item, written]);

  const openOwnership = () => {
    setIsReclaimOpen(false);
    setIsOwnershipOpen(true);
  };

  const openReclaim = () => {
    setIsOwnershipOpen(false);
    setIsReclaimOpen(true);
  };

  const closeSheet = (next: boolean) => {
    if (!next) {
      setWritten(null);
      setIsOwnershipOpen(false);
      setIsReclaimOpen(false);
    }
    onOpenChange(next);
  };

  return (
    <Sheet open={open} onOpenChange={closeSheet}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle className="font-heading text-base">
            Custody history
          </SheetTitle>
          <SheetDescription>
            {item ? (
              <>
                {item.name}{" "}
                <span className="font-mono text-xs">({item.sku})</span> — every
                recorded change of manager and custodian, newest first
              </>
            ) : (
              "Every recorded change of manager and custodian, newest first"
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          <CustodyHistoryBody
            isLoading={historyQuery.isLoading}
            error={historyQuery.error}
            entries={entries}
            onRetry={() => {
              void historyQuery.refetch();
            }}
          />
        </div>

        {/*
          The foot of the panel, and the only part of it that writes. The two verbs
          are kept apart on the face of the panel for the same reason they are kept
          apart in the dialogs: one changes who answers for the item, the other
          changes who has it, and a row of undifferentiated "custody" buttons is how
          a register gets handed-on ownership by accident.

          The reclaim is offered only when somebody is holding the item, because
          `reclaimCustody` refuses it with "This item is not in anybody's custody,
          so there is nothing to call back" — a control that always fails is worse
          than no control, and the sentence it would have produced is already on
          screen in the holder's own badge above.
        */}
        <div className="flex flex-col gap-3 border-t p-4">
          <p className="text-muted-foreground text-xs">
            Two different changes, two different reasons. One changes who the
            school asks about this item; the other changes who is holding it.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openOwnership}
              data-icon="inline-start"
            >
              <IconUserPlus data-icon="inline-start" />
              Hand on the ownership
            </Button>
            {view?.custodianStaffId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openReclaim}
                data-icon="inline-start"
              >
                <IconUserMinus data-icon="inline-start" />
                Call it back from {view.custodianName ?? "its holder"}
              </Button>
            ) : (
              <span className="text-muted-foreground text-xs">
                Nobody is holding it, so there is nothing to call back.
              </span>
            )}
          </div>
        </div>
      </SheetContent>

      <TransferOwnershipDialog
        open={isOwnershipOpen}
        onOpenChange={setIsOwnershipOpen}
        item={view}
        onRecorded={(owner) => {
          /*
           * The holder is cleared in the same transaction as the hand-on, so this
           * is two columns rather than one. Reading that off `transfer-ownership.ts`
           * rather than leaving the panel to refetch is what stops it offering a
           * reclaim against a holder the write has already released.
           */
          setWritten({
            itemId,
            managerStaffId: owner.staffId,
            managerName: owner.name,
            custodianStaffId: null,
            custodianName: null,
          });
        }}
      />

      <ReclaimCustodyDialog
        open={isReclaimOpen}
        onOpenChange={setIsReclaimOpen}
        item={view}
        onRecorded={() => {
          /*
           * **The name is deliberately dropped, and the server drops it too.**
           * `reclaim-custody.ts` returns `custodianStaffId: null` *and*
           * `custodianName: null`; the previous holder's name is in the toast and
           * in the trail. Carrying it onto the view would put a name beside a
           * null pointer, and this file has spent a great deal of argument
           * establishing that a name with no pointer behind it is a *different*
           * fact from a departed staff record — the one `PartyName` strikes
           * through. Here it would simply be a lie in the badge: the hand-on
           * dialog's own "this also clears the current holder" notice reads
           * `custodianStaffId`, and its preview reads `custodianName`, so a
           * carried-over name would have the register claiming the previous
           * holder still has the item on the one screen that knows they do not.
           *
           * The owner is read back off `view` rather than restated, because a
           * reclaim does not touch it: the whole point of the dialog is that
           * calling something back is not a hand-on, and an override that
           * restated the manager column would be the code disagreeing with the
           * copy.
           */
          setWritten({
            itemId,
            managerStaffId: view?.managerStaffId ?? null,
            managerName: view?.managerName ?? null,
            custodianStaffId: null,
            custodianName: null,
          });
        }}
      />
    </Sheet>
  );
};

export interface CustodyDialogsProps {
  item: InventoryItemView | null;
  isTransferOpen: boolean;
  onTransferOpenChange: (open: boolean) => void;
  isTransferPending: boolean;
  onTransferSubmit: (values: {
    itemId: string;
    newCustodianStaffId: string;
    reason: string;
    note?: string;
  }) => Promise<void>;
  isManagerOpen: boolean;
  onManagerOpenChange: (open: boolean) => void;
  isManagerPending: boolean;
  onManagerSubmit: (values: {
    itemId: string;
    newManagerStaffId: string | null;
    reason: string;
    note?: string;
  }) => Promise<void>;
  holdMode: CustodyHoldMode;
  isHoldOpen: boolean;
  onHoldOpenChange: (open: boolean) => void;
  isHoldPending: boolean;
  onHoldSubmit: (values: { itemId: string; note?: string }) => Promise<void>;
  isHistoryOpen: boolean;
  onHistoryOpenChange: (open: boolean) => void;
}

/**
 * The three dialogs the page owns, and the panel that owns two more.
 *
 * Only one of the three is ever open at a time, which matters for more than
 * tidiness: `TransferReasonField` renders a fixed `id` on its select trigger, and
 * two copies of it in the document would give one of the two labels the wrong
 * control. The page owns that invariant by opening one dialog per action.
 *
 * **`TransferOwnershipDialog` and `ReclaimCustodyDialog` are deliberately not in
 * this list.** They own their mutations, their toasts and their invalidation, so
 * the only thing the page would have to add for them is open state — and the panel
 * that already has the item in hand is the better door to them anyway. They are
 * exported rather than mounted here so a row action can open either one directly,
 * which is the other door and needs no special case: both take an
 * `InventoryItemView | null` and report what they wrote through `onRecorded`.
 */
export const CustodyDialogs = ({
  item,
  isTransferOpen,
  onTransferOpenChange,
  isTransferPending,
  onTransferSubmit,
  isManagerOpen,
  onManagerOpenChange,
  isManagerPending,
  onManagerSubmit,
  holdMode,
  isHoldOpen,
  onHoldOpenChange,
  isHoldPending,
  onHoldSubmit,
  isHistoryOpen,
  onHistoryOpenChange,
}: CustodyDialogsProps) => (
  <>
    <TransferCustodyDialog
      open={isTransferOpen}
      onOpenChange={onTransferOpenChange}
      item={item}
      isPending={isTransferPending}
      onSubmit={onTransferSubmit}
    />
    <AssignManagerDialog
      open={isManagerOpen}
      onOpenChange={onManagerOpenChange}
      item={item}
      isPending={isManagerPending}
      onSubmit={onManagerSubmit}
    />
    <TakeOrReleaseDialog
      open={isHoldOpen}
      onOpenChange={onHoldOpenChange}
      mode={holdMode}
      item={item}
      isPending={isHoldPending}
      onSubmit={onHoldSubmit}
    />
    <CustodyHistorySheet
      open={isHistoryOpen}
      onOpenChange={onHistoryOpenChange}
      item={item}
    />
  </>
);
