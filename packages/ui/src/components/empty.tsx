import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/**
 * Wiring that lets `EmptyTitle` name the empty state.
 *
 * `Empty` is a plain `div`, so an id on the title would describe nothing. This
 * turns the pair into a named `role="group"`: a screen-reader user moving
 * through a page of cards can be told "Borrowed equipment, empty" instead of
 * landing on an unlabelled box, and the label is the *title* — the sentence
 * that says what belongs in this slot.
 *
 * `group` and not `region`: this is a grouping role, not a landmark, and a
 * landmark per empty state would flood the landmark list of a records page.
 */
type EmptyContextValue = {
  titleId: string
  registerTitle: () => void
}

const EmptyContext = React.createContext<EmptyContextValue | null>(null)

/**
 * An empty state.
 *
 * The component's job is structure, because the copy is the caller's: an empty
 * state that only says "nothing here" has taught nobody anything. The shape
 * below is the one that teaches, and every part of it has a job —
 *
 * - `EmptyMedia` — an icon, decorative, saying only "this is a known state and
 *   not a failure";
 * - `EmptyTitle` — **what belongs in this slot**, in the words of the list it
 *   stands in for ("Borrowed equipment", "No leave requests for 2027"). It also
 *   names the group for assistive technology;
 * - `EmptyDescription` — **why it is empty and what to do about it**, which for
 *   a records tool is usually a filter ("no records for the selected year") or
 *   a rule ("custody transfers need a signed handover"), not a shrug;
 * - `EmptyContent` — the action that creates the first one, or the control that
 *   changes the filter. An empty state with no action in it is a dead end.
 *
 * `border-dashed` is left in the base deliberately: callers pair it with
 * `border` (or `border-none`) at the call site, and the dashed frame is the
 * visual half of "this is a slot waiting to be filled".
 */
function Empty({ className, ...props }: React.ComponentProps<"div">) {
  const titleId = React.useId()
  const [hasTitle, setHasTitle] = React.useState(false)
  const registerTitle = React.useCallback(() => setHasTitle(true), [])
  const context = React.useMemo<EmptyContextValue>(
    () => ({ titleId, registerTitle }),
    [titleId, registerTitle]
  )

  return (
    <EmptyContext.Provider value={context}>
      <div
        aria-labelledby={hasTitle ? titleId : undefined}
        data-slot="empty"
        role={hasTitle ? "group" : undefined}
        className={cn(
          "flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-4 rounded-none border-dashed p-6 text-center text-balance",
          className
        )}
        {...props}
      />
    </EmptyContext.Provider>
  )
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-header"
      className={cn("flex max-w-sm flex-col items-center gap-2", className)}
      {...props}
    />
  )
}

const emptyMediaVariants = cva(
  "mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "flex size-8 shrink-0 items-center justify-center rounded-none bg-muted text-foreground [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

/**
 * The icon slot.
 *
 * `aria-hidden`: the glyph is a visual signal that this is a known empty state
 * and not a failed read, and the title beside it already says what the slot is
 * for. A screen reader reading "inbox icon" before "No borrow records" is noise,
 * and the state is never carried by the icon alone.
 */
function EmptyMedia({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>) {
  return (
    <div
      aria-hidden="true"
      data-slot="empty-icon"
      data-variant={variant}
      className={cn(emptyMediaVariants({ variant, className }))}
      {...props}
    />
  )
}

/**
 * What belongs in this slot — and the accessible name of the whole empty state.
 *
 * Rendered as a `div` so it cannot break a page's heading order; a caller that
 * wants a real heading in the outline should pass an element of its own with
 * `render`-style composition, or put the heading in `EmptyHeader`.
 */
function EmptyTitle({ className, ...props }: React.ComponentProps<"div">) {
  const context = React.useContext(EmptyContext)

  React.useEffect(() => {
    context?.registerTitle()
  }, [context])

  return (
    <div
      data-slot="empty-title"
      id={props.id ?? context?.titleId}
      className={cn("font-heading text-sm font-medium text-balance", className)}
      {...props}
    />
  )
}

/**
 * Why this slot is empty, and what to do about it.
 *
 * A real `<p>`: the declared prop type has always been a paragraph's, and the
 * element was a `div` — a promise the types made and the DOM broke.
 */
function EmptyDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="empty-description"
      className={cn(
        "text-xs/relaxed text-muted-foreground [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        className
      )}
      {...props}
    />
  )
}

/**
 * The action that creates the first record, or the control that changes the
 * filter. Keep it inside the empty state: the user is looking at this panel, so
 * the button that resolves it belongs here and not in the page header.
 */
function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-content"
      className={cn(
        "flex w-full max-w-sm min-w-0 flex-col items-center gap-2.5 text-xs text-balance",
        className
      )}
      {...props}
    />
  )
}

export {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
}
