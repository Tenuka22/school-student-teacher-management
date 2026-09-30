import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

import { useFieldControlProps } from "@school-student-teacher-management/ui/components/field"

/**
 * Placeholder ink, not `--muted-foreground`.
 *
 * `--muted-foreground` is the brand green at 60% alpha, which measures 5.85:1
 * on the cream page but only **2.46:1** on the `bg-accent/20` a control can
 * sit on (the `Borrowed` badge ground in the inventory register) — a
 * placeholder nobody can read. 72% of `--foreground` clears 4.5:1 on the
 * cream page (5.73:1), on `--card`, and on that same `bg-accent/20` (5.96:1),
 * which is the worst ground any control in this app is put on.
 */
const placeholderInk = "placeholder:text-[color-mix(in_oklab,var(--foreground)_72%,transparent)]"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  // A hidden carrier input must not take the field's id: the visible control
  // would then lose its label association.
  const controlProps = useFieldControlProps(props, type !== "hidden")

  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-none border border-input bg-transparent px-3 py-1 text-base transition-colors outline-none pointer-coarse:h-10 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        // The readable placeholder, not `placeholder:text-muted-foreground` this
        // class list used to carry. Both spellings were in this file for a while —
        // the argument for the mix is in the comment above and the token it
        // replaced measures 2.46:1 on `bg-accent/20`, so the unapplied constant
        // was the finding and the applied class was the bug.
        placeholderInk,
        "focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive sm:text-[0.9375rem] dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...controlProps}
    />
  )
}

export { Input }
