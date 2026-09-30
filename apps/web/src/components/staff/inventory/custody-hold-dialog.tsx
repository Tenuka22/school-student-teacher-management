"use client";

/**
 * The self-service pair, as one dialog with two modes.
 *
 * `takeItem` **narrows** the write rather than widening it: the custodian is always
 * the caller's own staff row and `newCustodianStaffId` is deliberately not an
 * input, so a teacher can claim an item for themselves and can never take one away
 * from a colleague. `releaseCustody` is the other half — without it, `takeItem` is
 * a one-way door: a teacher who claims a tripod in September has no route to give
 * it back in July, and every later claim on that item is refused as "already
 * yours". The register offers both as row actions because an administrator standing
 * at a cupboard is doing the same job, and making them hand over to a teacher in
 * order to hand something back would be a worse product than the one that exists.
 *
 * **A release always lands on a person.** `inventory_item.custodian_staff_id` is
 * `NOT NULL`, so there is no "back on the shelf with nobody" state to write, and
 * this dialog's release mode asks **who takes it now** with the item's in-charge
 * person preselected — the ordinary hand-back is to them, and the picker is there
 * for the ordinary exception (the colleague covering classes, the lab assistant
 * opening up). The server fixes the *cause* for a release; it cannot fix the
 * destination, so an untouched picker is a message on the field rather than a
 * null on the wire.
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
 * guessing costs nothing. The register is admin-only by decision, and the three
 * seeded accounts that can reach it — `admin`, `principal`, `vicePrincipal` — hold
 * their authority with **no staff row at all**, by design. `take-item.ts` refuses
 * those before opening a transaction: *"Your account has no staff record, so
 * equipment cannot be assigned to you."* So on the only screen where this dialog
 * appears, the action is guaranteed to fail for the default audience, while a
 * dialog titled "Take this item" with a preview reading `the store → you`
 * describes the outcome as if it were going to happen.
 *
 * Two routes were available and **hiding the action was the wrong one**. It needs
 * `custody.myItems` read on the admin register to learn the actor's `staffId` — an
 * extra request on an admin-only page, to gate a control whose fate is already
 * known. It would also make the control's visibility depend on a read whose failure
 * mode is a spinner rather than a sentence, and the one case where the action
 * *does* work (a storekeeper who is also an admin) would be the case where the
 * button silently vanished.
 *
 * So the choice is the other one: **name the action for what it is.** The title and
 * the button say "Assign to yourself", the preview's right-hand side is `yourself`
 * rather than the pronoun `you`, and the one condition that decides whether the
 * write can succeed is stated in the dialog as a rule, in the server's own terms.
 * The button stays enabled on purpose — the rule is per-account, a browser cannot
 * know it, and a disabled button with no explanation is the failure mode this is
 * avoiding.
 */
import {
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@school-student-teacher-management/ui/components/field";
import { IconPackageExport, IconUserMinus } from "@tabler/icons-react";
import { useRef, useState } from "react";
import * as v from "valibot";

import {
  CHOSEN_STAFF,
  ChangePreview,
  CustodyDialogFrame,
  CustodyNoteField,
  IN_STORE,
  focusFirstInvalidField,
  issuesToErrors,
  noteSchema,
  releaseSchema,
  useFormIdBase,
  usePartyName,
} from "@/components/staff/inventory/custody-form";
import type { CustodyErrors } from "@/components/staff/inventory/custody-form";
import type { InventoryItemView } from "@/components/staff/inventory/inventory-types";
import {
  InventoryInlineNotice,
  StaffComboboxField,
} from "@/components/staff/inventory/shared";
import { useDiscardGuard } from "@/components/staff/inventory/stock-form-helpers";

export type CustodyHoldMode = "take" | "release";

export interface TakeOrReleaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: CustodyHoldMode;
  item: InventoryItemView | null;
  isPending: boolean;
  /**
   * `newCustodianStaffId` is present **only in release mode**, where the
   * register demands a named successor. Take mode never sends one — the server
   * narrows the holder to the caller there — so the key's absence is how the
   * caller tells the two writes apart downstream.
   */
  onSubmit: (values: {
    itemId: string;
    note?: string;
    newCustodianStaffId?: string;
  }) => Promise<void>;
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

  return "Releases are recorded with the cause the server fixes for them — returned to store — and they land on the person chosen above: the register never leaves an item with nobody. A departure does not need this dialog — transfer custody or hand on the ownership to the colleague taking over.";
};

