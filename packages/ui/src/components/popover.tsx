"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { cn } from "cn"

/** See `dialog.tsx`: one soft brand-tinted shadow, and no second hairline. */
const OVERLAY_SHADOW =
  "shadow-[0_10px_30px_-12px_rgb(1_52_5/0.28),0_2px_8px_-4px_rgb(1_52_5/0.18)]"

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

/**
 * A non-modal panel anchored to a trigger.
 *
 * Escapes its container: the content is rendered through
 * `PopoverPrimitive.Portal` into `document.body` and the positioner is
 * `position: fixed` with a transform, so a popover opened from inside an
 * `overflow: auto` table cell, a `SidebarContent` scroller or a `Sheet` is not
 * clipped by it. That matters more here than in a typical app — the records
 * screens here are almost entirely scroll containers.
 *
 * Not modal, and deliberately not pretending to be: there is no focus trap, no
 * scroll lock and no `aria-modal`. Focus moves to the first tabbable element
 * inside on open, `Esc` dismisses, and dismissing returns focus to the trigger.
 * Render a `PopoverTitle` — the popup is `role="dialog"`, and a dialog with no
 * accessible name is announced as an unlabelled dialog.
 */
function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "z-50 flex w-72 origin-(--transform-origin) flex-col gap-2.5 rounded-none bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-1 text-sm", className)}
      {...props}
    />
  )
}

/** Names the popover: the popup's `aria-labelledby` points here. */
function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn("text-sm font-semibold", className)}
      {...props}
    />
  )
}

/** The popover's `aria-describedby` target. */
function PopoverDescription({
  className,
  ...props
}: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
}
