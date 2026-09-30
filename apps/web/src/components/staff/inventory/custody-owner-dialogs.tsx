"use client";

import {
  inventoryTransferReasonLabel,
  inventoryTransferReasonSchema,
} from "@school-student-teacher-management/db/constants/inventory";
import { inventoryItemIdSchema } from "@school-student-teacher-management/db/schema/inventory";
import { staffIdSchema } from "@school-student-teacher-management/db/schema/staff";
/**
 * The two verbs a **teacher** owns: hand the whole responsibility on, and demand
 * an item back off a colleague.
 *
 * ## Why these two are in one file and the other three are not
 *
 * They are the pair the `manageOwn` grant exists for, they own their own
 * mutations rather than taking an `onSubmit` prop, and they are the two a
 * teacher's own page reaches as well as the register. Everything else about them
 * is the same shared chrome from `custody-form.tsx`.
 *
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
 * - **`assignManager`** — *the record is being corrected by the office.* Gated on
 *   `update`, which is administrator-only, and its `newManagerStaffId` is
 *   required: neither verb can clear the slot, because the owner column is
 *   `NOT NULL` and has been required since registration.
 *
 * **Two verbs, one column, on purpose, and a single input could not have been one
 * dialog.** One moves accountability with custody in the same write and the other
 * corrects accountability alone, and the caller has to mean one or the other
 * rather than whichever a shared form happened to be set to. Here the server
 * refuses to let ambiguity through on either side: `newOwnerStaffId` is
 * **required and non-nullable**, and that is what lets this dialog's picker be an
 * ordinary `string | null` with no third state to guard. `null` here can only
 * mean *nobody chosen yet*, nothing is sent until a successor exists, and there is
 * no destructive default to be three clicks away from.
 *
 * The two are also two different **authorities**. One is a grant to the owner, the
 * other the administrator's. Folding them together would either hand every teacher
 * the power to appoint an owner, or take the hand-on away from the one person who
 * is allowed to make it — and the hand-on is the whole reason `manageOwn` exists.
 */
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
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
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@school-student-teacher-management/ui/components/field";
import {
  IconAlertTriangle,
  IconUserMinus,
  IconUserPlus,
} from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import {
  CHOSEN_STAFF,
  ChangePreview,
  CurrentHolderBadge,
  CurrentManagerBadge,
  CustodyDialogFrame,
  CustodyNoteField,
  NO_MANAGER,
  focusFirstInvalidField,
  issuesToErrors,
  ownershipSchema,
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
  invalidateInventory,
} from "@/components/staff/inventory/shared";
import { useDiscardGuard } from "@/components/staff/inventory/stock-form-helpers";
import { formatApiErrorMessage, validationFieldErrors } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

export interface TransferOwnershipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItemView | null;
  /**
   * What the server wrote, so whatever sits behind this dialog stops showing the
   * row as it was. The register hands a dialog a *snapshot* of the row it was
   * opened from, and a snapshot is stale the instant the write lands — which would
   * leave the custody sheet behind it offering to call an item back from a holder
   * the write has already moved on.
   */
  onRecorded: (owner: { staffId: string; name: string | null }) => void;
}

/** Both destructive actions here and in the reclaim keep a fixed box on press. */
const ACTION_WIDTH = "min-w-48";

