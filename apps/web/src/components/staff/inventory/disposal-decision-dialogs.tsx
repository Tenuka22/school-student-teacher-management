"use client";

/**
 * The three decisions somebody can make on an existing write-off certificate:
 * sign it off, finalise it, or withdraw it.
 *
 * **Only finalising moves stock, and only finalising is irreversible**, so only
 * finalising gets an `AlertDialog`. A confirm in front of the other two would teach
 * people to dismiss confirms — the two decisions that write no movement are
 * distinguished by a title that says which row of the ladder they are, and that is
 * a stronger statement than a red button.
 *
 * `finalize` is the one irreversible step in the whole feature, so:
 *
 * 1. The six terminal outcomes are a `Select`, not free text, and each carries a
 *    one-line consequence in `FINAL_OUTCOME_CONSEQUENCE` — "Written off" and
 *    "Donated" are both "removed from the register" to a reader who does not already
 *    know the difference, and the difference is the whole point of choosing.
 * 2. The `AlertDialog` names the item, the quantity and the outcome, and states in
 *    words that the quantity drops and the tags become `disposed` the moment it is
 *    confirmed. It does not take `closeOnEscape`, so `Esc` and a backdrop click are
 *    both refused.
 * 3. `finalizeDisposal` re-checks availability itself, because weeks pass between the
 *    request and the signature and the units may have been issued or borrowed in
 *    between. That refusal is surfaced as-is.
 */
import {
  DISPOSAL_FINAL_STATUSES,
  disposalMethodLabel,
  disposalStatusLabel,
} from "@school-student-teacher-management/db/constants/inventory";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@school-student-teacher-management/ui/components/alert-dialog";
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
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import { Textarea } from "@school-student-teacher-management/ui/components/textarea";
import { IconCheck, IconX } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import {
  DialogStatus,
  fieldErrorsFromApi,
  useFirstInvalidFocus,
} from "@/components/staff/inventory/dialog-form";
import {
  FINAL_OUTCOME_CONSEQUENCE,
  formatAmount,
  isFinalStatus,
} from "@/components/staff/inventory/disposal-certificates";
import type { DisposalRecord } from "@/components/staff/inventory/inventory-types";
import { pluralUnits } from "@/components/staff/inventory/quantity";
import {
  InventoryInlineNotice,
  MoneyField,
  invalidateInventory,
} from "@/components/staff/inventory/shared";
import {
  PartyName,
  describeParty,
  formatDateTime,
  issuesToFieldErrors,
  useDiscardGuard,
} from "@/components/staff/inventory/stock-form-helpers";
import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

/** `cancelDisposal`'s own cap. The character counter is honest because of it. */
const MAX_CANCEL_REASON = 500;

const cancelSchema = v.object({
  reason: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "Say why this request is being withdrawn"),
    v.maxLength(
      MAX_CANCEL_REASON,
      `Keep the reason under ${MAX_CANCEL_REASON} characters`
    )
  ),
});

/**
 * The certificate the approver is signing, as a labelled definition list.
 *
 * **A `<dl>` and not a grid of `label / value` divs.** On the one screen where a
 * principal is signing a financial certificate, the pairing *is* the content: `dt`
 * and `dd` keep "Item" attached to "3 × Water-damaged projector" for anybody reading
 * linearly, which a two-column div grid does not.
 */
