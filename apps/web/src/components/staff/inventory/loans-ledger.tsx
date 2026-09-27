"use client";

/**
 * The borrow ledger: every check-out and every check-in, and the return half of the
 * loan lifecycle.
 *
 * ## What the list does not re-sort
 *
 * `listBorrows` orders by `isOverdue DESC, expectedReturnDate ASC, borrowedAt DESC`
 * in SQL, using the same expression as the `isOverdue` column, so the ordering and
 * the badge cannot drift apart. Sorting again in the browser would mean a second
 * implementation of a rule the server already owns, which is the one thing that must
 * not happen to a number a clerk acts on.
 *
 * **There is one borrower filter, not two**, and the reason the request cannot name
 * both is `listBorrowsInput` below.
 *
 * ## Why the return is a popover and not a dialog
 *
 * This is the audit for requirement 7 in the other direction: a return is
 * **restorative, not destructive** — it puts stock back on a shelf, closes a loan,
 * and records a condition. Nothing is lost, nothing is deleted, and the old version
 * of this file said so in its own words while still opening a centred modal.
 *
 * A modal takes the register away from the clerk for the two things a clerk
 * actually needs while recording a return: the row they are returning, and the rows
 * around it. The popover is anchored to the row's own button, so the ledger stays
 * visible and legible behind it, focus is not trapped, and the panel closes on
 * `Esc` with the typed note protected by the same discard guard the dialog had.
 *
 * The contrast with the destructive confirms in `custody-owner-dialogs.tsx` is the
 * point, not an inconsistency: those refuse `Esc` because a reflex destroys an
 * unanswerable question; this one allows it because the work is protected and the
 * action is restorative. `AlertDialog` refuses `Esc` by default, so the difference
 * has to be stated per surface rather than assumed.
 *
 * ## Who, when and why on a loan row
 *
 * A ledger that shows a due date but not the date the kit went out, nor who handed
 * it over, nor who agreed to it, is a list of obligations and not a record. All
 * three are on `BorrowRecord` and all three used to be unrendered, so they now sit
 * under the item: when it went out, which account issued it, and who authorised it.
 */
import type { InferRouterInputs } from "@orpc/server";
import type { AppRouter } from "@school-student-teacher-management/api/routers/index";
import {
  ITEM_CONDITIONS,
  borrowStatusLabel,
  itemConditionLabel,
  itemConditionSchema,
} from "@school-student-teacher-management/db/constants/inventory";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@school-student-teacher-management/ui/components/field";
import { Input } from "@school-student-teacher-management/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@school-student-teacher-management/ui/components/popover";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import { Textarea } from "@school-student-teacher-management/ui/components/textarea";
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconBackpack,
  IconBriefcase,
  IconCamera,
  IconCameraOff,
  IconPlus,
  IconQrcode,
  IconRotateClockwise,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QrScanner from "qr-scanner";
// `?url` is a Vite-specific import suffix returning the asset's URL as the default
// export; the file itself has no ESM exports at all. The directive has to sit on the
// line immediately above the import, so the explanation comes first.
// oxlint-disable-next-line import/default
import QrScannerWorkerPath from "qr-scanner/qr-scanner-worker.min.js?url";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { BorrowDialog } from "@/components/staff/inventory/borrow-dialog";
import {
  focusFirstInvalidField,
  useFormIdBase,
} from "@/components/staff/inventory/custody-form";
import type {
  BorrowRecord,
  ItemCondition,
} from "@/components/staff/inventory/inventory-types";
import type { BorrowerChoice } from "@/components/staff/inventory/shared";
import {
  BorrowerPickerField,
  ConditionBadge,
  InventoryEmptyState,
  InventoryErrorState,
  InventoryInlineNotice,
  InventorySkeleton,
  borrowerReferenceLine,
  describeBorrowerChoice,
  invalidateInventory,
} from "@/components/staff/inventory/shared";
import {
  formatDate,
  formatDateTime,
  issuesToFieldErrors,
  useDiscardGuard,
} from "@/components/staff/inventory/stock-form-helpers";
import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

QrScanner.WORKER_PATH = QrScannerWorkerPath;

/** `listBorrows`'s own default, and its hard ceiling. */
const BORROW_LIST_LIMIT = 200;

/** Same for the four stored conditions, which the return picklist round-trips. */
const isItemCondition = (value: string): value is ItemCondition =>
  (ITEM_CONDITIONS as readonly string[]).includes(value);

/**
 * The label a QR sticker on a cupboard or a shelf actually carries, decoded.
 *
 * The QR encodes a full URL (`{origin}/inventory/{itemId}?u=N`) rather than a bare
 * id, so a phone's own camera app — no scanner in this app at all — can open the
 * item on a browser and show the same page. `export-qr-sheet.ts` builds the payload
 * and the `/inventory/$itemId` route reads it; this is the second reader, and it
 * has to agree with the first or a scan of a valid label is refused for looking
 * like the wrong item.
 *
 * A bare id is also accepted, because a label read off a dead battery or copied out
 * of a spreadsheet is a bare id, and refusing it would be a second thing to learn at
 * a counter.
 */
