import * as React from "react"
import { cn } from "cn"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        // Named group: a `Field` carries `group/field`, and Tailwind matches
        // class tokens exactly, so the unnamed `group-data-*` variant could
        // never see it. A label inside a disabled field now greys out.
        "flex items-center gap-2 text-xs leading-none select-none group-data-[disabled=true]/field:pointer-events-none group-data-[disabled=true]/field:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