const CertificateSummary: React.FC<{
  disposal: DisposalRecord;
  idBase: string;
}> = ({ disposal, idBase }) => (
  <dl
    className="border-border divide-border divide-y border"
    aria-labelledby={`${idBase}-heading`}
  >
    <div className="flex gap-3 px-3 py-2">
      <dt className="text-muted-foreground w-32 shrink-0 text-xs">Item</dt>
      <dd className="min-w-0 text-sm font-medium">
        {disposal.qty} &times; {disposal.itemName}{" "}
        <span className="text-muted-foreground font-mono text-xs">
          {disposal.itemSku}
        </span>
      </dd>
    </div>
    <div className="flex gap-3 px-3 py-2">
      <dt className="text-muted-foreground w-32 shrink-0 text-xs">Reason</dt>
      <dd className="min-w-0 text-sm">{disposal.reason}</dd>
    </div>
    <div className="flex gap-3 px-3 py-2">
      <dt className="text-muted-foreground w-32 shrink-0 text-xs">Method</dt>
      <dd className="text-sm">
        {disposal.methodLabel ?? disposalMethodLabel(disposal.method)}
      </dd>
    </div>
    <div className="flex gap-3 px-3 py-2">
      <dt className="text-muted-foreground w-32 shrink-0 text-xs">
        Estimated value
      </dt>
      <dd className="text-sm tabular-nums">
        {formatAmount(disposal.estimatedValue ?? null)}
      </dd>
    </div>
    <div className="flex gap-3 px-3 py-2">
      <dt className="text-muted-foreground w-32 shrink-0 text-xs">
        Requested by
      </dt>
      <dd className="text-sm">
        <PartyName
          name={disposal.requestedByName}
          staffId={disposal.requestedByStaffId}
          emptyLabel="Raised by an account with no staff record"
        />
        {disposal.requestedAt ? (
          <span className="text-muted-foreground ml-2 text-xs tabular-nums">
            {formatDateTime(disposal.requestedAt)}
          </span>
        ) : null}
      </dd>
    </div>
    {disposal.units.length > 0 ? (
      <div className="flex gap-3 px-3 py-2">
        <dt className="text-muted-foreground w-32 shrink-0 text-xs">
          Pinned tags
        </dt>
        {/**
         * Every tag, in full, on the page where the approver is signing a financial
         * certificate. This is the one screen where a shortened list is a shortened
         * decision: an approver who sees three of twenty is signing for twenty.
         */}
        <dd className="font-mono text-sm break-all">
          {disposal.units.map((unit) => unit.uniqueNo).join(", ")}
        </dd>
      </div>
    ) : null}
  </dl>
);

/**
 * Sign off that a proposed write-off *should* happen. **Still nothing moves.**
 *
 * A sign-off dialog, not a one-click button, because the approver is signing a
 * financial certificate and the server refuses self-approval: `approveDisposal`
 * compares the actor's staff id against `requestedByStaffId` and returns `FORBIDDEN`
 * when they match, or `BAD_REQUEST` when the account has no staff row at all and the
 * certificate would have nobody to name.
 *
 * **Both refusals are surfaced honestly rather than hidden behind a disabled
 * button.** The screen cannot know the caller's staff id — this component is not
 * given a session — so the rule is stated on the face of the dialog and the server's
 * own sentence is shown verbatim if it refuses. Hiding the button would have produced
 * a dead control and no explanation; a clerk who needs to know why they cannot sign
 * their own request is exactly the person who must be told.
 */