const ITEM_URL_PATTERN = /\/inventory\/(?<itemId>[^/?#]+)/u;

/** The decoded item id, or `null` when the text is not one of this store's labels. */
const decodeScannedItemId = (decoded: string): string | null => {
  const trimmed = decoded.trim();
  const fromUrl = ITEM_URL_PATTERN.exec(trimmed)?.groups?.itemId;

  if (fromUrl) {
    return decodeURIComponent(fromUrl);
  }

  return trimmed.length > 0 ? trimmed : null;
};

const returnSchema = v.object({
  scannedItemId: v.pipe(
    v.string(),
    v.minLength(
      1,
      "Scan this item's own label so the register knows you have it in hand"
    )
  ),
  returnCondition: itemConditionSchema,
  returnNote: v.optional(v.string()),
});

/**
 * What each return condition actually does to the register, in the clerk's terms.
 *
 * These are consequences, not labels — the condition labels already own the wording
 * of the four values, and re-spelling them here would be a second place for the same
 * words to drift. What the picklist cannot say on its own is why the question is
 * being asked at all: the answer **overwrites** the unit's stored condition, so the
 * next person to open the cupboard is reading what this dialog says.
 *
 * **Every sentence is about the register and the device, never about the holder**,
 * and that is deliberate: what a tag comes back in is a fact about school property,
 * not a judgement on who was trusted with it. So these four lines read exactly the
 * same for a laptop coming back from a member of staff and for one coming back from a
 * pupil, and there is no arm here that would have to be reworded the day a school
 * lends to a child.
 */
const RETURN_CONSEQUENCE: Record<ItemCondition, string> = {
  Good: "Back on the shelf as it left. The tag reads Good, which is what the next clerk will see.",
  Fair: "Usable, with wear. The tag now reads Fair, so the wear is on the record before somebody borrows it again.",
  Damaged:
    "The tag now reads Damaged and stays that way until somebody assesses it again — a write-off is a separate, signed decision.",
  "Under Repair":
    "The tag now reads Under repair, which is a different state from Damaged on purpose: a repaired device comes back into service and a broken one does not. The next person picking this up is being told it does not work.",
};

const RETURN_CONSEQUENCE_TONE: Record<ItemCondition, string> = {
  Good: "text-muted-foreground",
  Fair: "text-muted-foreground",
  Damaged: "text-destructive",
  // `text-warning-ink` and not `text-gold`: `--gold` is 3.87:1 on the page and fails
  // AA for body text, while `--warning-ink` is 6.12:1. The two tokens coexist on
  // purpose — `--gold` still carries the *fills* and rules elsewhere, where it is a
  // surface and not ink.
  "Under Repair": "text-warning-ink",
};

/**
 * The condition each tag is carrying **right now**, read off the loan.
 *
 * `listBorrows` returns the borrow's units with the unit row joined, so the outgoing
 * condition is here before the clerk touches anything.
 *
 * **This is the only moment the outgoing value is knowable.** `returnBorrow`
 * overwrites `inventoryUnit.condition` on every unit it releases, and the column
 * keeps no history: the previous value is not on the unit afterwards, not in the
 * loan's `returnCondition` (which is the *new* one), and not anywhere in the audit
 * log, which records entity rows and not a silent per-unit column write. So a
 * mis-click on "Good" against a tag that read "Damaged" writes a permanent lie with
 * no record of what it replaced — and the clerk is the only person in a position to
 * notice, which is why the current value is stated above the picker.
 *
 * A loan of a bulk item has no tags and therefore no outgoing condition to show;
 * that is stated rather than left as a blank line.
 */
const outgoingConditionLine = (borrow: BorrowRecord | null): string | null => {
  if (!borrow) {
    return null;
  }

  const held = borrow.units.filter((unit) => unit.releasedAt === null);
  if (held.length === 0) {
    return null;
  }

  return held
    .map((unit) => `${unit.uniqueNo} · ${itemConditionLabel(unit.condition)}`)
    .join("  |  ");
};

/**
 * The proof-of-possession step, which is the whole reason this panel exists as a
 * panel and not a row action.
 *
 * ## The `scannedItemId` requirement is the API's, and it is real
 *
 * `returnBorrow` declares `scannedItemId: inventoryItemIdSchema` as a **required**
 * input and then checks `input.scannedItemId !== existingBorrow.itemId` with a
 * `BAD_REQUEST`: "Scan this item's own QR code to confirm you have it in hand before
 * closing the loan". A scan of the projector *next to it* on the shelf would
 * otherwise close a loan for a device that never left the room.
 *
 * **This panel used to not send it at all**, which was a compile error the file
 * carried rather than a bug anybody had noticed — the request could not have been
 * type-correct with the field absent, so the return half of the loan lifecycle was
 * one required argument away from not compiling, and the resolution at the time was
 * a cast. The fix belongs here and not in `packages/api`: the guard is deliberate,
 * it is the server's own sentence, and a schema that let a loan be closed without
 * proof the item is in hand would be a schema over-requiring nothing.
 *
 * ## Why it is per **item** and never per unit
 *
 * Because the label is printed per product line and never per tagged unit. A
 * return of twenty chairs under one bulk line scans the one label on that line,
 * exactly as a single projector scans its one label. The field therefore asks for
 * *this item*, names it, and never asks the clerk to scan twenty things.
 *
 * ## Two ways in, because a counter is not a controlled environment
 *
 * The camera is the intended one and is the default view. The typed field is beside
 * it rather than hidden behind it because a school with one shared tablet, a
 * label behind a locked cupboard door, or a clerk reading the number off a printed
 * sheet all have to be able to finish the job; and the **mismatch is caught before
 * submit** so the clerk is told which item they scanned rather than being refused
 * by the server after filling in the condition.
 */
const ReturnScanProof = ({
  borrow,
  isOpen,
  disabled,
  scannedItemId,
  error,
  onScannedItemIdChange,
}: {
  borrow: BorrowRecord;
  isOpen: boolean;
  disabled: boolean;
  scannedItemId: string | null;
  error: string | undefined;
  onScannedItemIdChange: (value: string) => void;
}) => {
  const inputId = useFormIdBase();
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);

  useEffect(() => {
    if (!isOpen || !isCameraOn || !videoRef.current) {
      return;
    }

    setCameraError(null);
    const video = videoRef.current;
    const scanner = new QrScanner(
      video,
      (result) => {
        const itemId = decodeScannedItemId(result.data);
        if (!itemId) {
          setCameraError(
            "That is not one of this store's item labels. Scan the code printed on the shelf or cupboard."
          );
          return;
        }

        scanner.stop();
        setIsCameraOn(false);
        onScannedItemIdChange(itemId);
      },
      {
        highlightScanRegion: true,
        highlightCodeOutline: true,
        preferredCamera: "environment",
      }
    );

    scannerRef.current = scanner;

    const startScanning = async () => {
      try {
        await scanner.start();
      } catch {
        setCameraError(
          "Could not open the camera — check the browser has permission to use it, or type the label code instead."
        );
      }
    };
    void startScanning();

    return () => {
      scanner.stop();
      scanner.destroy();
      scannerRef.current = null;
    };
  }, [isOpen, isCameraOn, onScannedItemIdChange]);

  const matches = scannedItemId !== null && scannedItemId === borrow.itemId;

  return (
    <FieldSet>
      <FieldLegend>Prove it is in your hands *</FieldLegend>
      <FieldGroup>
        <Field
          data-invalid={Boolean(error) || (scannedItemId !== null && !matches)}
        >
          <FieldLabel htmlFor={inputId} required>
            This item&rsquo;s own label code
          </FieldLabel>
          <Input
            id={inputId}
            value={scannedItemId ?? ""}
            disabled={disabled}
            placeholder="Scan it, or paste what the phone's camera read"
            aria-invalid={
              error || (scannedItemId !== null && !matches) ? true : undefined
            }
            aria-describedby={`${inputId}-error ${inputId}-description`}
            onChange={(event) => onScannedItemIdChange(event.target.value)}
          />
          <FieldDescription id={`${inputId}-description`}>
            Expected for this loan: {borrow.itemName} ({borrow.itemSku}). The
            server refuses a return closed against any other item&rsquo;s label,
            because the device you are holding is the fact the register is
            about.
          </FieldDescription>
          <FieldError id={`${inputId}-error`}>
            {error ??
              (scannedItemId !== null && !matches
                ? "That is a different item from the one on this loan. Check the label and try again."
                : "")}
          </FieldError>
        </Field>

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={disabled}
            onClick={() => {
              setIsCameraOn((previous) => !previous);
            }}
            data-icon="inline-start"
            aria-pressed={isCameraOn}
          >
            {isCameraOn ? (
              <IconCameraOff data-icon="inline-start" />
            ) : (
              <IconCamera data-icon="inline-start" />
            )}
            {isCameraOn ? "Stop the camera" : "Scan with this device's camera"}
          </Button>

          {isCameraOn ? (
            <div className="bg-muted overflow-hidden rounded-none border">
              {/*
                `muted` and `playsInline` are load-bearing, not stylistic: iOS Safari
                refuses to autoplay a camera stream without both, and a video with no
                audio track that fails to autoplay is a black box with nothing on
                screen to explain why.
              */}
              <video
                ref={videoRef}
                muted
                playsInline
                className="aspect-square w-full max-w-64 object-cover"
              />
            </div>
          ) : null}

          {cameraError ? (
            <p
              className="text-destructive flex items-start gap-2 text-xs"
              role="alert"
            >
              <IconAlertCircle
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
              />
              <span>{cameraError}</span>
            </p>
          ) : null}

          {matches ? (
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <IconQrcode aria-hidden="true" className="size-3.5 shrink-0" />
              Matched to {borrow.itemName} ({borrow.itemSku}).
            </p>
          ) : null}
        </div>
      </FieldGroup>
    </FieldSet>
  );
};

export interface ReturnBorrowDialogProps {
  borrow: BorrowRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Names the item in the trigger's accessible name, because a table of two hundred
   * rows carries two hundred "Record return" buttons and "Record return" on its own
   * tells a screen-reader user nothing about which one they are on. Defaults to the
   * borrow's own item name, so the three original props still work unchanged.
   */
  triggerLabel?: string;
}

/**
 * Record a return: the device is back, and this is what condition it is in.
 *
 * **A student loan closes through this panel exactly as a staff loan does** — same
 * fields, same condition overwrite, same refusals — and the only thing on screen
 * that differs is the description, which names the holder and, for a pupil, their
 * class. That is the correct amount of difference: `returnBorrow` resolves the
 * borrower once and then does not branch on it, so a return screen that read
 * differently by borrower would be inventing a distinction the write does not make.
 *
 * **The trigger is rendered here rather than passed in.** A `Popover` has to be
 * positioned against an element it owns, so a popover whose trigger is built
 * somewhere else cannot be anchored to a table cell; and passing the trigger *out*
 * would mean the caller builds a `Popover` root per row anyway. One root per open
 * row is the cost, and the content is only mounted for the row that is open.
 */
/**
 * The panel's body, so `ReturnBorrowDialog` is the state, the mutation, the popover
 * and the trigger — rather than also being the place four fields, a camera and two
 * consequence sentences are laid out.
 *
 * **`outgoing` is computed once by the parent and passed in**, because it reads the
 * loan's unit rows and there is no reason for a presentational block to walk them.
 */
const ReturnBorrowPanelBody: React.FC<{
  borrow: BorrowRecord;
  formId: string;
  formRef: React.Ref<HTMLFormElement>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  isOpen: boolean;
  isBusy: boolean;
  outgoing: string | null;
  scannedItemId: string | null;
  onScannedItemIdChange: (value: string) => void;
  condition: string;
  onConditionChange: (value: string) => void;
  returnNote: string;
  onReturnNoteChange: (value: string) => void;
  errors: Record<string, string | undefined>;
  onRequestClose: () => void;
}> = ({
  borrow,
  formId,
  formRef,
  onSubmit,
  isOpen,
  isBusy,
  outgoing,
  scannedItemId,
  onScannedItemIdChange,
  condition,
  onConditionChange,
  returnNote,
  onReturnNoteChange,
  errors,
  onRequestClose,
}) => (
  <>
    {/*
      `aria-busy` on the form and not on the popover: the popover also holds Cancel,
      and a region marked busy suppresses the announcement a busy region most needs
      to make.
    */}
    <form
      ref={formRef}
      id={formId}
      onSubmit={onSubmit}
      aria-busy={isBusy || undefined}
      className="flex flex-col gap-4 overflow-y-auto p-3 text-sm"
    >
      {/**
       * What the tag says right now, above the picker.
       *
       * Placed above rather than below because the picker is a set of four one-click
       * buttons and "Good" is the first of them: a clerk who has not read this line
       * can set a damaged device to Good in a single click, and the return
       * **overwrites** the tag with no record of what it replaced. This is the only
       * moment the outgoing value is knowable at all.
       */}
      <InventoryInlineNotice
        tone={outgoing === null ? "info" : "warning"}
        title="The tag currently reads"
        description={
          outgoing ??
          "This loan is counted in bulk, so there is no per-tag condition to overwrite. The count is what changes."
        }
      />

      <ReturnScanProof
        borrow={borrow}
        disabled={isBusy}
        error={errors.scannedItemId}
        isOpen={isOpen}
        onScannedItemIdChange={onScannedItemIdChange}
        scannedItemId={scannedItemId}
      />

      <FieldSet
        aria-describedby={`${formId}-condition-help${errors.returnCondition ? ` ${formId}-condition-error` : ""}`}
      >
        {/*
          The legend carries the requirement in words rather than the group carrying
          it in ARIA. Four pressed-state buttons are not a form control, so there is
          nothing to hang `aria-required` or `aria-invalid` on — `role="group"`
          supports neither, and pretending otherwise is markup that announces a state
          the element cannot hold. The enclosing `<fieldset>` is already a real
          grouping, its `aria-describedby` reaches both the explanation and the error,
          and `FieldError` is a `role="alert"`, so the requirement, the consequence
          and the failure are all announced.
        */}
        {/*
          The asterisk is written into the legend's own text rather than passed as a
          `required` prop, because `FieldLegend` has no such prop — and a required
          mark that only exists in the CSS of a component that does not implement it
          is a mark nobody can see. The visually hidden half is the part that
          matters, because the asterisk is a glyph and a screen reader reads
          "asterisk" as nothing at all.
        */}
        <FieldLegend>
          Condition it came back in <span aria-hidden="true">*</span>
          <span className="sr-only"> (required)</span>
        </FieldLegend>
        <div className="flex flex-wrap gap-2">
          {ITEM_CONDITIONS.map((option) => {
            const isSelected = condition === option;
            return (
              <Button
                key={option}
                type="button"
                variant={isSelected ? "default" : "outline"}
                size="sm"
                aria-pressed={isSelected}
                disabled={isBusy}
                onClick={() => {
                  onConditionChange(option);
                }}
              >
                {itemConditionLabel(option)}
              </Button>
            );
          })}
        </div>
        <FieldDescription id={`${formId}-condition-help`}>
          Required, and required by the database too: a returned loan with no
          condition is refused at the column. Pick what is true of the device in
          your hand, not what was true when it went out &mdash; this{" "}
          <span className="font-medium">overwrites</span> the tag&rsquo;s
          recorded condition, it does not add to it, and the value above is not
          kept anywhere afterwards.
        </FieldDescription>
        <FieldError id={`${formId}-condition-error`}>
          {errors.returnCondition}
        </FieldError>
      </FieldSet>

      {isItemCondition(condition) ? (
        <p className={RETURN_CONSEQUENCE_TONE[condition]}>
          {RETURN_CONSEQUENCE[condition]}
        </p>
      ) : null}

      <Field>
        <FieldLabel htmlFor={`${formId}-note`}>Return note</FieldLabel>
        <Textarea
          id={`${formId}-note`}
          value={returnNote}
          onChange={(event) => {
            onReturnNoteChange(event.target.value);
          }}
          rows={2}
          placeholder="e.g. Charger missing; the hinge is stiff but the screen is fine"
          disabled={isBusy}
        />
        <FieldDescription>
          Optional, and the only place the *reason* for a condition survives.
          Recorded on the loan and on the movement it writes to the ledger, so
          &ldquo;came back without its charger&rdquo; is a fact somebody can
          find later &mdash; which, on a tag whose condition has just been
          overwritten, is the difference between a record and an assertion.
        </FieldDescription>
      </Field>
    </form>

    {/*
      The visible busy strip. `loading` empties the submit button's own label, so
      without this the only sign of a slow write is a spinner where a sentence used to
      be. `<output>` carries an implicit `role="status"`, so it is announced too.
    */}
    {isBusy ? (
      <output className="text-muted-foreground block border-t p-2.5 text-xs">
        Closing the loan and putting the units back on the shelf…
      </output>
    ) : null}

    <div className="flex justify-end gap-2 border-t p-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRequestClose}
        disabled={isBusy}
      >
        Cancel
      </Button>
      <Button type="submit" form={formId} size="sm" loading={isBusy}>
        Record return
      </Button>
    </div>
  </>
);

export const ReturnBorrowDialog = ({
  borrow,
  open,
  onOpenChange,
  triggerLabel,
}: ReturnBorrowDialogProps) => {
  const queryClient = useQueryClient();
  const formId = `${useFormIdBase()}-form`;
  const formRef = useRef<HTMLFormElement>(null);
  const [scannedItemId, setScannedItemId] = useState<string | null>(null);
  const [condition, setCondition] = useState<string>("");
  const [returnNote, setReturnNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  const outgoing = outgoingConditionLine(borrow);
  const isDirty = condition !== "" || returnNote.trim().length > 0;

  const reset = () => {
    setScannedItemId(null);
    setCondition("");
    setReturnNote("");
    setErrors({});
  };

  const { requestClose, confirmNode } = useDiscardGuard(isDirty, () => {
    reset();
    onOpenChange(false);
  });

  const returnMutation = useMutation(
    orpc.inventory.borrows.return.mutationOptions({
      onSuccess: async (result) => {
        /*
         * The count is `units.length` **only for a tagged loan**, and that is why
         * the null case cannot be papered over with `?? 0`. `returnBorrow` returns
         * `null` when the loan was a bulk one — counted, not tagged, so there were
         * no unit rows to release — and "0 unit(s) back on the shelf" printed
         * immediately after forty chairs came back is the sort of sentence that makes
         * a clerk stop believing the register. The counted case gets its own clause,
         * and the condition is still named in both: `returnCondition` is required by
         * `inventory_borrow_return_state` and it is the same question for a bulk loan
         * as for a laptop.
         */
        const conditionLabel = itemConditionLabel(result.returnCondition);
        const { availableQty } = result.item;
        toast.success(
          result.units
            ? `${result.units.length} unit(s) back on the shelf in ${conditionLabel} condition — ${availableQty} now available`
            : `Bulk loan closed — the counted units are back on the books as ${conditionLabel} condition, ${availableQty} now available`
        );
        reset();
        onOpenChange(false);
        /**
         * `return`, not `borrow`. Same key set on purpose: a check-in dirties exactly
         * what a check-out dirties, and an asymmetric table here is a bug waiting to
         * be written.
         */
        await invalidateInventory(queryClient, "return");
      },
      onError: (error) => {
        toast.error(formatApiErrorMessage(error, "Could not close this loan"));
      },
    })
  );

  const busy = returnMutation.isPending;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!borrow || busy) {
      return;
    }

    const result = v.safeParse(returnSchema, {
      scannedItemId: scannedItemId ?? "",
      returnCondition: condition,
      returnNote: returnNote.trim() || undefined,
    });

    if (!result.success) {
      setErrors(issuesToFieldErrors(result));
      focusFirstInvalidField(formRef.current);
      return;
    }

    /*
     * The scan is checked against *this loan's* item before the request leaves the
     * browser. The server does the same check and is the authority — this is here so
     * the clerk reads "That is a different item from the one on this loan" while
     * they still have the label in their hand, instead of a `BAD_REQUEST` after they
     * have already picked a condition and typed a note.
     */
    if (result.output.scannedItemId !== borrow.itemId) {
      setErrors({
        scannedItemId:
          "That is a different item from the one on this loan. Check the label and try again.",
      });
      focusFirstInvalidField(formRef.current);
      return;
    }

    setErrors({});

    returnMutation.mutate({
      borrowId: borrow.id,
      scannedItemId: result.output.scannedItemId,
      returnCondition: result.output.returnCondition,
      ...(result.output.returnNote
        ? { returnNote: result.output.returnNote }
        : {}),
    });
  };

  if (!borrow) {
    return null;
  }

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next || busy) {
            onOpenChange(next);
            return;
          }
          requestClose();
        }}
      >
        {/*
          The trigger is a real `<button>` with the row's own item named in its
          accessible name, and `aria-expanded` comes from the popover root — two
          hundred rows of "Record return" is two hundred indistinguishable buttons to
          anybody navigating by voice or by screen reader.
        */}
        <PopoverTrigger
          render={
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-icon="inline-start"
            />
          }
        >
          {triggerLabel ? (
            <span className="sr-only">{triggerLabel}</span>
          ) : null}
          <IconRotateClockwise aria-hidden="true" data-icon="inline-start" />
          Record return
        </PopoverTrigger>

        <PopoverContent
          align="end"
          sideOffset={6}
          className="w-[26rem] max-w-[calc(100vw-2rem)] gap-0 p-0"
        >
          <PopoverHeader className="border-b p-3">
            <PopoverTitle>Record a return</PopoverTitle>
            <PopoverDescription>
              {borrow.qty} &times; {borrow.itemName} ({borrow.itemSku}), on loan
              to {describeBorrowerChoice(borrow.borrower)} &mdash; due back{" "}
              {formatDate(borrow.expectedReturnDate)}
            </PopoverDescription>
          </PopoverHeader>

          <ReturnBorrowPanelBody
            borrow={borrow}
            condition={condition}
            errors={errors}
            formId={formId}
            formRef={formRef}
            isBusy={busy}
            isOpen={open}
            onConditionChange={(next) => {
              setCondition(next);
              setErrors((previous) => ({
                ...previous,
                returnCondition: undefined,
              }));
            }}
            onRequestClose={requestClose}
            onReturnNoteChange={setReturnNote}
            onScannedItemIdChange={(next) => {
              setScannedItemId(next);
              setErrors((previous) => ({
                ...previous,
                scannedItemId: undefined,
              }));
            }}
            onSubmit={handleSubmit}
            outgoing={outgoing}
            returnNote={returnNote}
            scannedItemId={scannedItemId}
          />
        </PopoverContent>
      </Popover>
      {confirmNode}
    </>
  );
};

