import * as React from "react"
import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar"
import { cn } from "cn"

/**
 * A person, as a circle.
 *
 * The edge is a single `ring-1` on the root. The incumbent drew it with an
 * `::after` pseudo-element in `mix-blend-darken` mode, which is a blend of the
 * image with whatever happened to be behind it: on the cream page it darkened
 * the image, on the deep green sidebar it did something else entirely, and it
 * needed a `mix-blend-lighten` twin for a dark theme that does not exist. One
 * hairline does the same job and is the same colour everywhere.
 */
function Avatar({
  className,
  size = "default",
  ...props
}: AvatarPrimitive.Root.Props & {
  size?: "default" | "sm" | "lg"
}) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={cn(
        "group/avatar relative flex size-8 shrink-0 overflow-hidden rounded-full ring-1 ring-border select-none data-[size=lg]:size-10 data-[size=sm]:size-6",
        className
      )}
      {...props}
    />
  )
}

/**
 * The photograph.
 *
 * `alt` defaults to the empty string: an avatar in this app is always beside
 * the person's name, so the image repeats what the text already says, and an
 * `<img>` with *no* `alt` at all is worse than a redundant one — assistive
 * technology falls back to announcing the file path. Pass a real `alt` when the
 * avatar is the only thing naming the person.
 */
function AvatarImage({
  alt = "",
  className,
  ...props
}: AvatarPrimitive.Image.Props) {
  return (
    <AvatarPrimitive.Image
      alt={alt}
      data-slot="avatar-image"
      className={cn("aspect-square size-full object-cover", className)}
      {...props}
    />
  )
}

/**
 * The initials, shown when there is no photograph — or when there is one and it
 * fails to load, which on a school LAN is not rare.
 */
function AvatarFallback({
  className,
  ...props
}: AvatarPrimitive.Fallback.Props) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-muted text-sm text-muted-foreground group-data-[size=sm]/avatar:text-xs",
        className
      )}
      {...props}
    />
  )
}

/**
 * A marker on the avatar's corner — online, in charge, verified. It carries no
 * text of its own, so a caller that uses it for state has to name the state
 * somewhere a screen reader will read it; the badge is pixels.
 */
function AvatarBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background select-none",
        "group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
        "group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
        "group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2",
        className
      )}
      {...props}
    />
  )
}

function AvatarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        "group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
        className
      )}
      {...props}
    />
  )
}

/** The "+4" tile. The count is the content, so it is never `aria-hidden`. */
function AvatarGroupCount({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3",
        className
      )}
      {...props}
    />
  )
}

export {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarBadge,
}