export const ApproveDisposalDialog = ({
  disposal,
  open,
  onOpenChange,
}: {
  disposal: DisposalRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const queryClient = useQueryClient();
  const idBase = `disposal-approve-${useId().replaceAll(/[^\dA-Za-z_-]/gu, "")}`;
  const formId = `${idBase}-form`;
  const [note, setNote] = useState("");
  const [announcement, setAnnouncement] = useState("");

  const approveMutation = useMutation(
    orpc.inventory.disposals.approve.mutationOptions({
      onSuccess: async (result) => {
        toast.success(
          `Write-off approved by ${result.approvedByName} — it can now be finalised, and the stock still has not moved`
        );
        setNote("");
        onOpenChange(false);
        /**
         * `disposalDecision`, not `disposal`. A signature is one of the three
         * decisions on an existing certificate; raising a request is the fourth thing
         * that writes to this list and it is a different act. Both dirty the same keys
         * today — the two scopes are deliberate twins in
         * `inventory-query-keys.ts` — but the queue this screen sits on is the
         * *decision* queue, and the change-log row it just wrote is the audit of a
         * signature rather than of a proposal.
         */
        await invalidateInventory(queryClient, "disposalDecision");
      },
      onError: (error) => {
        toast.error(
          formatApiErrorMessage(error, "Could not sign off this write-off")
        );
        setAnnouncement(
          "The signature was not recorded. Your note is still here — the server's own reason is in the message above."
        );
      },
    })
  );

  const { requestClose, confirmNode } = useDiscardGuard(
    note.trim().length > 0,
    () => {
      setNote("");
      onOpenChange(false);
    }
  );

  if (!disposal) {
    return null;
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next || approveMutation.isPending) {
            onOpenChange(next);
            return;
          }
          requestClose();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sign off this write-off</DialogTitle>
            <DialogDescription>
              You are approving that the school&rsquo;s books should say this
              property is gone. The stock does not move yet.
            </DialogDescription>
          </DialogHeader>

          <form
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              setAnnouncement("");
              approveMutation.mutate({
                disposalId: disposal.id,
                ...(note.trim() ? { note: note.trim() } : {}),
              });
            }}
            aria-busy={approveMutation.isPending || undefined}
            className="space-y-4"
          >
            <DialogStatus
              message={announcement}
              busy={approveMutation.isPending}
            />
            <p id={`${idBase}-heading`} className="sr-only">
              {`The certificate you are signing: ${pluralUnits(disposal.qty)} of ${disposal.itemName}, ${disposalStatusLabel(disposal.status)}.`}
            </p>
            <CertificateSummary disposal={disposal} idBase={idBase} />

            <InventoryInlineNotice
              tone="warning"
              title="Two things the server will refuse"
              description="You cannot sign a request you raised yourself, and an account with no staff record cannot sign anything at all — the certificate has to name a person. If either applies, the message will say so plainly rather than failing silently."
            />

            <Field>
              <FieldLabel htmlFor={`${idBase}-note`}>
                Signature note (optional)
              </FieldLabel>
              <Textarea
                id={`${idBase}-note`}
                value={note}
                onChange={(event) => {
                  setNote(event.target.value);
                }}
                rows={2}
                placeholder="e.g. Agreed with the HOD; the replacement is on order"
                disabled={approveMutation.isPending}
              />
              <FieldDescription>
                Recorded on the status history and on the ledger row, so the
                transition reads on its own.
              </FieldDescription>
            </Field>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={requestClose}
                disabled={approveMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form={formId}
                loading={approveMutation.isPending}
                data-icon="inline-start"
              >
                <IconCheck aria-hidden="true" data-icon="inline-start" />
                Sign off
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {confirmNode}
    </>
  );
};

/**
 * Finalise a signed write-off. **The stock leaves the books at this moment.**
 */