/**
 * The release's successor: the in-charge person until the picker is touched.
 *
 * **This is a function rather than a nested ternary in the component** because the
 * rule is a rule with a reason and the reason belongs next to the rule: until the
 * user picks somebody, the field reads as the ordinary hand-back — the item going
 * to whoever is answerable for it — and the moment they pick, their choice stands
 * even if a refetch has since changed the in-charge person. A stored default would
 * go stale the moment `item` was replaced, and an effect keyed on `open` would
 * either wipe a half-made choice or race the item arriving.
 */
const holdReceiverId = (
  hasPicked: boolean,
  picked: string | null,
  managerStaffId: string | null | undefined
): string | null => {
  if (hasPicked) {
    return picked;
  }

  return managerStaffId ?? null;
};

/**
 * The two notices only a *claim* shows.
 *
 * They are separated from the release notices below for the reason the whole
 * component is split by mode: a claim and a hand-back are different writes with
 * different rules, and every `isTake ? … : …` in one body was a reader holding two
 * dialogs in their head. Each notice here states a rule the server enforces, and
 * neither disables the button — see the banner comment for why guessing costs the
 * default audience more than it saves.
 */
const TakeModeNotices = () => (
  <>
    <InventoryInlineNotice
      tone="info"
      title="This is not a loan"
      description="Assigning an item to yourself records it without moving any stock. To take one away from the building, raise a borrow — and the item has to be marked borrowable for that to be possible at all."
    />
    {/*
      The one guard this dialog states rather than defers, and the reason is in
      the banner comment: the register is admin-only and the seeded leadership
      accounts have no staff row, so this write is the one an administrator is
      most likely to be refused. Stating the condition up front turns a
      guaranteed failure into something they can act on. The button stays
      enabled: the condition is about the account, not about anything on this
      screen, and a disabled control would hide the action from the storekeeper
      for whom it works.
    */}
    <InventoryInlineNotice
      tone="warning"
      title="This needs a staff record behind your account"
      description="A self-assignment is written to the staff row that belongs to your login, so an account with no staff profile cannot take one. The seeded leadership accounts — admin, principal and deputy principal — hold their authority without one by design. If that is you, ask an administrator to link your account, or use Transfer custody to put the item in somebody else's name."
    />
  </>
);

/**
 * Everything a hand-back adds over a claim: two warnings about refusals the
 * server decides, and the one field that names the successor.
 *
 * Both warnings state a condition and neither blocks the button. `isOnLoan` is
 * visible on the row and the server's message says why (the return date and the
 * signature have to be kept), so a disabled control would hide the one thing the
 * user needs to know; `isUnchanged` is a no-op the server refuses outright. The
 * notices turn a guaranteed failure into a stated rule, which is the difference
 * between a form that argues with you and one that lies about the outcome.
 */
const ReleaseModeFields = ({
  busy,
  error,
  isOnLoan,
  isUnchanged,
  onPick,
  receiverId,
}: {
  busy: boolean;
  error?: string;
  isOnLoan: boolean;
  isUnchanged: boolean;
  onPick: (staffId: string | null) => void;
  receiverId: string | null;
}) => (
  <>
    {isOnLoan ? (
      <InventoryInlineNotice
        tone="warning"
        title="This item may be out on loan"
        description="A hand-back is refused while units are away: the loan has to be returned through its own record first, so the return date and the signature are kept. Go ahead — if that is the case, the server will say so."
      />
    ) : null}
    {isUnchanged ? (
      <InventoryInlineNotice
        tone="warning"
        title="That person already holds this item"
        description="The server refuses a hand-back to the current holder, because that would be a no-op on the record. The in-charge person is preselected because it is the usual destination — pick somebody else if the item is going somewhere else."
      />
    ) : null}
    <FieldSet>
      <FieldLegend>Hands</FieldLegend>
      <FieldGroup>
        <StaffComboboxField
          description="Who takes it now. The person in charge of the item is preselected — that is the ordinary hand-back — and the picker is there for the exception: the colleague covering classes, the assistant opening the room."
          disabled={busy}
          error={error}
          label="Hand it to"
          onChange={onPick}
          placeholder="Search for the member of staff taking it..."
          value={receiverId}
        />
      </FieldGroup>
    </FieldSet>
  </>
);

/**
 * The state a submit needs, gathered so the two paths below can be plain
 * functions rather than branches inside a 200-line component.
 *
 * It is an object and not six parameters because these are the values that
 * change together: `errors` is set by validation and cleared by a successful
 * write, `isSubmitting` is set beside it and cleared only by a failure, and
 * `reset` is what a success calls. Passing them separately invited one path to
 * clear the error state and forget the busy flag.
 */