/**
 * The borrower column, and the reason a student row does not look like a staff row.
 *
 * `listBorrows` used to hand this page a flat `borrowerStaffId` / `borrowerName`
 * pair and `PartyName` rendered it. That pair could only ever be right for half the
 * table — a loan to a pupil had no name to show at all — so the server now returns
 * one resolved `InventoryBorrower` and the three states `PartyName` exists for (a
 * name, a name with no id, an id with no name) are **unreachable here**: `borrowerOf`
 * throws rather than returning a partial row, `name` is always populated, and both
 * borrower foreign keys are `restrict`, so a pointer cannot dangle.
 *
 * **What distinguishes the two cases is the kind of claim, not the colour.** A staff
 * loan and a student loan are different obligations with different consequences: a
 * member of staff signs for a device and can be chased for it, a student's device is
 * the property of a class and its return is a conversation with a class teacher. So
 * the row states the kind in words and in an icon, gives the reference number in the
 * vocabulary of that kind (`EMP-0417` versus `STU/2025/001` are not interchangeable
 * and a clerk reads one aloud at a front office and the other across a corridor), and
 * adds the student's current-year class — because "Grade 9B has the projector" is the
 * sentence this table is queried to produce.
 *
 * **`className: null` is stated, not hidden and not dashed.** It is a real answer
 * from a left join against `academicYear.isCurrent`: the student is on the roll and
 * is in no class this year. Printing a dash there would leave the clerk unable to
 * tell "no class" from "the register did not say".
 */
