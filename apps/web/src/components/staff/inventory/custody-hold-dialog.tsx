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
  ChangePreview,
  CustodyDialogFrame,
  CustodyNoteField,
  IN_STORE,
  focusFirstInvalidField,
  issuesToErrors,
  noteSchema,
  useFormIdBase,
} from "@/components/staff/inventory/custody-form";
import type { InventoryItemView } from "@/components/staff/inventory/inventory-types";
import { InventoryInlineNotice } from "@/components/staff/inventory/shared";
import { useDiscardGuard } from "@/components/staff/inventory/stock-form-helpers";

export type CustodyHoldMode = "take" | "release";

export interface TakeOrReleaseDialogProps {
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
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isTake = mode === "take";
  const isOnLoan = (item?.borrowedQty ?? 0) > 0;
  const busy = isPending || isSubmitting;

  const reset = () => {
    setNote("");
    setError("");
    setIsSubmitting(false);
  };

  /**
   * This dialog's whole form is **one optional field**, which is exactly the shape
   * that makes a guard look like overkill — and it is the one dialog in this group
   * where losing it costs least, because nothing typed here is required for the
   * record. It is guarded anyway for one reason: consistency. A clerk who learns
   * that `Esc` is safe on four of the five custody dialogs will not learn it for
   * the fifth, and a feature where the *rules* differ per screen is a feature
   * where people make mistakes.
   */
  const { requestClose, confirmNode } = useDiscardGuard(
    note.trim().length > 0,
    () => {
      reset();
      onOpenChange(false);
    }
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!item || busy) {
      return;
    }

    const result = v.safeParse(noteSchema, note);
    if (!result.success) {
      setError(
        issuesToErrors<"note">(result.issues).note ??
          "This note is longer than the 500 characters a history row can carry"
      );
      focusFirstInvalidField(formRef.current);
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      await onSubmit({
        itemId: item.id,
        ...(result.output ? { note: result.output } : {}),
      });
      reset();
    } catch {
      // Refused, or the connection dropped. The note stays, the dialog stays, and
      // the page's `onError` has already toasted the server's sentence.
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <CustodyDialogFrame
        busyLabel={
          isTake
            ? "Assigning it to yourself."
            : "Recording the return to the store."
        }
        description={
          isTake
            ? `Put ${item?.name ?? "this item"} under the staff record behind your own account. It stays the school's property — this is a change of hands, not a loan.`
            : `Clear the custodian on ${item?.name ?? "this item"} and record that it is back in the store.`
        }
        formError={error || null}
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
        submitLabel={isTake ? "Assign to yourself" : "Return to the store"}
        title={isTake ? "Assign to yourself" : "Return it to the store"}
      >
        <ChangePreview
          footnote={holdPreviewFootnote(isTake)}
          from={holdPreviewFrom(isTake, item)}
          headline="Custody moves"
          to={isTake ? "yourself" : IN_STORE}
        />

        {isTake ? (
          <InventoryInlineNotice
            tone="info"
            title="This is not a loan"
            description="Assigning an item to yourself records it without moving any stock. To take one away from the building, raise a borrow — and the item has to be marked borrowable for that to be possible at all."
          />
        ) : null}

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

        <FieldSet>
          <FieldLegend>Anything worth recording</FieldLegend>
          <FieldGroup>
            <CustodyNoteField
              description="The server fixes the cause for both of these — a claim or a return to store — so this is the only free text that lands on the history row. It is optional and nothing is refused without it."
              disabled={busy}
              error={error || undefined}
              onChange={(next) => {
                setNote(next);
                setError("");
              }}
              placeholder="Optional. Why you are taking it, or where it is going back to."
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