interface HoldSubmitContext {
  formRef: React.RefObject<HTMLFormElement | null>;
  itemId: string;
  note: string;
  onSubmit: TakeOrReleaseDialogProps["onSubmit"];
  reset: () => void;
  setErrors: React.Dispatch<React.SetStateAction<CustodyErrors>>;
  setIsSubmitting: (value: boolean) => void;
}

/** A claim: one optional note, and no destination to name. */
const submitTake = async ({
  formRef,
  itemId,
  note,
  onSubmit,
  reset,
  setErrors,
  setIsSubmitting,
}: HoldSubmitContext) => {
  const result = v.safeParse(noteSchema, note);
  if (!result.success) {
    setErrors(issuesToErrors<"note">(result.issues));
    focusFirstInvalidField(formRef.current);
    return;
  }

  setErrors({});
  setIsSubmitting(true);

  try {
    await onSubmit({
      itemId,
      ...(result.output ? { note: result.output } : {}),
    });
    reset();
  } catch {
    // Refused, or the connection dropped. The note stays, the dialog stays,
    // and the page's `onError` has already toasted the server's sentence.
    setIsSubmitting(false);
  }
};

/**
 * A hand-back: the successor and the note are validated together, so an untouched
 * picker and an over-long note are both reported on the field that caused them
 * rather than as one sentence about the form.
 */
const submitRelease = async (
  context: HoldSubmitContext,
  receiverId: string | null
) => {
  const result = v.safeParse(releaseSchema, {
    newCustodianStaffId: receiverId ?? "",
    note: context.note,
  });
  if (!result.success) {
    context.setErrors(issuesToErrors<keyof CustodyErrors>(result.issues));
    focusFirstInvalidField(context.formRef.current);
    return;
  }

  context.setErrors({});
  context.setIsSubmitting(true);

  try {
    await context.onSubmit({
      itemId: context.itemId,
      newCustodianStaffId: result.output.newCustodianStaffId,
      ...(result.output.note ? { note: result.output.note } : {}),
    });
    context.reset();
  } catch {
    // Refused, or the connection dropped. The pick and the note stay, and the
    // page's `onError` has already toasted the server's sentence.
    context.setIsSubmitting(false);
  }
};

/**
 * Every sentence this dialog shows, chosen by mode, in one object.
 *
 * **A claim and a hand-back are two dialogs that share a form**, and the copy is
 * where that shows most: the title, the button, the busy label, the preview's
 * right-hand side and the note's own hint are all different words for the two
 * writes, because the two writes are different — one names a person who has
 * already been decided (yourself) and one asks the user to name one. Scattering
 * that choice as `isTake ? … : …` through the render meant every sentence had to
 * be read together with five others to be understood, and it is what pushed this
 * component past the complexity budget on its own.
 *
 * `previewTo` is here rather than in the render for the same reason: the claim
 * path's right-hand side is a fixed word, and the hand-back's is a name with a
 * fallback for the moment before the combobox has resolved one. Computing it
 * where the words live keeps the `CHOSEN_STAFF` fallback next to the sentence that
 * explains it.
 */
const holdCopy = (
  isTake: boolean,
  itemName: string | undefined,
  receiverName: string | null
) => {
  if (isTake) {
    return {
      busyLabel: "Assigning it to yourself.",
      description: `Put ${itemName ?? "this item"} under the staff record behind your own account. It stays the school's property — this is a change of hands, not a loan.`,
      noteDescription:
        "The server fixes the cause for a claim, so this is the only free text that lands on the history row. It is optional and nothing is refused without it.",
      previewTo: "yourself",
      submitLabel: "Assign to yourself",
      title: "Assign to yourself",
    };
  }

  return {
    busyLabel: "Recording the hand-back.",
    description: `Hand ${itemName ?? "this item"} back by recording who takes it now — the register never says "nobody".`,
    noteDescription:
      "The server fixes the cause for a hand-back — returned to store — so this is the only free text that lands on the history row. It is optional and nothing is refused without it.",
    previewTo: receiverName ?? CHOSEN_STAFF,
    submitLabel: "Hand it back",
    title: "Hand it back",
  };
};