const BorrowerCell: React.FC<{ borrower: BorrowRecord["borrower"] }> = ({
  borrower,
}) => {
  const isStudent = borrower.type === "student";

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={isStudent ? "outline" : "secondary"}>
          {isStudent ? <IconBackpack /> : <IconBriefcase />}
          {isStudent ? "Student" : "Staff"}
        </Badge>
        <span className="font-medium">{borrower.name}</span>
      </div>
      <span className="text-muted-foreground font-mono text-xs">
        {borrowerReferenceLine(borrower)}
      </span>
      {/**
       * Printed for a student and **not** for a member of staff, and the branch is
       * on `type` rather than on whether `className` happens to be null: a teacher is
       * not on the class roll in this system at all, so their `className` is a
       * structural null and rendering it as "no class this year" would be a category
       * error about a person who was never supposed to be on a class.
       */}
      {isStudent ? (
        <span className="text-muted-foreground text-xs">
          {borrower.className ?? "no class this year"}
        </span>
      ) : null}
    </div>
  );
};

/**
 * The overdue treatment, given the most visual weight on the row.
 *
 * A loan that is late is the one row on this screen a clerk has to act on, and
 * three things say so: a destructive-toned badge, the number of days, and the
 * server's own ordering, which puts every overdue loan at the top of the list ahead
 * of everything that is merely recent.
 *
 * **`overdueDays` is a difference in whole days from Postgres, not a figure
 * recomputed in the browser** — `current_date - expected_return_date::date` — so the
 * number on screen is the same number the filter used, in the same timezone-free
 * calendar.
 *
 * **What a late loan costs is not the same for both kinds of borrower, and this row
 * does not pretend it is.** The badge states one thing — *when* — and "when" is the
 * same measure for a teacher and for a pupil. But the response is not the same act:
 * a member of staff's overdue projector is chased with the person who signed for it
 * and is an accountability question between colleagues, while a student's overdue
 * laptop is a conversation with a class teacher and a parent. So the weight is
 * deliberately not escalated by borrower type, because a register that treats a
 * nine-year-old's borrowed calculator as a property breach would be making a
 * judgement the ledger has no standing to make. The days are the fact; who to talk
 * to is the clerk's, and the `BorrowerCell` above is what tells them.
 */
