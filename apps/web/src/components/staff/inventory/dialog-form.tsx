"use client";

/*
 * The three form behaviours every dialog in this feature needs and valibot does not
 * provide: **a shell that keeps a long form's header and footer on screen**, **moving
 * focus to the first field that failed**, and **announcing what a submit did**.
 *
 * The first two are accessibility requirements rather than polish. A rejected form
 * that paints a red ring on a field nobody is looking at has told the user nothing;
 * on a fifteen-field form the only field they can see is the last one they touched.
 * And a mutation that resolves while focus sits on a button that has just disabled
 * itself announces nothing at all — the toast is a visual channel, and it is a visual
 * channel.
 */
/* oxlint-disable react-doctor/only-export-components -- a focus hook and a dialog shell beside the live region they are used with, for the same reason shared/inventory-states.tsx groups its empty-state copy */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import type * as React from "react";
import { useCallback, useRef } from "react";

import { validationFieldErrors } from "@/lib/api-error";

/**
 * A server's field-level complaints, as the `Record<string, string>` these forms
 * hold.
 *
 * `validationFieldErrors` returns `Partial<Record<string, string>>` because a
 * generic `T extends string` cannot promise a key exists; every form here holds a
 * plain open map, and a value that is `undefined` has to be *dropped* rather than
 * written — `{ qty: undefined }` renders as a field that is invalid with no message,
 * which is the state a `Field` cannot style and a reader cannot act on.
 *
 * So this is the one place the narrowing happens, and it happens once per mutation
 * rather than as a cast at each of the twelve call sites.
 */
export const fieldErrorsFromApi = (error: unknown): Record<string, string> => {
  const errors: Record<string, string> = {};

  for (const [key, message] of Object.entries(validationFieldErrors(error))) {
    if (typeof message === "string" && message.length > 0) {
      errors[key] = message;
    }
  }

  return errors;
};

/**
 * A registry of controls, keyed by the field name a valibot issue carries.
 *
 * `order` is the **visual** order of the fields, declared once at module scope so it
 * is a stable array.
 */
export interface FieldFocus {
  /**
   * A `ref` callback for a control, namespaced by the field key a valibot issue would
   * carry. `undefined` until the control mounts, which is why this is a callback and
   * not a `RefObject`: a field that renders conditionally can unregister itself, and a
   * `RefObject` would leave a stale node in the map for focus to land on.
   */
  controlRef: (key: string) => (node: HTMLElement | null) => void;
  /**
   * Focus the first field in `order` that has a message. A no-op when the error map
   * is empty, so it is safe to call unconditionally after every failed submit —
   * including the ones that failed on a field with no control on screen.
   */
  focusFirstInvalid: (errors: Record<string, string>) => void;
}

export const useFirstInvalidFocus = (order: readonly string[]): FieldFocus => {
  const nodes = useRef(new Map<string, HTMLElement>());

  /**
   * Focus moves **synchronously in the submit handler**, not in an effect.
   *
   * The obvious implementation sets a `target` state and focuses in a `useEffect`
   * after the re-render, and that costs two extra renders per rejection and a
   * visible frame where the red ring is on screen with focus still on the submit
   * button. It is also unnecessary: the control being focused is already in the
   * document — errors never *add* a control, they only annotate one — so the node
   * exists before the submit is even handled. `preventScroll` keeps the field from
   * jumping a long form to a row the clerk was already looking at, while the
   * browser's own focus ring shows where focus went.
   */
  const focusFirstInvalid = (errors: Record<string, string>) => {
    const first = order.find((key) => errors[key]);
    if (first === undefined) {
      return;
    }
    nodes.current.get(first)?.focus();
  };

  const controlRef = useCallback(
    (key: string) => (node: HTMLElement | null) => {
      if (node === null) {
        nodes.current.delete(key);
        return;
      }
      nodes.current.set(key, node);
    },
    []
  );

  return { controlRef, focusFirstInvalid };
};

