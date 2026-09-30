import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { cn } from "cn"
import { IconSelector, IconCheck, IconChevronUp, IconChevronDown } from "@tabler/icons-react"

import { useFieldControlProps } from "@school-student-teacher-management/ui/components/field"

/**
 * The ink an unfilled select's value is printed in.
 *
 * The same argument as `input.tsx`'s `placeholderInk`, and the same state this
 * file was in for a while: the class below was written out, documented, and left
 * unapplied while the trigger carried `data-placeholder:text-muted-foreground` —
 * the 2.46:1-on-`bg-accent/20` token. A select's placeholder is not decoration
 * either: it is the only thing on screen saying that nothing has been chosen yet.
 */
const selectPlaceholderInk =
  "data-placeholder:text-[color-mix(in_oklab,var(--foreground)_72%,transparent)]"

/**
 * The text inside a node, as one string.
 *
 * A `SelectItem`'s children are usually a single string, but they are allowed to
 * be an icon and a string, a fragment, or an array from a `.map()`. Anything
 * that is not text contributes nothing, because a label made of an icon is not a
 * label.
 */
function nodeText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node)
  }

  if (Array.isArray(node)) {
    return node.map(nodeText).join("")
  }

  if (React.isValidElement(node)) {
    const { children } = node.props as { children?: React.ReactNode }
    return nodeText(children)
  }

  return ""
}

/**
 * Walks the element tree and reads off every `SelectItem`'s value and its text.
 *
 * **Why the tree is walked at all**, since base-ui can resolve a selected item's
 * label on its own: it cannot, not before the popup has been opened. The options
 * live inside a portalled popup that is unmounted while the trigger is closed,
 * so base-ui has nothing to read a label out of and `Select.Value` falls back to
 * printing the **stored value**. Every closed select in this app therefore said
 * `all`, `teacher` or `2026-01-01` where it should have said "Any status",
 * "Teacher" or "2026" — the value is an internal identity, not something to show
 * a person.
 *
 * `items` is base-ui's supported answer to this (a `{ value: label }` map, or an
 * array of `{ value, label }`), and the props were always forwarded — they were
 * simply never passed, by thirty-odd call sites that render their options as
 * children. Deriving the map here means no call site can forget it, and a new one
 * gets it right by writing `<SelectItem value="x">X</SelectItem>` and nothing
 * else.
 *
 * Two things are deliberately *not* claimed. A value with no derivable text (its
 * children are a component this cannot see into, or are empty) falls back to
 * base-ui's own behaviour of printing the value, which is what happened before —
 * no worse, and never a wrong label. And an explicit `items` prop always wins,
 * so a caller who needs labels this walk cannot reach has a way to say so.
 */
function collectItemLabels(
  node: React.ReactNode,
  into: Record<string, string>
): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      collectItemLabels(child, into)
    }
    return
  }

  if (!React.isValidElement(node)) {
    return
  }

  const element = node as React.ReactElement<{
    value?: unknown
    children?: React.ReactNode
  }>

  // Recursed before the check below, because an item is almost always inside a
  // `SelectGroup` or inside the array a `.map()` returned.
  collectItemLabels(element.props.children, into)

  if (element.type !== SelectItem) {
    return
  }

  const { value } = element.props
  if (typeof value !== "string" && typeof value !== "number") {
    return
  }

  const label = nodeText(element.props.children).replace(/\s+/gu, " ").trim()
  if (label) {
    into[String(value)] = label
  }
}

/** Two label maps with the same entries, so a re-render need not change identity. */
function hasSameLabels(
  left: Record<string, string>,
  right: Record<string, string>
): boolean {
  const keys = Object.keys(left)
  if (keys.length !== Object.keys(right).length) {
    return false
  }
  return keys.every((key) => left[key] === right[key])
}

