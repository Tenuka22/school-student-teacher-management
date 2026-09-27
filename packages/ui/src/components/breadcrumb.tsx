import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cn } from "cn"
import { IconChevronRight, IconDots } from "@tabler/icons-react"

/**
 * The trail.
 *
 * A real `<nav>` — the landmark a screen-reader user jumps to with
 * `landmark` navigation — named "Breadcrumb" rather than the incumbent's
 * lowercase "breadcrumb", which read as a description of the markup instead of
 * the name of the thing.
 */
function Breadcrumb({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      aria-label="Breadcrumb"
      data-slot="breadcrumb"
      className={cn(className)}
      {...props}
    />
  )
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn(
        "flex flex-wrap items-center gap-1.5 text-sm wrap-break-word text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

/** A crumb that navigates. Render a `Link` through `render` to keep it one tab stop. */
function BreadcrumbLink({
  className,
  render,
  ...props
}: useRender.ComponentProps<"a">) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn("transition-colors hover:text-foreground", className),
      },
      props
    ),
    render,
    state: {
      slot: "breadcrumb-link",
    },
  })
}

/**
 * The last crumb: where you are.
 *
 * `aria-current="page"` is the whole job. The incumbent also gave this `span`
 * `role="link"` and `aria-disabled="true"`, which is worse than nothing — a
 * `span` is not focusable and has no `href`, so it announced a control that
 * cannot be operated. It is a label, and `aria-current` says so.
 */
function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-page"
      aria-current="page"
      className={cn("font-normal text-foreground", className)}
      {...props}
    />
  )
}

/**
 * The divider between crumbs. `aria-hidden` and out of the list, so a screen
 * reader hears "Inventory, Ledger" rather than "Inventory, separator, Ledger".
 */
function BreadcrumbSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("[&>svg]:size-3.5", className)}
      {...props}
    >
      {children ?? <IconChevronRight aria-hidden="true" />}
    </li>
  )
}

/**
 * Collapsed crumbs.
 *
 * The `aria-hidden` the incumbent put on this wrapper also hid the `sr-only`
 * "More" inside it, so the ellipsis announced nothing at all. The wrapper is
 * exposed and the *glyph* is hidden instead, which is the arrangement the
 * `sr-only` span was written for in the first place.
 */
function BreadcrumbEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      className={cn(
        "flex size-5 items-center justify-center [&>svg]:size-4",
        className
      )}
      {...props}
    >
      <IconDots aria-hidden="true" />
      <span className="sr-only">More</span>
    </span>
  )
}

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
}
