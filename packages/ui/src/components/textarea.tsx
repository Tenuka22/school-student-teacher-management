import * as React from "react"
import { cn } from "cn"

import { useFieldControlProps } from "@school-student-teacher-management/ui/components/field"

const placeholderInk = "placeholder:text-[color-mix(in_oklab,var(--foreground)_72%,transparent)]"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  const controlProps = useFieldControlProps(props)

  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-none border border-input bg-transparent px-2.5 py-2 text-xs transition-colors outline-none",
        placeholderInk,
        "focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 read-only:cursor-default read-only:bg-muted/60 read-only:text-muted-foreground",
        "aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/40 data-[invalid=true]:border-destructive data-[invalid=true]:ring-1 data-[invalid=true]:ring-destructive/40",
        "md:text-xs dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...controlProps}
    />
  )
}

export { Textarea }