/**
 * The preview for every outcome: nobody chosen yet, the successor is already the
 * owner, and the hand-on itself — with the holder moving onto the successor,
 * staying put because they already are the successor, or absent from the record.
 *
 * Returned as `ChangePreviewProps` so the states that record nothing cannot be
 * rendered as a move — the union's own enforcement, exactly as
 * `buildManagerPreview` uses it. A hand-on drawn before a successor has been picked
 * would describe a state the register is already in.
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
  const holderId = item?.custodianStaffId ?? null;

  if (successorId === null) {
    return {
      headline: "Nothing will be written",
      unchanged: currentOwner
        ? `Accountability is unchanged: ${currentOwner} stays the person the school asks about this item.`
        : "Accountability is unchanged: this item still has nobody in charge of it.",
      footnote:
        "This dialog hands the ownership on, so while nobody is chosen nothing is sent to the server and no history row is appended. Choose somebody above to hand it on, or close the dialog and leave the item exactly as it is.",
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

  const movesHolder = holderId !== successorId;

  if (holder && movesHolder) {
    return {
      headline: "The person the school asks becomes",
      from,
      to,
      footnote: `${from} stops being the person the school asks about this item and ${to} takes it on, and that is the whole of what changes hands. The same write moves the holder onto ${to}: ${holder} is recorded as no longer holding it — if the item is physically in their hands, handing it over stays their own deliberate act, not a side effect of somebody else's paperwork. A history row is appended for each pointer that moved, and no counter moves: nothing was counted, because nothing changed hands.`,
    };
  }

  if (holder) {
    return {
      headline: "The person the school asks becomes",
      from,
      to,
      footnote: `${from} stops being the person the school asks about this item and ${to} takes it on, and that is the whole of what changes hands. The holder does not move — ${holder} already holds this item. One row is appended to this item's history, for the owner change, and no counter moves: nothing was counted, because nothing changed hands.`,
    };
  }

  return {
    headline: "The person the school asks becomes",
    from,
    to,
    footnote: `${from} stops being the person the school asks about this item and ${to} takes it on. Nobody is recorded as holding it, so ${to} becomes the recorded holder as well — the trail notes that alongside the owner change. No counter moves: nothing was counted, because nothing changed hands.`,
  };
};

/**
 * Hand the item the caller is answerable for to somebody else, permanently.
 *
 * **Reached from the custody history sheet and the register's row menu, not from
 * the item form.** `updateItem` refuses `managerStaffId` precisely because the
 * history row is the record of it, so there is no field to edit and no "manager"
 * dropdown here that could be saved by accident. Everything this dialog writes
 * lands on the permanent trail with a cause, and the two consequences that are not
 * obvious — who answers for the item afterwards, and the fact that the current
 * holder is moved onto the successor as part of the same write — are both on the
 * face of the form before the button is pressed.
 *
 * **The reason is required from the first render, never as a submit-time error.**
 * `transferOwnership` declares `reason` as a required
 * `inventoryTransferReasonSchema`, and the database CHECK behind it
 * (`inventory_custody_history_reason_required`) refuses this row without one:
 * `manager_changed` is not one of the two exempt change types, so a hand-on with
 * no cause cannot be written at all.
 *
 * **Two server refusals are stated in the server's own words, and neither is
 * turned into a disabled button.**
 *
 * - *Out on a dated loan.* The units are with a borrower, not with the custodian
 *   pointer, and the return flow is what records the condition they came back in.
 *   The notice says so and the button stays enabled: a refusal the user cannot act
 *   on is exactly the thing this notice prevents.
 * - *Neither the owner nor a leadership seat.* That is a property of the
 *   **caller** — this register is admin-only and the seeded leadership accounts
 *   hold their authority with no staff row at all — so the browser cannot know it,
 *   and a disabled button with no explanation is the failure mode. The rule is
 *   stated and the server's own sentence is quoted next to it.
 */