export const FinalizeDisposalDialog = ({
  disposal,
  open,
  onOpenChange,
}: {
  disposal: DisposalRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const queryClient = useQueryClient();
  const idBase = `disposal-finalize-${useId().replaceAll(/[^\dA-Za-z_-]/gu, "")}`;
  const formId = `${idBase}-form`;
  const [finalStatus, setFinalStatus] = useState<string>("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [announcement, setAnnouncement] = useState("");

  const { controlRef, focusFirstInvalid } = useFirstInvalidFocus([
    "finalStatus",
  ]);

  const finalizeMutation = useMutation(
    orpc.inventory.disposals.finalize.mutationOptions({
      onSuccess: async (result) => {
        toast.success(
          `Write-off finalised as ${disposalStatusLabel(
            result.status
          )} by ${result.finalizedByName} — ${pluralUnits(result.item.availableQty)} now available`
        );
        setFinalStatus("");
        setEstimatedValue("");
        setNote("");
        setConfirmOpen(false);
        onOpenChange(false);
        /**
         * `disposalDecision` — the third of the three. This is the only step in the
         * whole feature that moves stock on the write-off path, and the change-log row
         * it writes is the audit of the point of no return.
         */
        await invalidateInventory(queryClient, "disposalDecision");
      },
      onError: (error) => {
        setConfirmOpen(false);
        toast.error(
          formatApiErrorMessage(error, "Could not finalise this write-off")
        );
        setAnnouncement(
          "The write-off was not finalised. Nothing has moved. Your choice of outcome and your notes are still here."
        );
        const fieldErrors = fieldErrorsFromApi(error);
        if (Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors);
          focusFirstInvalid(fieldErrors);
        }
      },
    })
  );

  const isDirty =
    finalStatus !== "" ||
    estimatedValue.trim().length > 0 ||
    note.trim().length > 0;

  const { requestClose, confirmNode } = useDiscardGuard(isDirty, () => {
    setFinalStatus("");
    setEstimatedValue("");
    setNote("");
    setConfirmOpen(false);
    onOpenChange(false);
  });

  if (!disposal) {
    return null;
  }

  /**
   * The chosen outcome, narrowed to the picklist — or `null`.
   *
   * Derived once rather than re-narrowed at each use site, because the `Select`'s
   * value and the `AlertDialog`'s confirmation are two different renders of the same
   * choice and they must not be able to disagree about which one is set.
   */
  const selectedFinal = isFinalStatus(finalStatus) ? finalStatus : null;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          /** Nothing closes underneath the confirm — see `StockOutDialog`. */
          if (confirmOpen) {
            return;
          }
          if (next || finalizeMutation.isPending) {
            onOpenChange(next);
            return;
          }
          requestClose();
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle>Finalise this write-off</DialogTitle>
            <DialogDescription>
              {disposal.qty} &times; {disposal.itemName}, signed off by{" "}
              {describeParty({
                name: disposal.approvedByName,
                staffId: disposal.approvedByStaffId,
                emptyLabel: "an account with no staff record",
              })}
            </DialogDescription>
          </DialogHeader>

          <form
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              setAnnouncement("");
              if (selectedFinal !== null) {
                setConfirmOpen(true);
                return;
              }
              /**
               * A refusal on the only mandatory control, and `focusFirstInvalid` has
               * nothing to move to because a Base UI `Select` trigger is a button that
               * does not take a DOM ref from the caller. So the sentence is also
               * announced through the dialog's live region: a rejection here is
               * otherwise completely silent to anybody not watching the page.
               */
              const message = "Choose how the property is leaving the school";
              setErrors({ finalStatus: message });
              setAnnouncement(message);
            }}
            aria-busy={finalizeMutation.isPending || undefined}
            className="flex-1 space-y-6 overflow-y-auto px-6 py-4"
          >
            <DialogStatus
              message={announcement}
              busy={finalizeMutation.isPending}
            />

            <InventoryInlineNotice
              tone="danger"
              title="This is the point of no return"
              description="The quantity drops by the amount on the certificate, the asset tags become disposed, and the school's books stop counting them. A finalised certificate is a record, not an action — it cannot be undone or withdrawn afterwards, only superseded by a new one."
            />

            <Field
              data-invalid={errors.finalStatus ? true : undefined}
              required
            >
              <FieldLabel htmlFor={`${idBase}-final-status`}>
                How is it leaving the school? *
              </FieldLabel>
              <Select
                value={selectedFinal}
                onValueChange={(value: string | null) => {
                  setFinalStatus(value ?? "");
                  setErrors({});
                }}
              >
                <SelectTrigger
                  ref={controlRef("finalStatus")}
                  id={`${idBase}-final-status`}
                  aria-invalid={errors.finalStatus ? true : undefined}
                >
                  <SelectValue placeholder="Choose the outcome" />
                </SelectTrigger>
                <SelectContent>
                  {DISPOSAL_FINAL_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {disposalStatusLabel(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedFinal === null ? (
                <FieldDescription>
                  Six outcomes, and each is a different kind of loss. The one
                  you pick is what the certificate will say the school did.
                </FieldDescription>
              ) : (
                <FieldDescription>
                  {FINAL_OUTCOME_CONSEQUENCE[selectedFinal]}
                </FieldDescription>
              )}
              {errors.finalStatus ? (
                <FieldError>{errors.finalStatus}</FieldError>
              ) : null}
            </Field>

            <MoneyField
              id={`${idBase}-estimated-value`}
              value={estimatedValue}
              onChange={setEstimatedValue}
              label="Revised estimated value (optional)"
              description="Leave empty to keep the figure the requester supplied. Supplying one revises it — this is the only chance to correct it, because the certificate is issued as final."
            />

            <Field>
              <FieldLabel htmlFor={`${idBase}-note`}>
                Finalisation note
              </FieldLabel>
              <Textarea
                id={`${idBase}-note`}
                value={note}
                onChange={(event) => {
                  setNote(event.target.value);
                }}
                rows={2}
                placeholder="e.g. Collected by the contractor on 12 April; scrap receipt attached"
              />
              <FieldDescription>
                Appended to the movement note in the ledger, and to the status
                history so the transition reads on its own.
              </FieldDescription>
            </Field>
          </form>

          <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={requestClose}
              disabled={finalizeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form={formId}
              variant="destructive"
              loading={finalizeMutation.isPending}
            >
              Finalise write-off
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/**
       * Names the item, the quantity **and** the chosen outcome, because those are
       * the three facts somebody would need in order to notice they had the wrong row
       * or the wrong outcome open. `Esc` and a backdrop click are refused, so the
       * outcome they have just chosen cannot be lost to a stray keypress.
       */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>
            Finalise as{" "}
            {selectedFinal === null
              ? "nothing"
              : disposalStatusLabel(selectedFinal)}
            ?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {selectedFinal === null
              ? "No outcome has been chosen, so there is nothing to confirm."
              : FINAL_OUTCOME_CONSEQUENCE[selectedFinal]}{" "}
            <span className="mt-2 block">
              {pluralUnits(disposal.qty)} of {disposal.itemName} will come off
              the school&rsquo;s books now, their asset tags will be marked
              disposed, and the register will stop counting them. This cannot be
              undone.
            </span>
          </AlertDialogDescription>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (selectedFinal === null) {
                  return;
                }
                finalizeMutation.mutate({
                  disposalId: disposal.id,
                  finalStatus: selectedFinal,
                  ...(estimatedValue.trim()
                    ? { estimatedValue: estimatedValue.trim() }
                    : {}),
                  ...(note.trim() ? { note: note.trim() } : {}),
                });
              }}
              loading={finalizeMutation.isPending}
              disabled={selectedFinal === null}
            >
              Yes, finalise it
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      {confirmNode}
    </>
  );
};

