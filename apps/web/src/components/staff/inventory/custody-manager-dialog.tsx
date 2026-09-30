"use client";

/**
 * Appoint or replace the person in charge of an item.
 *
 * **The field opens on the untouched state and the untouched state records
 * nothing.** See `ManagerDecision` for why an absent choice cannot double as an
 * instruction; the short version is that a `string | null` picker makes "nobody
 * was chosen" and "nobody is in charge" the same value, and only one of those is
 * something anybody meant to do. So `choice` starts `undefined`, and the `reset`
 * on close puts it back there — a dialog that reopens holding a request nobody
 * confirmed is the original bug, and closing it must not be the only way out of
 * it.
 *
 * **This dialog has no clearing path, and that is the store's rule rather than a
 * missing button.** The owner column cannot be empty: `createItem` requires both
 * holders, both columns are `NOT NULL`, and `assignManager` takes
 * `newManagerStaffId` as a required staff id. `manager_cleared` survives in the
 * change-type constants only for rows written before that rule — accountability
 * moves from person to person, never to nobody. The argument for keeping this
 * verb separate from the owner's own hand-on is written above
 * `TransferOwnershipDialog`.
 */
import {
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@school-student-teacher-management/ui/components/field";
import { IconUserCog } from "@tabler/icons-react";
import { useReducer, useRef, useState } from "react";
import * as v from "valibot";

import {
  CHOSEN_STAFF,
  ChangePreview,
  CurrentManagerBadge,
  CustodyDialogFrame,
  CustodyNoteField,
  NO_MANAGER,
  focusFirstInvalidField,
  issuesToErrors,
  reasonAndNoteSchema,
  useFormIdBase,
  usePartyName,
} from "@/components/staff/inventory/custody-form";
import type {
  ChangePreviewProps,
  CustodyErrors,
} from "@/components/staff/inventory/custody-form";
import type { InventoryItemView } from "@/components/staff/inventory/inventory-types";
import {
  InventoryInlineNotice,
  StaffComboboxField,
  TransferReasonField,
} from "@/components/staff/inventory/shared";
import { useDiscardGuard } from "@/components/staff/inventory/stock-form-helpers";

/**
 * **What this dialog has been asked to do, which is not the same as what is in the
 * person field.**
 *
 * There are two answers, and only one of them names a person:
 *
 * - `leave` — nobody was chosen, so there is no request. Nothing is sent.
 * - `appoint` — a staff id, which may be a first appointment or a replacement.
 *
 * **A nullable field cannot express these, which is the bug this type exists to
 * prevent.** The combobox's contract is `string | null`, so the obvious encoding —
 * `null` meaning "nobody" — makes *not touching the dialog* identical to *a
 * request to write*. Those are opposite requests with opposite consequences, and
 * the destructive reading would be the default. An administrator who opens the
 * dialog on a projector that has a manager, picks a reason, forgets the person
 * field and presses the button would be three clicks from a write nobody asked
 * for — and while `assignManager` refuses to clear the slot today, a request the
 * server happens to refuse is still a request this dialog should never have
 * formed.
 *
 * So the untouched state is `undefined`: not a person, not a name, and above all
 * not a request. A null arriving on the selection callback is absorbed into
 * "nothing chosen" rather than becoming one, and the `reset` action puts the
 * field back to `undefined`. The bug was never the state itself, it was three
 * places agreeing that a blank was an instruction.
 */
type ManagerDecision =
  | { kind: "leave" }
  | { kind: "appoint"; staffId: string; name: string | null };

/** The two states, read off the field's own value. */
const managerDecision = (
  choice: string | undefined,
  name: string | null
): ManagerDecision => {
  if (choice === undefined) {
    return { kind: "leave" };
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
 * **The invariant this buys is that a reset cannot be half-applied.** Three
 * fields change together when the dialog closes or a write succeeds, and the one
 * that matters most is `choice`: a dialog that reopens with a leftover id in it
 * is a form pre-filled with a request nobody confirmed, so clearing everything
 * *except* that field would be the worst possible refactor. With a reducer that
 * is a structural impossibility rather than a convention somebody has to
 * remember.
 */
interface ManagerFormState {
  /** A staff id to appoint, or untouched. */
  choice: string | undefined;
  reason: string;
  note: string;
  errors: CustodyErrors;
}

const INITIAL_MANAGER_FORM: ManagerFormState = {
  choice: undefined,
  reason: "",
  note: "",
  errors: {},
};

type ManagerFormAction =
  | { type: "choose"; staffId: string | null }
  | { type: "reason"; value: string }
  | { type: "note"; value: string }
  | { type: "invalid"; errors: CustodyErrors }
  | { type: "reset" };

const managerFormReducer = (
  state: ManagerFormState,
  action: ManagerFormAction
): ManagerFormState => {
  switch (action.type) {
    /*
     * A `null` here cannot become a request: the combobox has no clear
     * affordance, and its own contract is `string | null`, so a null arriving on
     * the selection callback is not a state this form has — reading it as
     * "nothing chosen" is the only safe way to absorb it, because the other
     * reading is a write nobody asked for.
     */
    case "choose": {
      /*
       * No error is cleared here, and that is deliberate: the only errors this
       * dialog collects are the reason and note schema's, and picking a person
       * changes neither of them. An error that a click on an unrelated field
       * erased is an error the user was never told about.
       */
      return {
        ...state,
        choice: action.staffId ?? state.choice ?? undefined,
      };
    }
    case "reason": {
      return {
        ...state,
        reason: action.value,
        errors: { ...state.errors, reason: undefined },
      };
    }
    case "note": {
      return {
        ...state,
        note: action.value,
        errors: { ...state.errors, note: undefined },
      };
    }
    case "invalid": {
      return { ...state, errors: action.errors };
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
 * The preview for all three outcomes — appoint over nobody, replace somebody, and
 * record nothing at all.
 *
 * Returned as `ChangePreviewProps` rather than a bespoke shape so the two states
 * that record nothing cannot be rendered as a move: a caller spreading this into
 * `ChangePreview` gets the union's own enforcement, and a branch that forgot which
 * of the two it was would not type-check.
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
        "This dialog records a change, so while nobody is chosen nothing is sent to the server and no history row is appended. Choosing somebody above appoints or replaces.",
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
 * The label, the explanation and the button, one per state.
 *
 * Both are derived from the same `ManagerDecision` so they cannot disagree about
 * what the form is about to do — the original bug was three components each
 * reading `managerId === null` and each concluding that the dialog was asking for
 * a removal.
 */
const managerFieldLabel = (decision: ManagerDecision): string => {
  if (decision.kind === "leave") {
    return "In charge of this item — leaving as is";
  }

  return "In charge of this item";
};

const managerFieldDescription = (
  decision: ManagerDecision,
  currentManager: string | null
): string => {
  if (decision.kind === "leave") {
    return "Nobody is chosen, so nothing is recorded and the current manager stays exactly as they are. Choosing somebody here appoints or replaces them.";
  }

  return currentManager
    ? `This replaces ${currentManager} as the manager of this item. The custodian is not touched — accountability and custody are separate facts on this trail.`
    : "This appoints the person a principal would ask about this item. The custodian is not touched — accountability and custody are separate facts on this trail.";
};

const managerSubmitLabel = (decision: ManagerDecision): string =>
  decision.kind === "leave" ? "Nothing to record" : "Record manager";

export interface AssignManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItemView | null;
  isPending: boolean;
  onSubmit: (values: {
    itemId: string;
    newManagerStaffId: string;
    reason: string;
    note?: string;
  }) => Promise<void>;
}

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
   * only thing that clears it.
   */
  const [form, dispatch] = useReducer(managerFormReducer, INITIAL_MANAGER_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formId = `${useFormIdBase()}-form`;
  const formRef = useRef<HTMLFormElement>(null);
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
  const busy = isPending || isSubmitting;

  const isDirty =
    managerChoice !== undefined || reason !== "" || note.trim().length > 0;

  const { requestClose, confirmNode } = useDiscardGuard(isDirty, () => {
    dispatch({ type: "reset" });
    setIsSubmitting(false);
    onOpenChange(false);
  });

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!item || busy) {
      return;
    }

    /*
     * The untouched state is the absence of a request, so it is refused here
     * rather than being left to a disabled button: a form submits on Enter, and a
     * disabled submit button does not stop that. Sending `null` for "the user did
     * not choose anyone" is the exact bug this dialog was rewritten to remove,
     * and it must not be reachable by any route.
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
      focusFirstInvalidField(formRef.current);
      return;
    }

    setIsSubmitting(true);

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
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <CustodyDialogFrame
        busyLabel="Recording the change to who is in charge. The reason and note stay on screen if the server refuses it."
        description={
          item ? (
            <>
              Who is accountable for {item.name} — a different question from who
              is holding it
            </>
          ) : (
            "Who is accountable for this item, which is a different question from who is holding it"
          )
        }
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
        submitDisabled={decision.kind === "leave"}
        submitIcon={<IconUserCog data-icon="inline-start" />}
        submitLabel={managerSubmitLabel(decision)}
        title="Assign or change manager"
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
               * The field has no clear affordance at all: an empty box means
               * "nothing chosen yet", and a null arriving on the callback is
               * read as exactly that, which is the only safe reading of it.
               */
              description={managerFieldDescription(decision, currentManager)}
              disabled={busy}
              label={managerFieldLabel(decision)}
              onChange={(next) => {
                dispatch({ type: "choose", staffId: next });
              }}
              placeholder="Search for the person in charge..."
              value={managerChoice ?? null}
            />

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
              description="Required on an appointment and on a replacement alike."
              error={errors.reason}
              onChange={(value) => {
                dispatch({ type: "reason", value });
              }}
              value={reason}
            />
            <CustodyNoteField
              description="Both land on the same history row, and only the sentence survives a later question that turns out to be about one particular handover."
              disabled={busy}
              error={errors.note}
              onChange={(value) => {
                dispatch({ type: "note", value });
              }}
              placeholder="Optional. What the next person to read this row will want to know."
              value={note}
            />
          </FieldGroup>
        </FieldSet>

        <ChangePreview {...preview} />
      </CustodyDialogFrame>

      {confirmNode}
    </>
  );
};