/**
 * The select's root, and the reason every select in this app shows a label.
 *
 * It is a wrapper rather than the bare primitive for two reasons, and both are
 * about the value the trigger shows.
 *
 * **1. It supplies `items`**, the map base-ui reads a selected item's label out of.
 * Without it every closed select printed its stored value — `all`, `teacher`, a
 * date — because the options live in a popup that is unmounted while the trigger is
 * closed, so there was nothing for base-ui to read a label out of.
 *
 * **2. It hides a value that has no option.** When the controlled value is not among
 * the options, base-ui has no label for it and falls back to printing the value
 * itself — which for a list keyed on database ids means the trigger shows
 * `5749b69d-09aa-4922-af62-66cd9cc16814`. That is not a cosmetic bug: it happened on
 * a teacher picker whose selected teacher had just become ineligible, so the id was
 * the only thing left to show, and an identifier is not something to put in front of
 * a person. An unmatched value is treated as **nothing selected**, which is the
 * truth: there is no option that says what this is.
 *
 * The map is held in state and refreshed **during render** when the children change,
 * rather than in an effect or a `useMemo` keyed on `children`. Both alternatives were
 * wrong: an effect would show one frame of raw values whenever the options arrive,
 * and `children` is a new array on every render of every parent, so a memo would hand
 * base-ui a new object each time and make it re-resolve a label that has not changed.
 * Adjusting state in render is the documented way to derive state from props, and it
 * settles in one extra pass.
 *
 * `string` and not `unknown` in the value type: every select in this app holds a
 * string value, and typing the value as `unknown` would push a cast onto every
 * `onValueChange` at every call site — thirty of them — to get back the narrowing
 * this line gives for free. A select that needs another kind of value is a different
 * component, and base-ui's generic root is still there underneath for whoever needs it.
 */
function Select({
  children,
  items,
  value,
  ...props
}: SelectPrimitive.Root.Props<string>) {
  const derived: Record<string, string> = {}
  collectItemLabels(children, derived)

  const [labels, setLabels] = React.useState<Record<string, string>>(derived)
  if (!hasSameLabels(labels, derived)) {
    setLabels(derived)
  }

  // `labels` is the stale map on the render that set it, and that render's output
  // is thrown away; `derived` is what the next pass will compare equal to.
  const resolved = items ?? derived;

  /*
   * Only checked when the map is ours. A caller that passed `items` knows its own
   * keys, and a caller that passed neither has no options at all — for which "no
   * option matches" is true and the placeholder is the honest thing to show.
   */
  const isUnmatched =
    !items && typeof value === "string" && value !== "" && !(value in derived);

  return (
    <SelectPrimitive.Root
      items={resolved}
      value={isUnmatched ? null : value}
      {...props}
    >
      {children}
    </SelectPrimitive.Root>
  )
}

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1", className)}
      {...props}
    />
  )
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 text-left", className)}
      {...props}
    />
  )
}

/**
 * Base UI renders this as a real `<button role="combobox">` carrying
 * `aria-expanded`, `aria-haspopup="listbox"` and `aria-controls`; typeahead,
 * Home/End, Escape and roving focus are the primitive's, not this file's.
 * What this file owns is the field association and every visual state.
 */
function SelectTrigger({
  className,
  size = "default",
  loading = false,
  disabled,
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default"
  /** Marks the list as loading, for a trigger whose options arrive async. */
  loading?: boolean
}) {
  const controlProps = useFieldControlProps({ ...props, disabled })

  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      className={cn(
        "flex w-fit items-center justify-between gap-1.5 rounded-none border border-input bg-transparent py-2 pr-2 pl-3 text-base whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive",
        // Replaces the `data-placeholder:text-muted-foreground` this list used to
        // carry; see the constant's own comment.
        selectPlaceholderInk,
        " sm:text-[0.9375rem] data-[size=default]:h-9 data-[size=sm]:h-8 pointer-coarse:data-[size=default]:h-10 data-[size=sm]:rounded-none *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...controlProps}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <IconSelector className="pointer-events-none size-4 text-muted-foreground" />
        }
      />
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn("relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-none bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 motion-reduce:transition-none motion-reduce:animate-none data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-2 py-2 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-none py-2 pr-8 pl-2 text-sm outline-hidden select-none pointer-coarse:py-2.5 focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
        }
      >
        <IconCheck aria-hidden="true" className="pointer-events-none" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <IconChevronUp aria-hidden="true" />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <IconChevronDown aria-hidden="true" />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