const OverdueBadge: React.FC<{ record: BorrowRecord }> = ({ record }) =>
  record.isOverdue ? (
    <Badge variant="destructive">
      <IconAlertTriangle />
      {record.overdueDays === null
        ? "Overdue"
        : `${record.overdueDays} day${record.overdueDays === 1 ? "" : "s"} overdue`}
    </Badge>
  ) : null;

/** The four queue presets, in the shape `leave-management` uses for its review queues. */
type LoanPreset = "all" | "borrowed" | "returned" | "overdue";

const LOAN_PRESETS: { value: LoanPreset; label: string }[] = [
  { value: "all", label: "All loans" },
  { value: "borrowed", label: "Out on loan" },
  { value: "returned", label: "Returned" },
  { value: "overdue", label: "Overdue only" },
];

export interface LoansPanelProps {
  /**
   * The school-wide count of late loans, read by the tab container from a dedicated
   * `overdueOnly` query. It comes from the server's own `total`, so it is exact
   * rather than a count of whatever page happens to be loaded — which is what makes
   * it safe to put on the tab label.
   */
  overdueCount: number;
}

/** `listBorrows`'s own input, projected off the router rather than re-declared. */
type ListBorrowsInput =
  InferRouterInputs<AppRouter>["inventory"]["borrows"]["list"];