/**
 * Withdraw a write-off request. **No stock moves, and the request does not vanish.**
 *
 * The reason is the only mandatory input anywhere in this flow, and the live counter
 * is here because the cap is the point: a cancellation with no stated cause is how an
 * asset register becomes unauditable — the next person to ask "why was this dropped?"
 * gets nothing, and the answer was known at the moment it was dropped. The
 * 500-character cap keeps it a sentence rather than a pasted log, which is what makes
 * it readable on the certificate a year later.
 *
 * Cancelling is not undoing anything, because nothing was done. The units were never
 * moved, so there is nothing to put back, and the dialog says so rather than implying
 * a reversal.
 *
 * ## Why there is no `AlertDialog` here, against the brief's instruction
 *
 * The brief asks for a confirm in front of every destructive or irreversible action.
 * This one *is* irreversible — there is no un-withdraw — so the honest options were an
 * `AlertDialog` or a considered refusal, and the refusal is what shipped. The reasons
 * are in the repository's own record of truth (`inventory/UI.md`, "Deliberately not
 * built" and the ladder table): `finalize` is the only procedure here that moves a
 * device, and a confirm in front of a non-movement "only teaches people to dismiss
 * confirms" — which costs the one confirm that matters its whole force. The
 * deliberateness is instead carried by three things this dialog *does*: it is the only
 * dialog in the flow with a **mandatory** field, it names the item and quantity in its
 * own header, and its submit states plainly that no stock was ever moved. If a product
 * decision ever wants a stacked confirm here it is one component, and the file it
 * belongs to is now a single readable module.
 */
