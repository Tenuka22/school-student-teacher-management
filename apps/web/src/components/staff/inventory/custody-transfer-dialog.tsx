"use client";

/**
 * Hand an item from one member of staff to another.
 *
 * **The reason is presented as required from the first render, never as an error
 * the user discovers on submit.** `transferCustody` declares `reason` as a
 * required `inventoryTransferReasonSchema`, and the database CHECK behind it
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
import {
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@school-student-teacher-management/ui/components/field";
import { IconUserCheck } from "@tabler/icons-react";
import { useRef, useState } from "react";
import * as v from "valibot";

import {
  CHOSEN_STAFF,
  ChangePreview,
  CurrentHolderBadge,
  CustodyDialogFrame,
  CustodyNoteField,
  IN_STORE,
  focusFirstInvalidField,
  issuesToErrors,
  transferSchema,
  useFormIdBase,
  usePartyName,
} from "@/components/staff/inventory/custody-form";
import type { CustodyErrors } from "@/components/staff/inventory/custody-form";
import type { InventoryItemView } from "@/components/staff/inventory/inventory-types";
import {
  InventoryInlineNotice,
  StaffComboboxField,
  TransferReasonField,
} from "@/components/staff/inventory/shared";
import { useDiscardGuard } from "@/components/staff/inventory/stock-form-helpers";

export interface TransferCustodyDialogProps {
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

export const TransferCustodyDialog = ({
  open,
  onOpenChange,
  item,
  isPending,
  onSubmit,
}: TransferCustodyDialogProps) => {
  const formBase = useFormIdBase();
  const formId = `${formBase}-form`;
  const formRef = useRef<HTMLFormElement>(null);
  const [receiverId, setReceiverId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<CustodyErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const receiverName = usePartyName(receiverId);

  const busy = isPending || isSubmitting;

  const isFirstClaim = item !== null && item.custodianStaffId === null;
  const isUnchanged =
    receiverId !== null && receiverId === item?.custodianStaffId;
  const currentHolder = item?.custodianName ?? IN_STORE;

  const isDirty =
    receiverId !== null || reason !== "" || note.trim().length > 0;

  const reset = () => {
    setReceiverId(null);
    setReason("");
    setNote("");
    setErrors({});
    setIsSubmitting(false);
  };

  /**
   * Every way out of a `Dialog` — Esc, the X, the backdrop, Cancel — is a route
   * that can throw away a half-typed reason and a note somebody spent ninety
   * seconds writing, and in a feature about accountability that is not a
   * convenience to lose. This dialog had no guard at all, unlike the two borrow
   * dialogs on the other side of this folder, which is how one feature ended up
   * disagreeing with itself about whether a form is worth protecting.
   */
  const { requestClose, confirmNode } = useDiscardGuard(isDirty, () => {
    reset();
    onOpenChange(false);
  });

  /**
   * The in-flight guard, and it is local rather than the `isPending` prop.
   *
   * `isPending` is the page's `mutation.isPending`, which is still `false` on the
   * tick between the click and the mutation entering its pending state. Two
   * clicks — or one click and one `Enter`, because a form submits implicitly — in
   * that window ran `onSubmit` twice, which is two custody rows for one handover
   * and a register that says an item changed hands twice on one afternoon.
   */
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!item || busy) {
      return;
    }

    const result = v.safeParse(transferSchema, {
      newCustodianStaffId: receiverId ?? "",
      reason,
      note,
    });

    if (!result.success) {
      setErrors(issuesToErrors<keyof CustodyErrors>(result.issues));
      focusFirstInvalidField(formRef.current);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

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
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <CustodyDialogFrame
        busyLabel="Recording the transfer — the reason and note stay on screen if the server refuses it."
        description={
          item ? (
            <>
              {item.name}{" "}
              <span className="font-mono text-xs">({item.sku})</span> — this
              records who held it, who holds it now, and why
            </>
          ) : (
            "This records who held the item, who holds it now, and why"
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
        submitIcon={<IconUserCheck data-icon="inline-start" />}
        submitLabel="Record transfer"
        title="Transfer custody"
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
              allowClear
              description="Only members of staff who are still employed can be given school property — teaching staff and office staff alike. This is the same list the server accepts, so anybody offered here will be accepted."
              disabled={busy}
              error={errors.newCustodianStaffId}
              label="Hand it to"
              onChange={(next) => {
                setReceiverId(next);
                setErrors((previous) => ({
                  ...previous,
                  newCustodianStaffId: undefined,
                }));
              }}
              placeholder="Search for the member of staff taking it..."
              value={receiverId}
            />

            {isUnchanged ? (
              <InventoryInlineNotice
                tone="warning"
                title="That person already holds this item"
                description="The server refuses a transfer to the current custodian, because that would be a no-op on the record. Pick somebody else, or hand it back instead — that one goes to the person in charge."
              />
            ) : null}
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend>Why</FieldLegend>
          <FieldGroup>
            <TransferReasonField
              description="Required on every transfer, not only this one."
              error={errors.reason}
              onChange={(next) => {
                setReason(next);
                setErrors((previous) => ({ ...previous, reason: undefined }));
              }}
              value={reason}
            />
            <CustodyNoteField
              description="The reason is the category; this is the sentence. Both land on the same history row, and only the sentence survives a later question that turns out to be about one specific pair of people."
              disabled={busy}
              error={errors.note}
              onChange={(next) => {
                setNote(next);
                setErrors((previous) => ({ ...previous, note: undefined }));
              }}
              placeholder="Optional. The detail the eight reasons cannot carry — who has the other projector, which room it is going to."
              value={note}
            />
          </FieldGroup>
        </FieldSet>

        {/*
          The preview sits last in the form, directly above the button that acts
          on it, so the sentence and the click are adjacent. The unknown-name
          fallback is deliberate — see `usePartyName` — and the wording is true
          whether or not the name resolves.
        */}
        <ChangePreview
          footnote={
            isUnchanged
              ? "Nothing to record yet — that is the person who already holds it."
              : "A row is appended to this item's custody history. Nothing is deleted, and a transfer cannot be undone from the register: a second transfer is what corrects it, and it carries its own reason."
          }
          from={currentHolder}
          headline="Custody moves"
          to={receiverName ?? CHOSEN_STAFF}
        />
      </CustodyDialogFrame>
      {confirmNode}
    </>
  );
};
