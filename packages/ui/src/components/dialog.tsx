import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"

import { Button } from "@school-student-teacher-management/ui/components/button"
import { IconX } from "@tabler/icons-react"

/**
 * The one shadow every floating surface in this package uses.
 *
 * Elevation is declared exactly once per surface: a soft, brand-tinted shadow
 * and nothing else. The incumbent paired `ring-1 ring-foreground/10` *under*
 * `shadow-md`, which is the "ghost card" the craft floor bans — two elevation
 * signals describing one plane, and the hairline read as a second, tighter
 * shadow. Overlays are the one place a soft shadow is load-bearing: a popover or
 * a dialog on cream paper with a hairline only is nearly invisible.
 *
 * The colour is `--foreground` (deep green) rather than black so the shadow
 * belongs to the brand instead of greying the cream out.
 */
const OVERLAY_SHADOW =
  "shadow-[0_10px_30px_-12px_rgb(1_52_5/0.28),0_2px_8px_-4px_rgb(1_52_5/0.18)]"

/**
 * The scrim behind a modal surface.
 *
 * `--foreground` at 20% rather than the incumbent's flat `black/10`. A 10% black
 * wash over `#fdf8ec` is a barely-there grey; the brand's own green at the same
 * weight is a legible, on-brand separation and keeps the cream reading as cream
 * underneath it. The overlay stays a *ground* change, not a colour statement.
 */
const OVERLAY_SCRIM =
  "fixed inset-0 isolate z-50 bg-foreground/20 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:duration-0 motion-reduce:animate-none"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(OVERLAY_SCRIM, className)}
      {...props}
    />
  )
}

/**
 * The dialog surface.
 *
 * Three things are load-bearing here and all three are easy to lose:
 *
 * 1. **Focus.** `@base-ui/react` puts the popup inside a `FloatingFocusManager`
 *    with `modal` on and `returnFocus` on, so focus moves to the first tabbable
 *    element on open, is trapped for as long as the dialog is open, and returns
 *    to the trigger element on close. Nothing here has to re-implement that;
 *    what this component must not do is break it.
 * 2. **Announcement.** `Dialog.Popup` sets `role="dialog"` and wires
 *    `aria-labelledby`/`aria-describedby` to whatever `DialogTitle` and
 *    `DialogDescription` register — but it does **not** set `aria-modal`, so a
 *    screen reader is told about a dialog it is still allowed to leave. It is
 *    set here, and it stays overridable for the one case that needs it: a
 *    non-modal dialog (`<Dialog modal={false}>`) must pass `aria-modal={false}`.
 * 3. **Escape.** The popup is portalled to `document.body` and positioned
 *    `fixed`, so it escapes every `overflow: auto`/`hidden` ancestor — the
 *    records tables and scroll panes in this app are full of them.
 */
function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        aria-modal="true"
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto overscroll-contain rounded-none bg-popover p-4 text-sm/relaxed text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <IconX aria-hidden="true" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1 text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

/**
 * The dialog's accessible name.
 *
 * `Dialog.Popup` picks this element's id up and writes it to the popup's
 * `aria-labelledby`; without one, the dialog is announced as an unlabelled
 * dialog, which is the single most common cause of "what is this box?" in a
 * screen reader. Every dialog in this app must render one.
 */
function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg font-semibold tracking-[-0.012em]", className)}
      {...props}
    />
  )
}

/**
 * The dialog's accessible description, and the paragraph `aria-describedby`
 * points at. Optional, but a destructive or irreversible dialog should carry one
 * that names the consequence.
 */
function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm/relaxed text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
