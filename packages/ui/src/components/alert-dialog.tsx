import * as React from "react"
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog"
import { cn } from "cn"

import { Button } from "@school-student-teacher-management/ui/components/button"

/** See `dialog.tsx`: one soft brand-tinted shadow, and no second hairline. */
const OVERLAY_SHADOW =
  "shadow-[0_10px_30px_-12px_rgb(1_52_5/0.28),0_2px_8px_-4px_rgb(1_52_5/0.18)]"

const OVERLAY_SCRIM =
  "fixed inset-0 isolate z-50 bg-foreground/20 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:duration-0 motion-reduce:animate-none"

/**
 * The reason string Base UI reports when `Esc` asked the alert dialog to close.
 *
 * The root's `onOpenChange` carries the reason that produced the change, and
 * `eventDetails.cancel()` vetoes it. Spelling the string out beats importing an
 * internal constant: the value is part of Base UI's public `ChangeEventReason`
 * union, and a typo in a comparison would silently disable the veto.
 */
const ESCAPE_KEY_REASON = "escape-key"

/**
 * An alert dialog: a question the user has to answer.
 *
 * Base UI forces `modal` and `disablePointerDismissal` for this component, so a
 * backdrop click already does nothing. `Esc` is the one dismissal it would
 * otherwise still accept, and for this app that is wrong.
 *
 * The failing case is concrete: an administrator opens "Delete custody record"
 * on a projector, reaches for the keyboard to correct a field, presses `Esc`,
 * and the confirm vanishes unanswered with the record still there and their
 * half-made edit still in the field. Nothing is destroyed — but the dialog that
 * existed to force a decision is gone, and the decision was never made.
 *
 * So `Esc` is refused by default and a choice is required. That is not a
 * keyboard trap, which is what WCAG 2.1 SC 2.1.2 is about: `AlertDialogCancel`
 * is a real button inside the trapped focus order, so `Tab` then `Enter`
 * dismisses the dialog and returns focus to the trigger. Pass
 * `closeOnEscape` on a non-destructive question (a "discard changes?" prompt,
 * say) where `Esc` is a convenience rather than a hazard.
 *
 * The prop is named for what it does rather than `dismissible`, because the
 * backdrop is never dismissible here and a name that sounds general would
 * invite a caller to assume it turns both off.
 */
function AlertDialog({
  closeOnEscape = false,
  onOpenChange,
  ...props
}: AlertDialogPrimitive.Root.Props & { closeOnEscape?: boolean }) {
  return (
    <AlertDialogPrimitive.Root
      data-slot="alert-dialog"
      onOpenChange={(open, eventDetails) => {
        /*
         * The consumer's handler is called first, and only for a change that is
         * actually going to happen.
         *
         * `@base-ui/react` always calls it, cancelled or not, and the two
         * orders are not the same thing here. Every controlled alert dialog in
         * this app clears its target state in `onOpenChange` — that *is* the
         * close. Calling it for a refused `Esc` would close a controlled dialog
         * whose Root had just been told to stay open: half-dismissed, with the
         * state cleared and the panel still on screen.
         */
        if (
          !open &&
          !closeOnEscape &&
          eventDetails.reason === ESCAPE_KEY_REASON
        ) {
          eventDetails.cancel()
          return
        }
        onOpenChange?.(open, eventDetails)
      }}
      {...props}
    />
  )
}

function AlertDialogTrigger({ ...props }: AlertDialogPrimitive.Trigger.Props) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  )
}

function AlertDialogPortal({ ...props }: AlertDialogPrimitive.Portal.Props) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  )
}

function AlertDialogOverlay({
  className,
  ...props
}: AlertDialogPrimitive.Backdrop.Props) {
  return (
    <AlertDialogPrimitive.Backdrop
      data-slot="alert-dialog-overlay"
      className={cn(OVERLAY_SCRIM, className)}
      {...props}
    />
  )
}

/**
 * The alert dialog surface.
 *
 * Everything a `Dialog` gets, it gets here too: portalled to `document.body`
 * and positioned `fixed` so it escapes the scroll containers it is opened from,
 * focus moved in and trapped while open, focus returned to the trigger on
 * close, and `role="alertdialog"` with `aria-labelledby` pointing at
 * `AlertDialogTitle`. `aria-modal` is added because the primitive omits it.
 */
function AlertDialogContent({
  className,
  size = "default",
  ...props
}: AlertDialogPrimitive.Popup.Props & {
  size?: "default" | "sm"
}) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Popup
        aria-modal="true"
        data-slot="alert-dialog-content"
        data-size={size}
        className={cn(
          "group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto overscroll-contain rounded-none bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          // See this file's `OVERLAY_SHADOW` comment: written, documented, and
          // unapplied — which left the most consequential surface in the package,
          // the one that interrupts, without the elevation its own argument
          // requires.
          OVERLAY_SHADOW,
          className
        )}
        {...props}
      />
    </AlertDialogPortal>
  )
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        "grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-4 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

/**
 * The icon slot above the question.
 *
 * `aria-hidden` because it is decoration: the glyph says "this is a warning"
 * in pixels, and `AlertDialogTitle` is what a screen reader reads. The state is
 * never carried by the icon alone — the title words it.
 */
function AlertDialogMedia({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      data-slot="alert-dialog-media"
      className={cn(
        "mb-2 inline-flex size-10 items-center justify-center rounded-none bg-muted sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-6",
        className
      )}
      {...props}
    />
  )
}

/** Names the dialog: `aria-labelledby` on the popup points here. */
function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn(
        "text-lg font-semibold tracking-[-0.012em] sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
        className
      )}
      {...props}
    />
  )
}

/** The consequence, in words: the popup's `aria-describedby` target. */
function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn(
        "text-sm/relaxed text-balance text-muted-foreground md:text-pretty *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

/**
 * The confirming button.
 *
 * A plain `Button`, deliberately: it does not close the dialog. An alert
 * dialog in this app is usually in front of a mutation, and a dialog that
 * vanished on click would hide the result of the thing that was just clicked.
 * Close it when the work has actually resolved.
 */
function AlertDialogAction({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      data-slot="alert-dialog-action"
      className={cn(className)}
      {...props}
    />
  )
}

/** The way out. Always present, and the keyboard route out of the dialog. */
function AlertDialogCancel({
  className,
  variant = "outline",
  size = "default",
  ...props
}: AlertDialogPrimitive.Close.Props &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      className={cn(className)}
      render={<Button variant={variant} size={size} />}
      {...props}
    />
  )
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
}
