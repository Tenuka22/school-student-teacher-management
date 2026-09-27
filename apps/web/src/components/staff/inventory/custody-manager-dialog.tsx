"use client";

/**
 * Appoint, replace or remove the person in charge of an item.
 *
 * **The field opens on the untouched state and the untouched state records
 * nothing.** See `ManagerDecision` for why a binary field cannot carry these
 * three answers; the short version is that a `string | null` picker makes "nobody
 * was chosen" and "nobody is in charge" the same value, and only one of those is
 * something anybody meant to do. So `choice` starts `undefined`, the combobox is
 * given no clear affordance of its own, and the removal is a button that opens a
 * confirm. The `reset` on close puts the field back to `undefined` — a dialog
 * that reopens in its destructive state is the original bug, and closing it must
 * not be the only way out of it.
 *
 * Clearing the manager does **not** touch the custodian. They are two separate
 * facts with two separate halves of the same history table, and the dialog says so
 * at the moment it clears one while the other is set.
 *
 * **This is the other of the two verbs that write the owner column, and the one
 * that can leave it empty.** `transferOwnership` is the owner's own hand-on, gated
 * on `manageOwn` with a required successor; this one is gated on `update` and its
 * successor is nullable. The argument for keeping them apart is written above
 * `TransferOwnershipDialog`.
 */
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@school-student-teacher-management/ui/components/field";
import { IconUserCog, IconUserMinus } from "@tabler/icons-react";
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

import { ClearManagerDialog } from "./clear-manager-dialog";

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
 * So the untouched state is `undefined`: not a person, not a name, and above all
 * not a request. `null` can only be reached by pressing "No manager — clear the
 * slot" and then confirming, and the `reset` action puts the field back to
 * `undefined` rather than to `null`. If this ever goes back to two states, the
 * label, the submit button and the preview all have to be re-read together: the
 * bug was never the state itself, it was three places agreeing that a blank was an
 * instruction.
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
 * **The invariant this buys is that a reset cannot be half-applied.** Four fields
 * change together when the dialog closes or a write succeeds, and the one that
 * matters most is `choice`: a dialog that reopens with a leftover `null` in it is
 * the destructive-default bug this whole rewrite exists to prevent, so clearing
 * everything *except* the dangerous field would be the worst possible refactor.
 * With a reducer that is a structural impossibility rather than a convention
 * somebody has to remember.
 *
 * `confirmClear` is one action for the same reason: closing the confirm and
 * setting the cleared state cannot come apart, so there is no ordering in which
 * the dialog says "nobody" without the confirmation having happened, or shows a
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
     * and the only route to `null` is `confirmClear`. The combobox's own contract
     * is `string | null`, so a null arriving on the selection callback is not a
     * state this form has — and reading it as untouched is the only safe way to
     * absorb it, because the other reading is a removal nobody asked for.
     */
    case "choose": {
      return {
        ...state,
        choice: action.staffId ?? state.choice ?? undefined,
        errors: { ...state.errors, newCustodianStaffId: undefined },
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

const managerSubmitLabel = (decision: ManagerDecision): string => {
  if (decision.kind === "leave") {
    return "Nothing to record";
  }

  return decision.kind === "clear" ? "Record removal" : "Record manager";
};

export interface AssignManagerDialogProps {
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

  /**
   * Only a manager the item actually has can be removed: `assignManager` refuses
   * clearing a slot that is already empty, so with nobody in charge the button
   * would offer a request the server always rejects.
   */
  const canClear = currentManagerId !== null && decision.kind !== "clear";

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
               * `onChange` never sees a null: the clear affordance is the button
               * below, and a null arriving anyway is read as "nothing chosen",
               * which is the only safe reading of it.
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

            {/*
              The removal is an explicit, separately confirmed act rather than
              the meaning of an empty box. The badge states the state the field
              is in, and the button beside it is the way back — a removal the
              user cannot undo inside the form is a removal they will be afraid
              to attempt.
            */}
            {decision.kind === "clear" ? (
              <div className="flex flex-wrap items-center gap-2">
                {/*
                  The state the field is in, as a chip: the word *and* the icon *and*
                  the dashed edge, so "nobody" is never carried by the treatment
                  alone. A `Badge` rather than a hand-rolled span, because a chip in
                  this app that is not a `Badge` is a chip the next person has to
                  re-derive.
                */}
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
                  disabled={busy}
                  onClick={() => {
                    dispatch({ type: "keepManager" });
                  }}
                >
                  Keep {currentManager ?? "the current manager"}
                </Button>
              </div>
            ) : null}

            {canClear ? (
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  className="w-fit"
                  onClick={() => {
                    dispatch({ type: "openClearConfirm" });
                  }}
                  data-icon="inline-start"
                >
                  <IconUserMinus data-icon="inline-start" />
                  No manager — clear the slot
                </Button>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Removes {currentManager} as the manager of this item and
                  records it. This is not what the empty field above means: the
                  empty field means nothing was chosen, and choosing nothing
                  records nothing.
                </p>
              </div>
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
              description="Required on an appointment, a replacement and a clearing alike."
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

      <ClearManagerDialog
        currentManager={currentManager}
        isOpen={form.isClearConfirmOpen}
        isPending={busy}
        itemName={item?.name ?? "this item"}
        onCancel={() => {
          dispatch({ type: "cancelClearConfirm" });
        }}
        onConfirm={() => {
          dispatch({ type: "confirmClear" });
        }}
      />
      {confirmNode}
    </>
  );
};
