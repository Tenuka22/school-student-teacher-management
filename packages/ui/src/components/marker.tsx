import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/**
 * An inline annotation: a note, a caption, or a state called out in running
 * text.
 *
 * `variant` is the *shape* — how the marker sits in the line. `tone` is the
 * *state*, added alongside it rather than folded into it, so a caller can have
 * a `separator` that is also `warning` without either axis knowing about the
 * other.
 *
 * The default tone is `text-foreground/70` (5.03:1 on `--card`, 5.59:1 on the
 * page) and not `--muted-foreground`, which measures 4.02:1 on the same grounds
 * and so fails AA at 12px. `tone="muted"` still exists for genuinely
 * de-emphasised text — a timestamp, a provenance note — where the lower weight
 * is the point; the token defect behind it is a `globals.css` matter, not
 * something to spread by default.
 *
 * A tone is never the only channel: `MarkerIcon` carries a glyph and
 * `MarkerContent` carries the word. Colour on its own would leave the state
 * unreadable to a good fraction of the staff, and in a records tool the state is
 * the message.
 */
const markerVariants = cva(
  "group/marker relative flex min-h-4 w-full items-center gap-2 text-left text-xs [&_svg:not([class*='size-'])]:size-3.5 [a]:underline [a]:underline-offset-3 [a]:hover:text-foreground",
  {
    variants: {
      variant: {
        default: "",
        separator:
          "before:mr-1 before:h-px before:min-w-0 before:flex-1 before:bg-border after:ml-1 after:h-px after:min-w-0 after:flex-1 after:bg-border",
        border: "border-b border-border pb-2",
      },
      tone: {
        default: "text-foreground/70",
        muted: "text-muted-foreground",
        success: "text-success",
        warning: "text-warning-ink",
        destructive: "text-destructive",
      },
    },
    defaultVariants: {
      tone: "default",
    },
  }
)

function Marker({
  className,
  variant = "default",
  tone,
  render,
  ...props
}: useRender.ComponentProps<"div"> & VariantProps<typeof markerVariants>) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(markerVariants({ variant, tone, className })),
      },
      props
    ),
    render,
    state: {
      slot: "marker",
      variant,
      tone: tone ?? "default",
    },
  })
}

/**
 * The marker's glyph.
 *
 * `aria-hidden` on purpose: it is the *shape* half of the state channel, and it
 * sits beside the word that says the same thing. A screen reader announcing
 * "triangle icon" before "Under repair" is noise, and the state is still fully
 * present without it.
 */
function MarkerIcon({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="marker-icon"
      aria-hidden="true"
      className={cn(
        "size-3.5 shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className
      )}
      {...props}
    />
  )
}

/** The marker's text. This is the half of the state a screen reader reads. */
function MarkerContent({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="marker-content"
      className={cn(
        "min-w-0 wrap-break-word group-data-[variant=separator]/marker:flex-none group-data-[variant=separator]/marker:text-center *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Marker, MarkerIcon, MarkerContent, markerVariants }