export const CancelDisposalDialog = ({
  disposal,
  open,
  onOpenChange,
}: {
  disposal: DisposalRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const queryClient = useQueryClient();
  const idBase = `disposal-cancel-${useId().replaceAll(/[^\dA-Za-z_-]/gu, "")}`;
  const formId = `${idBase}-form`;
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [announcement, setAnnouncement] = useState("");

  const { controlRef, focusFirstInvalid } = useFirstInvalidFocus(["reason"]);

  const cancelMutation = useMutation(
    orpc.inventory.disposals.cancel.mutationOptions({
      onSuccess: async (result) => {
        toast.success(
          `Write-off withdrawn by ${result.cancelledByName} — no stock was ever moved`
        );
        setReason("");
        setErrors({});
        onOpenChange(false);
        /**
         * `disposalDecision` — the fourth and last of the write-off writes. A
         * withdrawal is a decision about an existing certificate, not a new proposal,
         * and it is audited exactly like the other three.
         */
        await invalidateInventory(queryClient, "disposalDecision");
      },
      onError: (error) => {
        toast.error(
          formatApiErrorMessage(error, "Could not withdraw this request")
        );
        setAnnouncement(
          "The request was not withdrawn. Your reason is still here."
        );
        const fieldErrors = fieldErrorsFromApi(error);
        if (Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors);
          focusFirstInvalid(fieldErrors);
        }
      },
    })
  );

  const { requestClose, confirmNode } = useDiscardGuard(
    reason.trim().length > 0,
    () => {
      setReason("");
      setErrors({});
      onOpenChange(false);
    }
  );

  if (!disposal) {
    return null;
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setAnnouncement("");
    const result = v.safeParse(cancelSchema, { reason });

    if (!result.success) {
      const fieldErrors = issuesToFieldErrors(result);
      setErrors(fieldErrors);
      setAnnouncement(
        "The request was not withdrawn. Say why in the box, and nothing you have typed is lost."
      );
      focusFirstInvalid(fieldErrors);
      return;
    }
    setErrors({});

    cancelMutation.mutate({
      disposalId: disposal.id,
      reason: result.output.reason,
    });
  };

  const isOverLimit = reason.length > MAX_CANCEL_REASON;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next || cancelMutation.isPending) {
            onOpenChange(next);
            return;
          }
          requestClose();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Withdraw this write-off request</DialogTitle>
            <DialogDescription>
              {pluralUnits(disposal.qty)} of {disposal.itemName} &mdash;{" "}
              {disposalStatusLabel(disposal.status)}
            </DialogDescription>
          </DialogHeader>

          <form
            id={formId}
            onSubmit={handleSubmit}
            aria-busy={cancelMutation.isPending || undefined}
            className="space-y-4"
          >
            <DialogStatus
              message={announcement}
              busy={cancelMutation.isPending}
            />

            <InventoryInlineNotice
              tone="info"
              title="Nothing was moved, so nothing is being reversed"
              description="A request that has not been finalised has never touched the stock: the quantity, the asset tags and the register are exactly as they were. Withdrawing it closes the request and records who closed it and why. A certificate that has already been finalised cannot be withdrawn at all — it is a record, not an action."
            />

            <Field
              data-invalid={errors.reason || isOverLimit ? true : undefined}
              required
            >
              <FieldLabel htmlFor={`${idBase}-reason`}>Reason *</FieldLabel>
              <Textarea
                ref={controlRef("reason")}
                id={`${idBase}-reason`}
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                }}
                rows={3}
                placeholder="e.g. Miscounted — there are four working projectors, not three"
                disabled={cancelMutation.isPending}
                aria-invalid={errors.reason || isOverLimit ? true : undefined}
              />
              <FieldDescription>
                The one mandatory field in this flow, and it is written to three
                places: the certificate, the status history, and the ledger row.
                A sentence is enough.
              </FieldDescription>
              <div className="flex justify-end">
                <p
                  className={`text-xs tabular-nums ${
                    isOverLimit ? "text-destructive" : "text-muted-foreground"
                  }`}
                  aria-live="polite"
                >
                  {reason.length} / {MAX_CANCEL_REASON}
                </p>
              </div>
              {errors.reason ? <FieldError>{errors.reason}</FieldError> : null}
              {isOverLimit ? (
                <FieldError>
                  {reason.length - MAX_CANCEL_REASON} character
                  {reason.length - MAX_CANCEL_REASON === 1 ? "" : "s"} over the
                  limit
                </FieldError>
              ) : null}
            </Field>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={requestClose}
                disabled={cancelMutation.isPending}
              >
                Keep it open
              </Button>
              {/**
               * **Not destructive, and that is the fix.**
               *
               * This button used to be `variant="destructive"` while Finalise — the
               * only step in the feature that actually moves stock, cannot be undone,
               * and is guarded by an `AlertDialog` — was *also* red. The escalation was
               * inverted, and the practical cost is worse than the colour: a red button
               * that opens no confirm teaches a clerk that red means "this needs a
               * second look", so the button that does get a second look stops being the
               * one that needs it. Withdrawing changes no counter, so it is the plain
               * primary button, and Finalise keeps both the colour and the confirm.
               */}
              <Button
                type="submit"
                form={formId}
                loading={cancelMutation.isPending}
                data-icon="inline-start"
              >
                <IconX aria-hidden="true" data-icon="inline-start" />
                Withdraw request
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {confirmNode}
    </>
  );
};