/**
 * The polite live region every dialog in this feature announces through.
 *
 * **One region, and it is not the toast.** The toast is `sonner`'s, and `sonner`
 * announces through its own region; a second region saying the same sentence produces
 * a double announcement, and the feature's own record (`UI.md`, "Each outcome is
 * toasted exactly once") is explicit that a dialog must not re-say what the mutation
 * observer already said. So this announces only what a toast cannot:
 *
 * - that the form was rejected and **nothing was lost**, which is the sentence a
 *   clerk actually needs after a failed save and which no toast carries;
 * - the sentence naming a field that failed, for a form rejected on a control that
 *   took no focus — the finalise dialog's `<Select>` is the case, and a rejection
 *   there is otherwise completely silent to a screen reader.
 *
 * `<output>` rather than a `<p role="status">`: it is the same implicit live region
 * with the right name for it, and it takes `form`/`for` attributes if this ever needs
 * to point at a specific control.
 *
 * `aria-live="polite"` and never `assertive`: a rejection is a response to something
 * the user just did, and interrupting whatever they were reading to tell them about it
 * is rude in a way that makes people stop using the tool.
 */
export const DialogStatus: React.FC<{
  /** The sentence to announce, or `""` for nothing to say. */
  message: string;
  /** True while a mutation is in flight, for `aria-busy` on the form. */
  busy?: boolean;
}> = ({ message, busy = false }) => (
  <>
    {busy ? (
      <output className="sr-only">Working &mdash; please wait</output>
    ) : null}
    <output className="sr-only" aria-live="polite" aria-atomic="true">
      {message}
    </output>
  </>
);

/**
 * The frame every dialog in this feature uses: a scrolling body, a header and footer
 * that do not move, and a submit button *outside* the `<form>` bound with `form=`.
 *
 * ## Why the shell exists rather than being copied nine times
 *
 * All four movement dialogs had the same fourteen lines of structure, and they had
 * drifted: some put the busy state on the form, some on the footer; some had a
 * scrollable body, some let a long form push the Cancel button off screen, which on
 * the stock-in dialog meant a clerk who had scrolled to the tag list could not cancel
 * without scrolling back. And nine copies of that frame is nine chances to make a
 * different mistake in the tenth.
 *
 * Binding the submit button with `form=` rather than nesting it is deliberate and is
 * the app's house idiom (`UI.md`, "Keyboard behaviour"): implicit submission on
 * `Enter` still works, and the footer can be a sibling of the form instead of a
 * `position: sticky` layer over the scrolling body.
 */
export const LifecycleDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  /** The `<form>`'s fields. Rendered inside the scroll region. */
  children: React.ReactNode;
  /** The footer. Usually a Cancel and a submit button. */
  footer: React.ReactNode;
  /** The form's id, so a footer button outside the form can still submit it. */
  formId: string;
  onSubmit: (event: React.FormEvent) => void;
  /** True while a mutation is in flight: `aria-busy` on the form, nothing else. */
  busy?: boolean;
  /** The live-region sentence. Rendered at the top of the form. */
  announcement?: string;
  /** `wide` for the two dialogs with a tag list; the default fits a form. */
  width?: "default" | "wide";
}> = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  formId,
  onSubmit,
  busy = false,
  announcement = "",
  width = "default",
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent
      className={`flex max-h-[85vh] flex-col overflow-hidden p-0 ${
        width === "wide" ? "sm:max-w-2xl" : "sm:max-w-lg"
      }`}
    >
      <DialogHeader className="shrink-0 border-b px-6 py-4">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <form
        id={formId}
        onSubmit={onSubmit}
        aria-busy={busy || undefined}
        className="flex-1 space-y-6 overflow-y-auto px-6 py-4"
      >
        <DialogStatus message={announcement} busy={busy} />
        {children}
      </form>

      <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
        {footer}
      </div>
    </DialogContent>
  </Dialog>
);
