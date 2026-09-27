"use client";

/*
 * This module is a vocabulary and a frame, not a page: the three constants, four
 * valibot schemas and two focus helpers are deliberately declared beside the
 * components that use them rather than in a seventh file, because the words a
 * custody trail is read with and the sentences that describe what a button will do
 * have to be changed together. Fast Refresh degrades to a full reload of this module
 * when one of them changes, which costs nothing — none of them holds state.
 */
/* oxlint-disable react-doctor/only-export-components -- a vocabulary and a shared frame, declared together */

/**
 * The chrome and the vocabulary every custody dialog in this feature shares.
 *
 * ## Why this module exists
 *
 * `custody-dialogs.tsx` was one 3,000-line file holding six dialogs and every
 * helper they had in common. Splitting the dialogs apart is only half of it: the
 * other half is that **the a11y treatment was copy-pasted five times**, so a fix
 * to one dialog was not a fix to the other four. Hardcoded `id` attributes, a
 * submit label that changed width the moment it was pressed, no `aria-busy`, no
 * focus moved to the field that failed — all five copies, all five wrong, and
 * all five waiting to drift apart again.
 *
 * So the shared parts are here and the dialogs are compositions. A dialog that
 * needs a different footer passes a different `submitLabel`; it cannot pass a
 * different submit *mechanism*, because there isn't one.
 *
 * **The four things this file is responsible for, and why each is load-bearing
 * in a feature about accountability:**
 *
 * 1. **The vocabulary** — `IN_STORE`, `NO_MANAGER`, `CHOSEN_STAFF`, and the two
 *    "who is in charge of this" badges. These are the words a custody trail is
 *    read with, and three different facts about a null pointer each need a
 *    *different* name. Writing "None" for all three flattens the only
 *    distinction that matters on an audit line.
 * 2. **`ChangePreview`** — the before-and-after sentence, stated before the
 *    button is pressed. This is the cheapest thing in the whole feature and it
 *    catches the genuinely expensive mistake: the wrong person out of a roll of
 *    fifty with similar names.
 * 3. **`CustodyDialogFrame`** — one header, one scrolling form, one status
 *    strip, one footer, one `aria-busy`, one `role="status"`. Five dialogs cannot
 *    disagree about any of those.
 * 4. **`focusFirstInvalidField`** — valibot does not move focus, and a browser
 *    only does so for *native* validation. Without this a failed submit was a red
 *    field, a toast, and a hunt.
 */
import { inventoryTransferReasonSchema } from "@school-student-teacher-management/db/constants/inventory";
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
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import { Textarea } from "@school-student-teacher-management/ui/components/textarea";
import {
  IconArrowRight,
  IconBuildingWarehouse,
  IconUserCheck,
  IconUserCog,
  IconAlertCircle,
} from "@tabler/icons-react";
import { cn } from "cn";
import type * as React from "react";
import { useId } from "react";
import * as v from "valibot";

import type { InventoryItemView } from "@/components/staff/inventory/inventory-types";
import { useAssignableStaffOptions } from "@/components/staff/inventory/shared";

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
export const IN_STORE = "the store";
export const NO_MANAGER = "nobody";

/**
 * The receiving side of a preview, when the name is not (or not yet) known.
 *
 * It says *member of staff* because that is the whole set the field now offers.
 * "Teacher" here would be a claim about a person the reader has not chosen yet,
 * and it would be wrong for the bursar.
 */
export const CHOSEN_STAFF = "the member of staff you choose";

/**
 * One side of a before-and-after pair, with the weight the two deserve.
 *
 * The arrow is `aria-hidden`: the pair is read as a sentence by anybody who
 * cannot see it, and the `ChangePreview` above it already says what is moving.
 */