/**
 * The queue presets, as a row of pressed-state buttons.
 *
 * Its own component so that `LoansPanel`'s own body is the query, the table and the
 * return panel — the part with a rule in it — rather than also being the place four
 * buttons and their badges are drawn.
 */
const LoanPresetFilter: React.FC<{
  preset: LoanPreset;
  onPresetChange: (value: LoanPreset) => void;
  overdueCount: number;
}> = ({ preset, onPresetChange, overdueCount }) => (
  <div className="flex flex-wrap items-center gap-2">
    {LOAN_PRESETS.map((option) => (
      <Button
        key={option.value}
        type="button"
        size="sm"
        variant={preset === option.value ? "default" : "outline"}
        aria-pressed={preset === option.value}
        onClick={() => {
          onPresetChange(option.value);
        }}
      >
        {option.label}
        {option.value === "overdue" && overdueCount > 0 ? (
          <Badge
            variant={preset === "overdue" ? "secondary" : "destructive"}
            className="ml-2 tabular-nums"
          >
            {overdueCount}
          </Badge>
        ) : null}
      </Button>
    ))}
  </div>
);

/**
 * Free text and one borrower, side by side.
 *
 * The two sit in one row because they answer the same question asked two ways — "whose
 * loan is this?" — and putting a search box about items above a filter about a
 * person would make the panel read as two screens. The borrower field is the
 * `BorrowerPickerField` and not a second, staff-only combobox, so "which kind of
 * person am I asking about" is answered in the same way here as it is on the lend
 * form; a reader who has used one has used the other.
 *
 * **The search input's id is derived rather than written.** A fixed `loans-search` put
 * the same id in the document again the moment this panel and a lend dialog were both
 * mounted, and a duplicate `id` means the second `<label for>` activates the first
 * input.
 */
