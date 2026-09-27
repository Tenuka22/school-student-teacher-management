"use client"

import { Separator as SeparatorPrimitive } from "@base-ui/react/separator"
import { cn } from "cn"

/**
 * A rule between two things.
 *
 * `@base-ui/react` renders `role="separator"` with `aria-orientation`, so this
 * is a real separator and not a `<div>` with a background: assistive technology
 * can tell that a boundary is here.
 *
 * Which of the two it should be is the caller's, and the distinction matters.
 * A separator that divides *groups of content* is announced. A separator drawn
 * only to stop two blocks touching — the hairline under a card header, the rule
 * inside a table — should be passed `aria-hidden`, because announcing "separator"
 * between two paragraphs is noise. That is why the prop is passed straight
 * through rather than defaulted here: a wrong default is louder than a missing
 * one.
 */
function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch",
        className
      )}
      {...props}
    />
  )
}

export { Separator }
