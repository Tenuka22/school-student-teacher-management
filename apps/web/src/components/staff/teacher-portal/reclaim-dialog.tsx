"use client";

import { inventoryTransferReasonSchema } from "@school-student-teacher-management/db/constants/inventory";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@school-student-teacher-management/ui/components/alert-dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@school-student-teacher-management/ui/components/field";
import { Textarea } from "@school-student-teacher-management/ui/components/textarea";
import { IconArrowBackUp } from "@tabler/icons-react";
import { useRef } from "react";
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
import { ChangePreview } from "@/components/staff/teacher-portal/transfer-ownership-dialog";

/** Matches the 500 the note field has always been given, in the folder and here. */
const NOTE_MAX_LENGTH = 500;

/**
 * What "nobody holds it" is called on this one row, and the right-hand side of the
 * preview below. The page's own predicate for this dialog requires a holder, so the
 * empty case is unreachable from here — it is named rather than left `undefined`
 * because a null printed as a blank claims that nothing is recorded, which is a
 * different sentence from "the store has it".
 */
const IN_STORE = "the store";

interface ReclaimDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItemView | null;
  isPending: boolean;
  /**
   * The reason and the note are the page's, not the dialog's.
   *
   * This is an `AlertDialog` and not a `Dialog`, so there is no `<form>` to own
   * them and no submit button bound to one — the two values are lifted to the page,
   * next to the mutation that sends them, and handed back in. It also means the
   * fields' contents survive a refusal for free: the page does not reset them
   * until the write succeeds, and there is nothing here that would reset them
   * instead.
   */
  reason: string;
  onReasonChange: (reason: string) => void;
  note: string;
  onNoteChange: (note: string) => void;
  /**
   * Resolves only on success. A refusal rejects — the holder handed it back in the
   * meantime, or the item is out on a dated loan, or the caller is not in charge of
   * it — and the page's mutation handler toasts that sentence rather than a generic
   * failure, so this dialog owns no toast of its own.
   */
  onSubmit: (values: {
    reason: TransferReason;
    note?: string;
  }) => Promise<void>;
}

/**
 * "Give me that back."
 *
 * ## Why this one is behind a confirm and the hand-back is not
 *
 * **They are opposite acts, and the page now holds both.** `releaseCustody` is the
 * holder's own voluntary hand-back: it is restorative, it *gives* something back,
 * and a stray click costs a trip to the store. `reclaimCustody` is the owner
 * reaching into a colleague's hands and taking school property out of them, with no
 * consent and no conversation on this screen — one gives, the other takes, and that
 * asymmetry is the whole argument for the ceremony.
 *
 * The hand-back confirm that already exists on this page is there because signing
 * school property away by accident is expensive. This one is here because a
 * colleague's possession of it is being ended by somebody else, and the trail that
 * records it is permanent. So the confirm states the three things a reader has to
 * be told before pressing the button, and each is a fact rather than a reassurance:
 *
 * 1. **The holder loses the item.** Named from the row — this is an act against a
 *    person, and the name is what makes it one.
 * 2. **The owner keeps it.** `reclaimCustody` clears `custodianStaffId` and leaves
 *    `managerStaffId` exactly as it was, so the teacher is *still* the one the
 *    school asks. This is the half an owner most often gets wrong, and it is the
 *    whole difference between "call it back" and "hand it on".
 * 3. **It goes to the permanent trail with the reason given.** Which is why the
 *    reason is asked for here rather than being a formality: a department head can
 *    ask how much equipment owners had to call back, and why.
 *
 * ## And the reason is required, from the first render
 *
 * `reclaimCustody` declares `reason` as a required `inventoryTransferReasonSchema`,
 * and `inventory_custody_history_reason_required` would refuse the
 * `custody_released` row without one anyway, since that change type is not one of
 * the two exempt ones. So the field carries the asterisk, the `aria-required` and
 * the explanation from the first paint, and the confirm button stays shut until a
 * cause is chosen — rather than a warning appearing after the failure it exists to
 * prevent, which is a worse warning than none at all.
 */
