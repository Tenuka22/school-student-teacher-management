"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { cn } from "cn"
import { IconCheck } from "@tabler/icons-react"

import { useFieldControlProps } from "@school-student-teacher-management/ui/components/field"

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  const controlProps = useFieldControlProps(props)

  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "group/checkbox peer relative flex size-4 shrink-0 items-center justify-center rounded-none border border-input bg-background transition-colors outline-none group-has-disabled/field:opacity-50 group-has-[:focus-visible]/field-label:ring-0 group-has-[:focus-visible]/field-label:not-data-checked:border-input after:absolute after:-inset-x-3 after:-inset-y-2",
        "hover:not-data-checked:bg-muted",
        "focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:inset-ring-1 focus-visible:inset-ring-current",
        "disabled:cursor-not-allowed disabled:opacity-50 data-readonly:cursor-default",
        "aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/40 aria-invalid:aria-checked:border-primary data-[invalid=true]:border-destructive data-[invalid=true]:ring-1 data-[invalid=true]:ring-destructive/40",
        "data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground group-has-[:focus-visible]/field-label:data-checked:border-primary",
        "dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:data-checked:bg-primary",
        className
      )}
      {...controlProps}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <IconCheck className="group-data-[indeterminate]/checkbox:hidden" />
        {/* A mixed selection is not a full selection: a tick here would tell
            the user "select all" has happened when only some rows are chosen. */}
        <span
          aria-hidden="true"
          data-slot="checkbox-indeterminate-mark"
          className="hidden h-0.5 w-2 rounded-full bg-current group-data-[indeterminate]/checkbox:block"
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