const LoanFilterBar: React.FC<{
  searchId: string;
  search: string;
  onSearchChange: (value: string) => void;
  borrowerFilter: BorrowerChoice | null;
  onBorrowerFilterChange: (value: BorrowerChoice | null) => void;
}> = ({
  searchId,
  search,
  onSearchChange,
  borrowerFilter,
  onBorrowerFilterChange,
}) => (
  <div className="flex flex-wrap items-end justify-between gap-3">
    <div className="flex flex-wrap items-end gap-4">
      <div className="min-w-56">
        <FieldLabel htmlFor={searchId}>Search</FieldLabel>
        <Input
          id={searchId}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Item, SKU, purpose or borrower"
          className="mt-1"
        />
        {/**
         * The search reaches a **person** as well as a thing, and the placeholder
         * alone could not say so in the room available. `listBorrows` matches the
         * item's name, its SKU, the stated purpose, and — through a left join onto
         * `student` — a student's name written as one string or their admission
         * number. The admission number is searched on its own because it is the
         * string a front office actually reads down a telephone, and half the rows in
         * this table are now student loans: a register that could not be searched by
         * the name of the child carrying the laptop is not searchable by the person an
         * anxious parent will ask about.
         */}
        <FieldDescription className="mt-1.5">
          Item name, SKU, what the loan was for, or a borrower&rsquo;s name or
          admission number &mdash; so &ldquo;Nimali&rdquo; and
          &ldquo;STU/2025/001&rdquo; both find the child carrying it.
        </FieldDescription>
      </div>
      <div className="min-w-72">
        <BorrowerPickerField
          value={borrowerFilter}
          onChange={onBorrowerFilterChange}
          label="Filter by borrower"
          allowClear
          description="One person at a time. The register can only ask about a staff member or a student, never both at once."
        />
      </div>
    </div>
  </div>
);

/**
 * `listBorrows`'s input, built from the panel's filter state.
 *
 * **This is the only place the "exactly one borrower" rule reaches the wire.**
 * `listBorrows` takes `borrowerStaffId` and `borrowerStudentId` as separate optionals
 * and refuses both at once with a `BAD_REQUEST` — "Pick either a staff member or a
 * student to filter by" — because a loan has exactly one borrower and a request
 * naming two is a contradiction rather than a narrower filter. The panel holds a
 * single `BorrowerChoice | null` whose `type` is the discriminator, so the two spread
 * keys below are mutually exclusive **by construction**: there is no ordering of
 * clicks, and no intermediate state, that produces both keys.
 *
 * A named function rather than an inline literal, for one reason: this is the request,
 * and a request is worth being able to read on its own. Its input type is
 * `listBorrows`'s own, projected off the router, so renaming a filter key on the
 * server is a compile error here rather than a request that is quietly dropped.
 */
const listBorrowsInput = ({
  preset,
  search,
  borrowerFilter,
}: {
  preset: LoanPreset;
  search: string;
  borrowerFilter: BorrowerChoice | null;
}): ListBorrowsInput => {
  const trimmedSearch = search.trim();

  return {
    limit: BORROW_LIST_LIMIT,
    ...(preset === "overdue" ? { overdueOnly: true } : {}),
    ...(preset === "borrowed" || preset === "returned"
      ? { status: preset }
      : {}),
    ...(trimmedSearch ? { search: trimmedSearch } : {}),
    ...(borrowerFilter?.type === "staff"
      ? { borrowerStaffId: borrowerFilter.id }
      : {}),
    ...(borrowerFilter?.type === "student"
      ? { borrowerStudentId: borrowerFilter.id }
      : {}),
  };
};

