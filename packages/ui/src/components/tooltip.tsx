"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import { cn } from "cn"

/**
 * The open state and the id that ties a trigger to its tooltip text.
 *
 * `@base-ui/react@1.8.0` gives a tooltip no role and wires no
 * `aria-describedby` — its own documentation describes the component as "a hint
 * for sighted users", and the accessible name is expected to live on the
 * trigger. That is the right default (a name that appears on hover is not a
 * name), but it leaves the *description* unreachable: a screen-reader user
 * never hears "Period 3" on the collapsed sidebar's third button.
 *
 * So the pair is tied together here, the standard tooltip arrangement: the
 * popup carries `role="tooltip"` and a stable id, and the trigger points at it
 * with `aria-describedby` **only while the tooltip is open** — a permanent
 * reference to an unmounted element is a dangling IDREF, which is worse than
 * none. The trigger still has to carry its own accessible name; this adds a
 * description to it, it does not become one.
 */
type TooltipContextValue = { id: string; open: boolean }

const TooltipContext = React.createContext<TooltipContextValue | null>(null)

function useTooltipContext(): TooltipContextValue | null {
  return React.useContext(TooltipContext)
}

/**
 * The hover/focus delay before a tooltip opens, in milliseconds.
 *
 * The incumbent default was `0`, which makes a tooltip flash on every pass of
 * the pointer across a toolbar — and the sidebar is a column of them. 300ms is
 * long enough to mean "I meant to hover there" and short enough to feel
 * immediate. Keyboard focus is unaffected: Base UI opens on focus without the
 * hover delay.
 */
const TOOLTIP_OPEN_DELAY = 300

function TooltipProvider({
  delay = TOOLTIP_OPEN_DELAY,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      {...props}
    />
  )
}

type TooltipOnOpenChange = NonNullable<TooltipPrimitive.Root.Props["onOpenChange"]>
type TooltipEventDetails = Parameters<TooltipOnOpenChange>[1]

function Tooltip({ onOpenChange, ...props }: TooltipPrimitive.Root.Props) {
  const id = React.useId()
  const [open, setOpen] = React.useState(false)

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean, eventDetails: TooltipEventDetails) => {
      setOpen(nextOpen)
      onOpenChange?.(nextOpen, eventDetails)
    },
    [onOpenChange]
  )

  return (
    <TooltipContext.Provider value={{ id, open }}>
      <TooltipPrimitive.Root
        data-slot="tooltip"
        onOpenChange={handleOpenChange}
        {...props}
      />
    </TooltipContext.Provider>
  )
}

function TooltipTrigger({
  ...props
}: TooltipPrimitive.Trigger.Props) {
  const context = useTooltipContext()

  return (
    <TooltipPrimitive.Trigger
      aria-describedby={context?.open ? context.id : undefined}
      data-slot="tooltip-trigger"
      {...props}
    />
  )
}

/**
 * The tooltip text.
 *
 * Portalled to `document.body` and positioned `fixed`, so it is never clipped
 * by the scroll container it was opened from. `Esc` dismisses it, and there is
 * no focus trap — a tooltip must never hold focus, or WCAG 2.1 SC 2.1.2 turns a
 * hint into a trap.
 */
function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  const context = useTooltipContext()

  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-none bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pr-1.5",
            "data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
            "**:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-none",
            "data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:animate-none",
            className
          )}
          {...props}
          id={context?.id ?? props.id}
          role="tooltip"
        >
          {children}
          <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-none bg-foreground fill-foreground data-[side=bottom]:top-1 data-[side=inline-end]:top-1/2! data-[side=inline-end]:-left-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:top-1/2! data-[side=inline-start]:-right-1 data-[side=inline-start]:-translate-y-1/2 data-[side=left]:top-1/2! data-[side=left]:-right-1 data-[side=left]:-translate-y-1/2 data-[side=right]:top-1/2! data-[side=right]:-left-1 data-[side=right]:-translate-y-1/2 data-[side=top]:-bottom-2.5" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