export const TransferOwnershipDialog = ({
  open,
  onOpenChange,
  item,
  onRecorded,
}: TransferOwnershipDialogProps) => {
  const queryClient = useQueryClient();
  const formId = `${useFormIdBase()}-form`;
  const formRef = useRef<HTMLFormElement>(null);
  const [successorId, setSuccessorId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const successorName = usePartyName(successorId);

  const currentOwnerId = item?.managerStaffId ?? null;
  const isNoop = successorId !== null && successorId === currentOwnerId;
  const preview = buildOwnershipPreview(successorId, successorName, item);

  const isDirty =
    successorId !== null || reason !== "" || note.trim().length > 0;

  const reset = () => {
    setSuccessorId(null);
    setReason("");
    setNote("");
    setErrors({});
  };

  const { requestClose, confirmNode } = useDiscardGuard(isDirty, () => {
    reset();
    onOpenChange(false);
  });

  /**
   * The write, its toast and its invalidation, owned here rather than handed up to
   * the page.
   *
   * The three older dialogs take an `onSubmit` prop because their page already
   * owned four mutations for them; these two are reached from a sheet, and a sheet
   * is not the place to own a query client. The split of responsibilities is the
   * one the rest of the feature uses: **`onError` owns the toast** — it is the
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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!item || isPending) {
      return;
    }

    const result = v.safeParse(ownershipSchema, {
      newOwnerStaffId: successorId ?? "",
      reason,
      note,
    });

    if (!result.success) {
      setErrors(issuesToErrors<string>(result.issues));
      focusFirstInvalidField(formRef.current);
      return;
    }

    setErrors({});

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
      setErrors(validationFieldErrors<string>(error));
      focusFirstInvalidField(formRef.current);
    }
  };

  return (
    <>
      <CustodyDialogFrame
        busyLabel="Handing on the ownership. The reason and note stay on screen if the server refuses it."
        description={
          item ? (
            <>
              {item.name}{" "}
              <span className="font-mono text-xs">({item.sku})</span> — this
              makes one member of staff the person the school asks about this
              item, and stops asking you
            </>
          ) : (
            "Hand the item on to another member of staff, permanently"
          )
        }
        formId={formId}
        formRef={formRef}
        isPending={isPending}
        onOpenChange={(next) => {
          if (next || isPending) {
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
        submitIcon={<IconUserPlus data-icon="inline-start" />}
        submitLabel="Hand on the ownership"
        title="Hand on the ownership"
      >
        <FieldSet>
          <FieldLegend>Accountability</FieldLegend>
          <FieldGroup>
            {/*
              The register's own badge, under the register's own wording. It is the
              same column this dialog calls "the owner", and reusing it is the point:
              two badges saying the same fact in two vocabularies is how a register
              starts disagreeing with itself.
            */}
            <CurrentManagerBadge item={item} />

            <StaffComboboxField
              description="The member of staff who becomes the person the school is answerable to about this item. Only members of staff who are still employed are offered, which is the same list the server accepts."
              disabled={isPending}
              error={errors.newOwnerStaffId}
              label="Hand it on to"
              onChange={(next) => {
                setSuccessorId(next);
                setErrors((previous) => ({
                  ...previous,
                  newOwnerStaffId: undefined,
                }));
              }}
              placeholder="Search for the member of staff taking it on..."
              value={successorId}
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
              rather than a line in the footnote: the write moves the current
              holder onto the successor in the same transaction.
              `transfer-ownership.ts` argues it at length — a record reading "X
              owns it, Y is holding it" straight after the ownership changed hands
              is a data-entry slip far more often than an intent — and the user
              has to be told before they press the button, because afterwards it
              is on the register whether they expected it or not. Skipped when
              the successor already holds it, because then nothing about the
              holder changes and the notice would be a warning about nothing.
            */}
            {item &&
            item.custodianStaffId !== null &&
            item.custodianStaffId !== successorId ? (
              <InventoryInlineNotice
                tone="info"
                title="This also moves the current holder"
                description={`${item.custodianName ?? "The current holder"} is recorded as no longer holding it — the register will report ${successorName ?? CHOSEN_STAFF} as the holder instead, in the same transaction and on the same reason. If the item is physically in their hands, that is a record they make themselves — a hand-on is not a hand-back, and it does not fetch anything from anybody's desk.`}
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
              description="Required on every hand-on, and a report of who passed what on can only be built from it."
              error={errors.reason}
              onChange={(next) => {
                setReason(next);
                setErrors((previous) => ({ ...previous, reason: undefined }));
              }}
              value={reason}
            />
            <CustodyNoteField
              description="Both land on the same history row, and only the sentence survives a later question that turns out to be about one particular handover."
              disabled={isPending}
              error={errors.note}
              onChange={(next) => {
                setNote(next);
                setErrors((previous) => ({ ...previous, note: undefined }));
              }}
              placeholder="Optional. Why the responsibility is moving — they are taking over the lab, they are on maternity cover from March."
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

export interface ReclaimCustodyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItemView | null;
  /**
   * Who holds it now, from the server's own row, so whatever sits behind this
   * dialog stops showing the holder it no longer has.
   *
   * **The pair is the person in charge.** `reclaim-custody.ts` returns
   * `custodianStaffId` and `custodianName` set to the owner — the whole point of
   * a call-back is that the person answerable for the item becomes the person
   * recorded as holding it — and passes `previousCustodianName` separately for
   * the toast. A caller holding a snapshot wants this pair: a name with the
   * pointer behind it, which is the combination this folder insists on. The
   * previous holder's name alone would be exactly what must never be rendered —
   * a name beside a pointer that no longer says what the name says.
   */
  onRecorded: (holder: { staffId: string; name: string | null }) => void;
}

/**
 * The confirmation in front of a reclaim, and the asymmetry it creates on purpose.
 *
 * **Handing an item *back* gets no confirm; calling one *in* does.** Both write a
 * `custody_released` row and both move the same pointer, so the difference is not
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
 * item, the person in charge ends up holding it, and the row is permanent. "You
 * keep it" is the half that stops a reader assuming a reclaim is a handover in the
 * other direction — it is not, and the server does not touch `managerStaffId` at
 * all. It also says what the register will now claim about where the item *is*:
 * with the person in charge, not "in the store".
 *
 * **`AlertDialog` refuses `Esc` and the backdrop by default** — deliberately, for
 * a destructive confirm that must not be dismissed by accident — and the
 * half-typed reason behind it is exactly the work `Esc` must not destroy; the
 * `useDiscardGuard` on the form behind this covers the same ground for the dialog
 * itself.
 */
const ReclaimConfirmDialog = ({
  isOpen,
  isPending,
  itemName,
  holder,
  owner,
  reason,
  note,
  onCancel,
  onConfirm,
}: {
  isOpen: boolean;
  isPending: boolean;
  itemName: string;
  holder: string | null;
  owner: string | null;
  reason: string;
  note: string;
  onCancel: () => void;
  onConfirm: () => void;
}) => (
  <AlertDialog
    open={isOpen}
    onOpenChange={(next) => {
      if (!next && !isPending) {
        onCancel();
      }
    }}
  >
    <AlertDialogContent className="sm:max-w-md">
      <span aria-hidden="true" className="text-destructive flex">
        <IconAlertTriangle className="size-5" />
      </span>
      <AlertDialogTitle>
        {holder
          ? `Call ${itemName} back from ${holder}?`
          : `Call ${itemName} back?`}
      </AlertDialogTitle>
      <AlertDialogDescription>
        {holder ? `${holder} will no longer be recorded as holding it. ` : ""}
        {owner
          ? `${owner} becomes the recorded holder, and the ownership does not move — ${owner} is still the person the school asks about it.`
          : "The ownership does not move, and this item still has nobody in charge of it — it is not a hand-on, and it does not appoint anybody."}{" "}
        It is written to the permanent trail as a{" "}
        {inventoryTransferReasonLabel(reason)} row
        {note ? ", with your note," : ""} and a trail row is not editable from
        here. Nothing in this fetches the item from anybody&rsquo;s desk — it
        records who is holding it, and the next person to open the register will
        be told it is with {owner ?? "the person in charge"}.
      </AlertDialogDescription>
      <AlertDialogFooter>
        <AlertDialogCancel className={ACTION_WIDTH} disabled={isPending}>
          Leave it with {holder ?? "its holder"}
        </AlertDialogCancel>
        <Button
          type="button"
          variant="destructive"
          className={ACTION_WIDTH}
          loading={isPending}
          onClick={onConfirm}
        >
          Call it back
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

/**
 * The owner demands an item back off the colleague who is holding it.
 *
 * **This is not `releaseCustody`, and the fact that it is not is the reason there
 * are two verbs rather than one with a flag.** `releaseCustody` is the holder's own
 * hand-back: it sits on the narrow `take` grant and is deliberately narrowed in
 * its handler to the person holding the item, so that giving something back is
 * always voluntary. This is the other direction — somebody who is **not** holding
 * the item uses their standing as the person answerable for it to take it back.
 *
 * **Only `custodianStaffId` moves.** `managerStaffId` is not in the server's
 * `set` and saying so here is not pedantry: reclaiming custody is not handing
 * responsibility on, and a dialog that let a reader assume otherwise would be
 * describing a bigger change than the one that happens. The preview carries the
 * same sentence, and the confirm repeats it.
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
  const formId = `${useFormIdBase()}-form`;
  const formRef = useRef<HTMLFormElement>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<CustodyErrors>({});
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const holder = item?.custodianName ?? null;
  const owner = item?.managerName ?? null;
  const isDirty = reason !== "" || note.trim().length > 0;

  const reset = () => {
    setReason("");
    setNote("");
    setErrors({});
    setIsConfirmOpen(false);
  };

  const { requestClose, confirmNode } = useDiscardGuard(isDirty, () => {
    reset();
    onOpenChange(false);
  });

  /*
   * `custody.reclaimCustody`, not `custody.reclaim`. The router key is
   * `reclaimCustody` and the folder's own banner calls the verb "`reclaim`" in
   * prose while exporting it under the procedure's name — the same
   * `transferCustody` → `transfer` / `releaseCustody` → `release` shorthand the
   * group uses elsewhere. The client path is the one that has to compile.
   */
  const reclaimMutation = useMutation(
    orpc.inventory.custody.reclaimCustody.mutationOptions({
      onSuccess: async (result) => {
        /*
         * The server names who had it and who holds it now, so the toast can be
         * the whole outcome. It deliberately does not say the item came back to
         * the store: nothing came back anywhere, and the phrasing that would
         * imply it is the one thing this dialog must not do.
         */
        toast.success(
          `${result.previousCustodianName ?? "The custodian"} no longer holds this item — ${
            result.custodianName ?? owner ?? "the person in charge"
          } is recorded as holding it now, and stays in charge of it`
        );
        setIsConfirmOpen(false);
        onOpenChange(false);
        onRecorded({
          staffId: result.custodianStaffId,
          name: result.custodianName,
        });
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
  const requestConfirm = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!item || isPending) {
      return;
    }

    const result = v.safeParse(reasonAndNoteSchema, { reason, note });
    if (!result.success) {
      setErrors(issuesToErrors<keyof CustodyErrors>(result.issues));
      focusFirstInvalidField(formRef.current);
      return;
    }

    setErrors({});
    setIsConfirmOpen(true);
  };

  const confirmReclaim = async () => {
    if (!item || isPending) {
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
   * call back". The same rule as anywhere else in this folder: a control the
   * server always rejects is not offered, and the panel that would have offered it
   * says so in its place.
   *
   * **`item === null` is the case that used to render nothing at all.** Both doors
   * to this dialog (the history sheet's foot and the register's row menu) hand it a
   * snapshot, and a snapshot that is null while `open` is true produced an *open
   * dialog with no content*: focus trapped somewhere, nothing to read, and no way
   * out but the browser's back button. A named, closable panel is the honest
   * version — the row it was opened from is gone, and saying that is better than
   * a dialog that silently is not there.
   */
  if (!item) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>There is no item to call back</DialogTitle>
            <DialogDescription>
              The row this action was opened from is no longer on the register,
              so there is nothing to write. Close this and pick the item again
              from the register — the item may have been retired, or the
              register re-read while this was open.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  if (item.custodianStaffId === null) {
    return null;
  }

  return (
    <>
      <CustodyDialogFrame
        busyLabel="Calling it back. The reason and note stay on screen if the server refuses it."
        description={
          <>
            {item.name} <span className="font-mono text-xs">({item.sku})</span>{" "}
            — take it back off {holder ?? "its holder"} and record it as held by{" "}
            {owner ?? "the person in charge"}, who stays in charge of it
          </>
        }
        formId={formId}
        formRef={formRef}
        isPending={isPending}
        onOpenChange={(next) => {
          if (next || isPending) {
            onOpenChange(next);
            return;
          }
          requestClose();
        }}
        onRequestClose={requestClose}
        onSubmit={requestConfirm}
        open={open}
        submitIcon={<IconUserMinus data-icon="inline-start" />}
        submitLabel="Call it back"
        title="Call it back from its holder"
      >
        <FieldSet>
          <FieldLegend>Who has it</FieldLegend>
          <FieldGroup>
            <CurrentHolderBadge item={item} />

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
              description="Required, and the closed list of reasons is what lets a report say how much equipment owners had to call back and why."
              error={errors.reason}
              onChange={(next) => {
                setReason(next);
                setErrors((previous) => ({ ...previous, reason: undefined }));
              }}
              value={reason}
            />
            <CustodyNoteField
              disabled={isPending}
              error={errors.note}
              onChange={(next) => {
                setNote(next);
                setErrors((previous) => ({ ...previous, note: undefined }));
              }}
              placeholder="Optional. What you have already arranged with them — it is in the lab cupboard, it was never meant to leave the site."
              rows={3}
              value={note}
            />
          </FieldGroup>
        </FieldSet>

        <ChangePreview
          footnote="You keep the ownership: this is not a hand-on, and nothing about who answers for the item changes. A custody-released row is appended to this item's history with the reason you pick — and the ledger row for it will show no counter movement on either side, because the item never physically moved. That is the record saying the register was corrected, not a missing entry."
          from={holder ?? NO_MANAGER}
          headline="Custody moves"
          to={owner ?? "the person in charge"}
        />
      </CustodyDialogFrame>

      <ReclaimConfirmDialog
        holder={holder}
        isOpen={isConfirmOpen}
        isPending={isPending}
        itemName={item.name}
        note={note.trim()}
        onCancel={() => {
          setIsConfirmOpen(false);
        }}
        onConfirm={() => {
          void confirmReclaim();
        }}
        owner={owner}
        reason={reason}
      />
      {confirmNode}
    </>
  );
};