export const LoansPanel = ({ overdueCount }: LoansPanelProps) => {
  const idBase = useFormIdBase();
  const [preset, setPreset] = useState<LoanPreset>("borrowed");
  const [search, setSearch] = useState("");
  const [borrowerFilter, setBorrowerFilter] = useState<BorrowerChoice | null>(
    null
  );
  const [returningBorrow, setReturningBorrow] = useState<BorrowRecord | null>(
    null
  );
  const [isLendOpen, setIsLendOpen] = useState(false);

  const borrowsQuery = useQuery(
    orpc.inventory.borrows.list.queryOptions({
      input: listBorrowsInput({ preset, search, borrowerFilter }),
    })
  );

  const borrows = useMemo(
    () => borrowsQuery.data?.borrows ?? [],
    [borrowsQuery.data]
  );
  const total = borrowsQuery.data?.total ?? 0;
  const hasFilter =
    preset !== "all" || Boolean(search.trim()) || borrowerFilter !== null;

  return (
    <div className="space-y-4">
      <LoanPresetFilter
        preset={preset}
        onPresetChange={setPreset}
        overdueCount={overdueCount}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <LoanFilterBar
          search={search}
          onSearchChange={setSearch}
          borrowerFilter={borrowerFilter}
          onBorrowerFilterChange={setBorrowerFilter}
          searchId={`${idBase}-search`}
        />
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setIsLendOpen(true);
          }}
          data-icon="inline-start"
        >
          <IconPlus data-icon="inline-start" />
          Lend stock
        </Button>
      </div>

      {/*
        The three read states are settled **before** anything else is drawn, and in
        this order: loading, then error, then the empty state. A failed read that
        renders as `borrows.length === 0` prints "Nothing is out on loan" — a
        confident, well-written, false claim about the whole school at the moment the
        network drops. The empty state is only ever reached on a request that
        succeeded.
      */}
      {borrowsQuery.isLoading ? <InventorySkeleton rows={8} /> : null}

      {borrowsQuery.isError ? (
        <InventoryErrorState
          error={borrowsQuery.error}
          onRetry={() => {
            void borrowsQuery.refetch();
          }}
        />
      ) : null}

      {!borrowsQuery.isLoading &&
      !borrowsQuery.isError &&
      borrows.length === 0 ? (
        <InventoryEmptyState
          title={
            hasFilter ? "No loans match this view" : "Nothing is out on loan"
          }
          description={
            hasFilter
              ? "No loan matches this queue, search or borrower filter. Clear them to see every check-out and check-in on record."
              : "Every tagged unit in the store is on the shelf it belongs to. A loan appears here the moment a member of staff or a student takes equipment off — each row naming the person it is owed back to, their reference number, and for a pupil the class it is in, with the date it is due. A loan past that date sorts to the top of this list with the number of days it is late."
          }
        />
      ) : null}

      {!borrowsQuery.isLoading &&
      !borrowsQuery.isError &&
      borrows.length > 0 ? (
        <>
          <Table>
            {/*
              The table's name, and its first child so it is what a screen reader
              announces before the rows. It says what the columns are *for* and which
              way the list runs, because "overdue first, then soonest due" is a rule
              the server owns and nothing else on screen states it.
            */}
            <TableCaption>
              Every check-out and check-in on record for this store. Overdue
              loans first, soonest due date at the top within them, everything
              else newest first. Each row names the borrower, the item and its
              asset tags, when it went out and who issued it, when it is due
              back, and what came back and in what condition.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Borrower</TableHead>
                <TableHead scope="col">Item</TableHead>
                <TableHead scope="col" numeric>
                  Qty
                </TableHead>
                <TableHead scope="col">Due back</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Asset tags</TableHead>
                <TableHead scope="col">Returned</TableHead>
                <TableHead scope="col">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {borrows.map((borrow) => (
                <TableRow key={borrow.id}>
                  <TableCell>
                    {/**
                     * One resolved borrower, rendered by kind. The flat
                     * `borrowerName` / `borrowerStaffId` pair this cell used to read
                     * no longer exists on the row, and no amount of null-guarding
                     * would have brought it back: for a student loan both fields were
                     * `null`, so the old cell rendered a cell that said the register
                     * had lost the holder of a laptop that was sitting in a child's
                     * bag. See `BorrowerCell` for what the two kinds render
                     * differently.
                     */}
                    <BorrowerCell borrower={borrow.borrower} />
                    <span className="text-muted-foreground line-clamp-1 text-xs">
                      {borrow.purpose}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <span className="block">{borrow.itemName}</span>
                    <span className="text-muted-foreground font-mono text-xs">
                      {borrow.itemSku}
                    </span>
                    {/**
                     * **When it went out, who issued it, and who agreed to it** — the
                     * three facts that made this a list of obligations rather than a
                     * record, and all three of which `listBorrows` already projected
                     * and nothing rendered. They sit under the item rather than in
                     * three columns of their own, because a records tool that gains
                     * three columns loses the two that matter on a 200-row table, and
                     * a loan's audit line belongs with the loan's item.
                     *
                     * `tabular-nums` comes from the `Table` itself, so the date does
                     * not jitter against its neighbours as rows change.
                     */}
                    <span className="text-muted-foreground block text-xs">
                      Out since {formatDate(borrow.borrowedAt.slice(0, 10))}
                      {borrow.issuedByName
                        ? ` · issued by ${borrow.issuedByName}`
                        : " · issued by an account with no name on record"}
                      {borrow.approvedBy
                        ? ` · authorised by ${borrow.approvedBy}`
                        : ""}
                    </span>
                  </TableCell>
                  <TableCell numeric className="font-medium">
                    {borrow.qty}
                  </TableCell>
                  <TableCell>
                    <span className="block">
                      {formatDate(borrow.expectedReturnDate)}
                    </span>
                    <OverdueBadge record={borrow} />
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        borrow.status === "returned" ? "secondary" : "outline"
                      }
                    >
                      {borrow.status === "returned" ? (
                        <IconRotateClockwise />
                      ) : null}
                      {borrowStatusLabel(borrow.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs whitespace-normal">
                    {/**
                     * Every tag, in full, and every released tag with the moment it
                     * went back. This column used to open with `summariseTags` — three
                     * names and a count — which is the one place on the row that
                     * answers "which machines went out on this loan", and a partial
                     * answer there is a partial audit trail.
                     */}
                    {borrow.units.length > 0 ? (
                      <ul className="font-mono">
                        {borrow.units.map((unit) => (
                          <li key={unit.id} className="break-all">
                            {unit.uniqueNo}
                            {unit.releasedAt === null ? null : (
                              <span className="text-muted-foreground block">
                                released {formatDateTime(unit.releasedAt)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-muted-foreground">
                        &mdash; counted in bulk
                      </span>
                    )}
                    {/**
                     * Released units are shown, not filtered out. `listBorrows`
                     * deliberately returns the join rows for the whole page including
                     * released ones: "this laptop came back in Fair condition on 3
                     * March" is a fact about the past, and a loan record that could
                     * only describe the present would not be an audit trail. Each
                     * released tag is labelled with the moment it went back rather
                     * than dropped.
                     */}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {borrow.status === "returned" ? (
                      <span className="block">
                        {borrow.returnedAt ? (
                          <span className="block">
                            {formatDateTime(borrow.returnedAt)}
                          </span>
                        ) : null}
                        {borrow.returnCondition ? (
                          <ConditionBadge condition={borrow.returnCondition} />
                        ) : null}
                        {borrow.returnNote ? (
                          <span className="text-muted-foreground line-clamp-2 text-xs italic">
                            {borrow.returnNote}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <ReturnBorrowDialog
                        borrow={borrow}
                        open={returningBorrow?.id === borrow.id}
                        onOpenChange={(next) => {
                          if (next) {
                            setReturningBorrow(borrow);
                            return;
                          }
                          setReturningBorrow(null);
                        }}
                        triggerLabel={`Record the return of ${borrow.qty} × ${borrow.itemName} on loan to ${borrow.borrower.name}`}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <p className="text-muted-foreground text-xs">
            Showing {borrows.length} of {total} loans. Overdue loans are listed
            first, soonest due date at the top within them; everything else is
            newest first.
          </p>
        </>
      ) : null}

      <BorrowDialog open={isLendOpen} onOpenChange={setIsLendOpen} />
    </div>
  );
};