export const PartyPair = ({
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
 * The before-and-after sentence, in the plain language an administrator would
 * use to tell a colleague what they just did.
 *
 * **This is the most valuable sentence in the feature and it costs one string.**
 * Every one of these changes writes a permanent row, and the question it will be
 * asked months later is "what happened here" — which the `reason` picklist
 * answers in eight words. Stating the change *before* the button is pressed is
 * what catches the genuinely expensive mistake.
 *
 * The wording is built from the item's **current** pointer and the selection in
 * the form, never from a guess about the `changeType` the server will write. What
 * the server records is a first claim (`custody_taken`) when nothing holds the
 * item and a `custody_transferred` when somebody does, and the sentence says the
 * same thing in words: from the store, or from the person who has it.
 *
 * **There are two shapes, and the type makes the caller pick one.** A `from`/`to`
 * pair draws a move, so it is only honest for a request that will move something.
 * A request that records nothing gets `unchanged` instead, which is a *sentence*
 * and not an arrow: an arrow drawn for a change that will not happen describes a
 * state the register is already in. The union is the enforcement — there is no
 * way to pass a pair and a sentence at once, and no way to pass neither.
 */
export type ChangePreviewProps = { headline: string; footnote: string } & (
  | { from: string; to: string; unchanged?: never }
  | { from?: never; to?: never; unchanged: string }
);

export const ChangePreview: React.FC<ChangePreviewProps> = (props) => {
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
 * outside what the client holds. Rather than print a UUID, the preview falls
 * back to a phrase that is true in both cases, and the server's response carries
 * the authoritative name: the success toast says "Custody moved to S. Fernando"
 * and the register row shows it a moment later. A preview that is occasionally a
 * UUID is worse than one that is occasionally a phrase.
 */
export const usePartyName = (staffId: string | null): string | null => {
  const { options } = useAssignableStaffOptions();

  if (!staffId) {
    return null;
  }

  return options.find((option) => option.id === staffId)?.name ?? null;
};

/**
 * "Currently held by …", and the two states it can be in.
 *
 * The honest version of this is a *pair* of outcomes rather than a fallback
 * string: a named holder, or a stated fact that there is none. An em-dash would
 * have been the third option and would have been the wrong one, because it reads
 * as missing data rather than as the answer. The icon and the words carry it
 * together, so the state is never the dashed border on its own.
 */
export const CurrentHolderBadge: React.FC<{
  item: InventoryItemView | null;
}> = ({ item }) => (
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
export const CurrentManagerBadge: React.FC<{
  item: InventoryItemView | null;
}> = ({ item }) => (
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

export type CustodyErrors = Partial<
  Record<"newCustodianStaffId" | "reason" | "note", string>
>;

/**
 * The same record with the successor's own key, because the key has to match the
 * wire: `transferOwnership`'s input is `newOwnerStaffId`, and an error filed under
 * a different name lands nowhere on the form.
 */
export type OwnershipErrors = Partial<
  Record<"newOwnerStaffId" | "reason" | "note", string>
>;

/**
 * `transferOwnership`'s input, as a form shape: a successor that must be a person
 * and a cause that must be one of the eight.
 *
 * **The successor is a plain `string` here and a non-nullable id on the wire, and
 * the empty string is what "nobody chosen yet" looks like on the way in.** There
 * is no third state to encode because this verb cannot express one, so the field
 * is the ordinary picker and the schema is what turns an untouched form into a
 * message on the right control.
 */
export const ownershipSchema = v.object({
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

export const transferSchema = v.object({
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
 * **One schema for three dialogs, because the pair really is the same shape.**
 * `assignManager`, `transferOwnership` and `reclaim` all take a cause and a
 * sentence and nothing more — the difference between them is *who* may press the
 * button and *what else moves*, neither of which is a field. Spelling the object
 * out three times is how those dialogs end up asking for the reason in different
 * words, and the reason is the one thing on these rows an audit reads.
 *
 * `note` is trimmed and capped at 500, and **only sent when it is non-empty**:
 * the server's own input is `optional(pipe(string(), minLength(1)))`, so an empty
 * string is not "no note" there, it is a validation failure.
 */
export const reasonAndNoteSchema = v.object({
  reason: inventoryTransferReasonSchema,
  note: v.pipe(v.string(), v.trim(), v.maxLength(500)),
});

export const noteSchema = v.pipe(v.string(), v.trim(), v.maxLength(500));

/**
 * Only the keys valibot objected to, so each issue lands on the field that caused
 * it. It takes the **issues** rather than the result object because
 * `v.SafeParseResult` is generic over the *schema*, and threading a schema type
 * through a helper whose whole job is to read `issue.path[0].key` would buy
 * nothing.
 */
export const issuesToErrors = <T extends string>(
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

/**
 * **`useId` sanitised, because `useId` returns `:r7:` and that is not a valid
 * CSS identifier.**
 *
 * Every id in these dialogs is built from this, and they are used three ways: as
 * a `form` attribute, as a `<label for>`, and inside a `querySelector` when a
 * submit fails. The third is the one that breaks on a raw `useId` — `#:r7:` is a
 * selector error, not a miss — and a failed focus is invisible, so the defect
 * would not have been noticed. The `Field` primitive in `packages/ui` strips the
 * same characters for the same reason.
 */
export const useFormIdBase = (): string =>
  useId().replaceAll(/[^\dA-Za-z_-]/gu, "");

/**
 * Move focus to the first control in a form that is currently marked invalid.
 *
 * **Why it walks the DOM instead of taking an id.** Valibot does not move focus
 * and a browser only does so for *native* validation, so without this a failed
 * submit was a red field, a toast, and a hunt. An id-based version would need to
 * know every field's id — and two of the controls in these forms do not publish
 * one: `StaffComboboxField` and `TransferReasonField` generate their own `useId`
 * internally, so an id the dialog could name would point at nothing. Asking the
 * *field* where its control is gets all of them, including a future one.
 *
 * The order is DOM order, which is reading order, which is the order the clerk
 * filled the form in — so the first thing they are told about is the first thing
 * they should deal with.
 */
export const focusFirstInvalidField = (form: HTMLFormElement | null): void => {
  const field = form?.querySelector<HTMLElement>(
    '[data-slot="field"][data-invalid="true"]'
  );

  if (!field) {
    return;
  }

  const control = field.querySelector<HTMLElement>(
    'input, textarea, select, [role="combobox"], [contenteditable="true"]'
  );

  (control ?? field).focus();
};

/**
 * The free-text `note`, which is the same field in four of the five dialogs.
 *
 * "Misassignment" is a category; "Mr Perera had both projectors" is a detail.
 * Folding the second into the first would leave a `reason` column holding a
 * sentence, and both land on the same history row.
 *
 * **The ids are derived, not written.** These dialogs can be mounted together —
 * `CustodyDialogs` holds three at once and the history sheet opens two more — and
 * a hardcoded `id` put in the document twice leaves the second `<label for>`
 * activating the first `<textarea>`. The `htmlFor`, the `aria-describedby` and
 * the `FieldError`'s own id are all built from one `useId`, so they cannot drift
 * apart from each other either.
 */
export const CustodyNoteField: React.FC<{
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled: boolean;
  rows?: number;
  placeholder?: string;
  description?: React.ReactNode;
  label?: string;
}> = ({
  value,
  onChange,
  error,
  disabled,
  rows = 3,
  placeholder = "Optional. The detail the eight reasons cannot carry — who has the other projector, which room it is going to.",
  description = "The reason is the category; this is the sentence. Both land on the same history row, and only the sentence survives a later question that turns out to be about one specific pair of people.",
  label = "Note",
}) => {
  const inputId = useFormIdBase();
  const errorId = `${inputId}-error`;

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <Textarea
        id={inputId}
        value={value}
        rows={rows}
        maxLength={500}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError id={errorId}>{error}</FieldError>
    </Field>
  );
};

export interface CustodyDialogFrameProps {
  open: boolean;
  /** Wired to `Dialog`'s `onOpenChange`, and already guarded on `isPending`. */
  onOpenChange: (open: boolean) => void;
  formId: string;
  title: string;
  /**
   * **Names the item in every one of these dialogs**, and the name is part of the
   * dialog's accessible name rather than buried in the body: a screen reader that
   * opens "Transfer custody" has to be able to answer "which item?" without
   * reading the form.
   */
  description: React.ReactNode;
  isPending: boolean;
  /**
   * What the reader is told while the write is in flight, and any problem that
   * belongs to the submission as a whole rather than to one control. Rendered as a
   * visible strip, not a bare spinner: a school LAN is slow and a button that has
   * silently emptied itself is the definition of a dangling state.
   */
  busyLabel: string;
  /** A form-level refusal with no field to attach to, or `null`. */
  formError?: string | null;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  /**
   * A ref to the `<form>` the frame renders, so the dialog can move focus to the
   * first invalid field after a failed submit. The frame owns the element
   * because the submit button lives outside it — that is the app's one
   * convention for a dialog footer, and it is the only reason a dialog in this
   * feature needs a handle on its own markup at all.
   */
  formRef?: React.Ref<HTMLFormElement>;
  onRequestClose: () => void;
  submitLabel: string;
  submitIcon?: React.ReactNode;
  submitDisabled?: boolean;
  submitVariant?: "default" | "destructive";
  children: React.ReactNode;
  className?: string;
}

/**
 * The chrome five dialogs share, so they cannot disagree about it.
 *
 * ## What this actually fixed
 *
 * Each of the three things below was wrong in **all five** dialogs before this
 * existed, and a per-dialog fix would have left the other four to be re-broken:
 *
 * - **The submit label changed width the instant it was pressed.** The old code
 *   swapped the string (`"Record transfer"` → `"Recording…"`), so the button the
 *   clerk's pointer was already travelling toward moved out from under it. The
 *   `Button`'s own `loading` prop exists for exactly this: the label stays in the
 *   layout and a spinner of the same footprint goes on top, so the box does not
 *   move, the button stops accepting activation (no double submit), and
 *   `aria-busy` is set without this file writing it five times.
 * - **Nothing announced the wait.** `loading` is silent to a screen reader
 *   beyond `aria-busy`, and the visible label is `text-transparent` while it
 *   spins — so the strip below the form is a `role="status"` that *says* what is
 *   happening, in words, while the write is in flight.
 * - **A form could be submitted twice in the tick before `isPending` became
 *   true.** `isPending` is the parent's `mutation.isPending`, and a React state
 *   update is not synchronous. `focusFirstInvalidField` covers the other half —
 *   a form whose validation failed must not be able to send anything.
 */
export const CustodyDialogFrame = ({
  open,
  onOpenChange,
  formId,
  title,
  description,
  isPending,
  busyLabel,
  formError,
  onSubmit,
  formRef,
  onRequestClose,
  submitLabel,
  submitIcon,
  submitDisabled = false,
  submitVariant = "default",
  children,
  className,
}: CustodyDialogFrameProps) => {
  const statusText = isPending ? busyLabel : (formError ?? "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg",
          className
        )}
      >
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/*
          `aria-busy` on the scrolling body rather than on the whole popup: the
          popup also holds the Cancel button, and marking the dialog busy would
          suppress the very announcement a busy dialog needs to make.
        */}
        <form
          ref={formRef}
          id={formId}
          onSubmit={onSubmit}
          aria-busy={isPending || undefined}
          className="flex-1 space-y-5 overflow-y-auto px-6 py-4"
        >
          {children}
        </form>

        {/*
          The status strip. `<output>` carries an implicit `role="status"`, which is
          an implicit polite live region, so the sentence is announced when it appears
          and when it changes; the icon is `aria-hidden` because the words carry it. It
          renders nothing at all when idle, so a form at rest has no furniture it does
          not need — and what it *does* say while busy is the point: "Recording the
          transfer" is a sentence a clerk can hold on to, and a button that emptied
          itself is not.
        */}
        {statusText ? (
          <output
            className={cn(
              "flex shrink-0 items-start gap-2 border-t px-6 py-2.5 text-sm",
              formError ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {formError ? (
              <IconAlertCircle
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
            ) : null}
            <span>{statusText}</span>
          </output>
        ) : null}

        <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={onRequestClose}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            loading={isPending}
            disabled={submitDisabled}
            variant={submitVariant}
            data-icon="inline-start"
          >
            {submitIcon}
            {submitLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