export const TakeOrReleaseDialog = ({
  open,
  onOpenChange,
  mode,
  item,
  isPending,
  onSubmit,
}: TakeOrReleaseDialogProps) => {
  const formId = `${useFormIdBase()}-form`;
  const formRef = useRef<HTMLFormElement>(null);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<CustodyErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  /**
   * The release's successor, and the flag that says the user chose it.
   *
   * **The default is the in-charge person, and it is read rather than stored.**
   * Until the picker is touched, `receiverId` is `item.managerStaffId` — the
   * ordinary hand-back, one click from done — and the moment the user picks
   * somebody else (or clears nothing, since the field cannot be cleared) the
   * flag flips and their choice is what stands. A stored default would go stale
   * the instant a refetch replaced `item`, and an effect keyed on `open` would
   * either wipe a half-made choice or race the item arriving.
   */
  const [picked, setPicked] = useState<string | null>(null);
  const [hasPicked, setHasPicked] = useState(false);
  const isTake = mode === "take";
  const receiverId = isTake
    ? null
    : holdReceiverId(hasPicked, picked, item?.managerStaffId);
  const receiverName = usePartyName(receiverId);
  const isOnLoan = (item?.borrowedQty ?? 0) > 0;
  const isUnchanged =
    receiverId !== null && receiverId === item?.custodianStaffId;
  const busy = isPending || isSubmitting;
  const formError = errors.note ?? errors.newCustodianStaffId ?? null;

  /**
   * Dirty when there is something to lose: the typed note, or a release whose
   * successor is no longer the in-charge person the field opened on. The take
   * mode has no successor at all, so the flag cannot make it look dirty.
   */
  const isDirty = note.trim().length > 0 || (!isTake && hasPicked);

  /**
   * The mode's sentences, resolved once per render so the six places that show
   * copy read from one object rather than each asking `isTake` again.
   */
  const copy = holdCopy(isTake, item?.name, receiverName);

  const reset = () => {
    setNote("");
    setErrors({});
    setPicked(null);
    setHasPicked(false);
    setIsSubmitting(false);
  };

  /**
   * This dialog's whole form is **one optional note in take mode** — which is
   * the shape that makes a guard look like overkill — and it is guarded anyway
   * for one reason: consistency. A clerk who learns that `Esc` is safe on four
   * of the five custody dialogs will not learn it for the fifth, and a feature
   * where the *rules* differ per screen is a feature where people make mistakes.
   */
  const { requestClose, confirmNode } = useDiscardGuard(isDirty, () => {
    reset();
    onOpenChange(false);
  });

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!item || busy) {
      return;
    }

    const context: HoldSubmitContext = {
      formRef,
      itemId: item.id,
      note,
      onSubmit,
      reset,
      setErrors,
      setIsSubmitting,
    };

    if (isTake) {
      await submitTake(context);
      return;
    }

    await submitRelease(context, receiverId);
  };

  return (
    <>
      <CustodyDialogFrame
        busyLabel={copy.busyLabel}
        description={copy.description}
        formError={formError}
        formId={formId}
        formRef={formRef}
        isPending={busy}
        onOpenChange={(next) => {
          if (next || busy) {
            onOpenChange(next);
            return;
          }
          requestClose();
        }}
        onRequestClose={requestClose}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        open={open}
        submitIcon={
          isTake ? (
            <IconPackageExport data-icon="inline-start" />
          ) : (
            <IconUserMinus data-icon="inline-start" />
          )
        }
        submitLabel={copy.submitLabel}
        title={copy.title}
      >
        <ChangePreview
          footnote={holdPreviewFootnote(isTake)}
          from={holdPreviewFrom(isTake, item)}
          headline="Custody moves"
          to={copy.previewTo}
        />

        {isTake ? <TakeModeNotices /> : null}

        {isTake ? null : (
          <ReleaseModeFields
            busy={busy}
            error={errors.newCustodianStaffId}
            isOnLoan={isOnLoan}
            isUnchanged={isUnchanged}
            onPick={(next) => {
              setPicked(next);
              setHasPicked(true);
              setErrors((previous) => ({
                ...previous,
                newCustodianStaffId: undefined,
              }));
            }}
            receiverId={receiverId}
          />
        )}

        <FieldSet>
          <FieldLegend>Anything worth recording</FieldLegend>
          <FieldGroup>
            <CustodyNoteField
              description={copy.noteDescription}
              disabled={busy}
              error={errors.note}
              onChange={(next) => {
                setNote(next);
                setErrors((previous) => ({ ...previous, note: undefined }));
              }}
              placeholder="Optional. Why you are taking it, or where it is going."
              rows={2}
              value={note}
            />
          </FieldGroup>
        </FieldSet>
      </CustodyDialogFrame>
      {confirmNode}
    </>
  );
};
