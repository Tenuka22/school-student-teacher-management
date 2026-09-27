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
        "flex field-sizing-content min-h-16 w-full rounded-none border border-input bg-transparent px-3 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive sm:text-[0.9375rem] dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...controlProps}
    />
  )
}

export { Textarea }