export const ReclaimDialog = ({
  open,
  onOpenChange,
  item,
  isPending,
  reason,
  onReasonChange,
  note,
  onNoteChange,
  onSubmit,
}: ReclaimDialogProps) => {
  /**
   * Where focus lands, and why it is the cancel button.
   *
   * Base UI moves focus to the first tabbable element in the popup, which with a
   * reason picker above the footer is the picker. That is a control a teacher who
   * came to read the consequence would tab into expecting the note field, and on a
   * confirm whose destructive action is two keys away the safe option is the one
   * that should hold focus. The same reasoning, and the same shape of answer, as
   * the hand-back confirm already on this page.
   */
  const cancelRef = useRef<HTMLButtonElement>(null);

  /**
   * The write, as an awaited call rather than a chained one.
   *
   * **The one parse in this file, and it is here for the same reason it is in the
   * hand-on dialog:** `TransferReasonField` is a shared field typed
   * `(reason: string) => void`, while `reclaimCustody`'s input is the closed
   * `inventoryTransferReasonSchema` union. The parse is what turns one into the
   * other without a cast, and it also drops an all-spaces note — the server
   * declares `note` as `optional(pipe(string(), minLength(1)))`, so an empty string
   * is not "no note", it is a validation failure on a call-back that otherwise
   * worked.
   *
   * The button is shut while the reason is empty, so the failure branch is
   * unreachable from the keyboard and the mouse alike. It is kept as a guard rather
   * than a non-null assertion because it is the only thing standing between a
   * shared field's `string` and the wire.
   */
  const handleReclaim = async () => {
    const parsed = v.safeParse(inventoryTransferReasonSchema, reason);
    if (!parsed.success) {
      return;
    }

    const trimmed = note.trim();

    try {
      await onSubmit({
        reason: parsed.output,
        ...(trimmed ? { note: trimmed } : {}),
      });
    } catch {
      /*
       * Refused, or the connection dropped mid-write, and both leave the fields
       * alone: the teacher is asked to change *something* after reading the
       * server's sentence rather than to retype the whole thing. The rejection is
       * swallowed because the page's `onError` has already toasted that sentence
       * and these dialogs own no toast — so the outcome is still reported exactly
       * once, and the confirm stays open.
       */
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent initialFocus={cancelRef} className="sm:max-w-md">
        <AlertDialogTitle>
          {item ? `Call ${item.name} back?` : "Call this item back?"}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {item ? (
            <>
              {/*
                The holder is named when there is a person to name, and the
                condition is `custodianName` rather than `custodianStaffId` on
                purpose. Both can be set while the name is null — the four
                `*_staff_id` columns on the history are `set null` rather than
                cascaded when a staff record goes — and the alternative sentence
                was "No longer on the staff roll stops holding it", which is a
                garbled clause about somebody who no longer exists. The third case,
                a genuinely empty pointer, is unreachable from this page
                (`custody.lent` requires a holder) and the same sentence covers it
                rather than leaving a hole in the paragraph.
              */}
              {item.custodianName ? (
                <>
                  <PartyName
                    name={item.custodianName}
                    staffId={item.custodianStaffId}
                    emptyLabel="nobody"
                  />{" "}
                  stops holding it.
                </>
              ) : (
                <>Whoever is holding it stops holding it.</>
              )}{" "}
              Nobody is asked first, and the register has no way to record that
              they were not asked — this is your authority as the person in
              charge, used directly.{" "}
              <span className="text-foreground font-medium">
                You stay in charge of it.
              </span>{" "}
              Nothing is given to anybody, the store&rsquo;s count does not
              change and the item itself does not move — the register was saying
              one thing and you are saying another, and you are the person it
              belongs to. All of it is written to this item&rsquo;s permanent
              history with your name, the time, and the reason below.
            </>
          ) : (
            "The holder loses the item, you stay in charge of it, and the change is written to its permanent history with your name, the time and the reason below."
          )}
        </AlertDialogDescription>

        {/*
          The loan guard is *stated* rather than enforced, and the button stays live.
          `reclaimCustody` refuses an item with units out on a dated loan: the
          physical object the custodian pointer describes is somewhere else, and
          clearing the pointer would assert that somebody is looking after equipment
          that is in fact with a borrower on a due date. It has to come back through
          the return flow, which records the condition it came back in — and that
          assessment can only be given by somebody who has actually held the thing.
          Pre-empting it with a disabled button would hide the one thing the reader
          most needs, which is *why*, so the server's own sentence is shown verbatim
          on refusal instead. The same arrangement, for the same reason, as
          `TakeOrReleaseDialog`'s warning on the release half.
        */}
        {(item?.borrowedQty ?? 0) > 0 ? (
          <InventoryInlineNotice
            tone="warning"
            title="This item may be out on a dated loan"
            description="A call-back is refused while units are away: the loan has to be returned through its own record first, so the return date and the condition it came back in are kept. Go ahead — if that is the case, the server will say so."
          />
        ) : null}

        <FieldSet>
          <FieldGroup>
            <TransferReasonField
              label="Why it is being called back"
              value={reason}
              onChange={onReasonChange}
              // `required` is the component's default and the reason it is passed
              // anyway is visibility: this is the one control on the page whose
              // button below depends on it, and a reader of this call site should
              // not have to open the shared field to learn that.
              required
              description="Required, and written onto this item's history. A report can group call-backs by cause, and this row is what it reads."
            />
            <Field>
              <FieldLabel htmlFor="reclaim-note">Note</FieldLabel>
              <Textarea
                id="reclaim-note"
                rows={2}
                maxLength={NOTE_MAX_LENGTH}
                disabled={isPending}
                value={note}
                placeholder="Optional. Anything they will want to know when they see this on the item's history."
                onChange={(event) => onNoteChange(event.target.value)}
              />
              <FieldDescription>
                Goes onto this item&rsquo;s custody history, permanently, where
                the colleague it was taken from will read it.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </FieldSet>

        {/*
          The before→after, and **the same `ChangePreview` the hand-on dialog uses**
          — a dialog without one is a regression on the best work in the feature,
          and this is the second of the two owner verbs so it is where a third copy
          would have started.

          It is built from the row's **current** `custodianStaffId` and the store,
          which is what the write does to it: `reclaimCustody` sets
          `custodianStaffId: null` and names `managerStaffId` nowhere. So the arrow
          is one pointer, read off the row rather than predicted from the procedure
          name, and the half of the sentence that does *not* change is in the
          footnote — where the confirm's own paragraph has already said it in
          prose, and where a reader of the record rather than of the screen needs
          it.

          The footnote carries the one fact with nowhere else to live, and it is
          addressed to somebody this dialog will never meet: a reader of the counter
          ledger finds a `custody_released` row with identical counters on both
          sides and no movement, and the natural reading of that is a missed entry.
          It is not — no unit crossed a boundary, because none of them did. Stating
          it here is cheaper than a note in the folder the ledger lives in.
        */}
        {item ? (
          <ChangePreview
            headline="Who is holding it"
            from={describeParty({
              name: item.custodianName,
              staffId: item.custodianStaffId,
              emptyLabel: IN_STORE,
            })}
            to={IN_STORE}
            footnote="In charge of it stays with you — that is the whole difference between calling it back and handing it on, and the record shows the same owner on both sides of the change. Nothing is counted and nothing moves: the ledger row will show a change of custody with no counter movement, and that is correct rather than a missing update, because the item was in the building the whole time and only the record of who had it was wrong."
          />
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel ref={cancelRef} disabled={isPending}>
            Leave it with them
          </AlertDialogCancel>
          {/*
            `AlertDialogAction` is a plain `Button` and **not** the primitive's
            `Close`, so pressing it does not dismiss the dialog — the page closes it
            on success and leaves it standing on a refusal, which is the behaviour a
            form needs and the reason the two values were lifted to the page.
            `ClearManagerDialog` in the inventory folder relies on the same property.
          */}
          <AlertDialogAction
            onClick={() => {
              void handleReclaim();
            }}
            // See the note on this component: the reason is a closed picklist with a
            // database CHECK behind it, so an empty submit is a refusal the reader
            // can be spared — and the field has been marked required the whole time.
            disabled={isPending || reason === ""}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            <IconArrowBackUp data-icon="inline-start" />
            {isPending ? "Calling it back..." : "Call it back"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
