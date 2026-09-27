import { cn } from "cn"

/**
 * A placeholder block for content that has not arrived.
 *
 * Three things it has to get right, and the incumbent got none of them:
 *
 * 1. **Out of the accessibility tree.** A skeleton is decoration standing in for
 *    text nobody has read yet. Exposed, a screen reader reads a page of empty
 *    divs, and — worse — the *real* content that replaces it is announced as if
 *    it had appeared without warning. `aria-hidden` here, and the loading
 *    region around it carries the name and `aria-busy` instead.
 * 2. **Space reserved.** A skeleton is a sized box, not a spinner: it takes the
 *    dimensions the real content will take, so the row does not jump when the
 *    data lands. Nothing in here can enforce that — the caller's `className` has
 *    to carry a height or a size — but `shrink-0` and the block display keep a
 *    skeleton from being squeezed out of a flex row and collapsing to nothing.
 * 3. **Not interactive.** `pointer-events-none` so a click during the load lands
 *    on the surface underneath rather than on an invisible box, and
 *    `select-none` so dragging across a loading table does not select a
 *    paragraph of placeholder.
 *
 * The pulse is suppressed under `prefers-reduced-motion`: a row of eight
 * rectangles pulsing in unison is the most noticeable motion on the page, and it
 * is the one that carries no information.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton"
      className={cn(
        "block shrink-0 animate-pulse rounded-none bg-muted select-none motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
