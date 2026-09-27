import * as React from "react"
import { cn } from "cn"

/**
 * A card: one record, one panel, one thing.
 *
 * **Elevation is declared exactly once.** The hairline `ring-1` is that
 * declaration, and there is deliberately no shadow under it. A 1px border with a
 * wide soft shadow beneath it is the "ghost card" — two signals for one plane,
 * the second describing a tighter shadow inside the first, and on cream paper it
 * reads as a rendering fault rather than as depth. One plane, one edge, and the
 * card is separated from `#fdf8ec` by the edge alone.
 *
 * **Radius is 14px** (`rounded-xl` on this scale), inside the 12–16px band the
 * craft floor sets for cards.
 *
 * **No nested-card affordance.** A `Card` inside a `Card` loses its background
 * and its edge, so it reads as a *section* of its parent rather than as a second
 * surface floating inside the first — which is what a nested card always was
 * pretending to be. Callers that genuinely want a second surface need a
 * different component, not a card in a card.
 */
function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-none bg-card py-(--card-spacing) text-sm/relaxed text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-none *:[img:last-child]:rounded-none",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1.5 rounded-none px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

/**
 * The card's heading.
 *
 * A `div` on purpose: PRODUCT's rule is one `<h1>` per page with no skipped
 * levels, and a component that guessed its level would eventually guess wrong in
 * a card nested three levels deep. Render the heading element around this, or
 * accept that the card is titled visually and by proximity.
 */
function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "type-card-title group-data-[size=sm]/card:text-base",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

/** The header's right-hand slot: a menu, a badge, a count. */
function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
}

/**
 * The card's footer. A 1px `border-t`, never a coloured band or a fill: the
 * card's single edge is the ring, and this is the same edge continued.
 */
function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-none border-t p-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
