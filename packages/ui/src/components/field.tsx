"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

import { Label } from "@school-student-teacher-management/ui/components/label"
import { Separator } from "@school-student-teacher-management/ui/components/separator"

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect

function FieldSet({ className, ...props }: React.ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn(
        "flex flex-col gap-4 has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3",
        className
      )}
      {...props}
    />
  )
}

function FieldLegend({
  className,
  variant = "legend",
  ...props
}: React.ComponentProps<"legend"> & { variant?: "legend" | "label" }) {
  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      className={cn(
        "mb-2.5 font-semibold data-[variant=label]:text-sm data-[variant=legend]:text-base",
        className
      )}
      {...props}
    />
  )
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn(
        "group/field-group @container/field-group flex w-full flex-col gap-5 data-[slot=checkbox-group]:gap-3 *:data-[slot=field-group]:gap-4",
        className
      )}
      {...props}
    />
  )
}

const fieldVariants = cva(
  "group/field flex w-full gap-2 data-[invalid=true]:text-destructive",
  {
    variants: {
      orientation: {
        vertical: "flex-col *:w-full [&>.sr-only]:w-auto",
        horizontal:
          "flex-row items-center has-[>[data-slot=field-content]]:items-start *:data-[slot=field-label]:flex-auto has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
        responsive:
          "flex-col *:w-full @md/field-group:flex-row @md/field-group:items-center @md/field-group:*:w-auto @md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:*:data-[slot=field-label]:flex-auto [&>.sr-only]:w-auto @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
      },
    },
    defaultVariants: {
      orientation: "vertical",
    },
  }
)

/**
 * Everything a control needs to describe itself to assistive technology
 * without every form in the app re-deriving it by hand.
 *
 * A `Field` owns three things and hands them to whichever control claims it:
 * an `id` for label association, `aria-invalid` / `aria-required` from the
 * field's own state, and an `aria-describedby` list built from every
 * `FieldDescription` and `FieldError` rendered inside it. Anything the caller
 * passes explicitly always wins, so the 200-odd forms that already wire this
 * up by hand keep their own ids and descriptions.
 */
type FieldContextValue = {
  /** Id offered to the first control that claims it. */
  controlId: string
  /** Id of the control actually rendered, once one has bound itself. */
  boundControlId: string | undefined
  invalid: boolean
  required: boolean
  disabled: boolean
  /** Space-separated ids of every description and error in this field. */
  describedBy: string
  claimControlId: () => string | undefined
  bindControl: (id: string) => void
  unbindControl: (id: string) => void
  registerDescribedBy: (id: string) => () => void
}

const FieldContext = createContext<FieldContextValue | null>(null)

function useFieldContext() {
  return useContext(FieldContext)
}

/**
 * `data-invalid` is written by hand all over the app as both `true` and the
 * string `"true"`, so read it as an attribute rather than a truthy value:
 * `data-invalid={false}` must not light the error ring up.
 */
function isInvalidAttribute(value: unknown) {
  if (value === true) {
    return true
  }

  return typeof value === "string" && (value === "" || value === "true")
}

function Field({
  className,
  orientation = "vertical",
  invalid,
  required = false,
  disabled = false,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof fieldVariants> & {
    /**
     * Marks the field as failed. `data-invalid` is read as an equivalent so
     * existing call sites keep working; the prop exists so the styling hook
     * and the ARIA state cannot drift apart.
     */
    invalid?: boolean
    required?: boolean
    disabled?: boolean
  }) {
  const baseId = useId().replace(/[^\dA-Za-z_-]/g, "")
  const controlId = `field-${baseId}`
  // `data-invalid` is a hyphenated JSX attribute, so TypeScript lets call
  // sites write it without it being declared on the props type.
  const dataInvalid = (props as { "data-invalid"?: unknown })["data-invalid"]
  const isInvalid = invalid ?? isInvalidAttribute(dataInvalid)

  const [boundControlId, setBoundControlId] = useState<string | undefined>(
    undefined
  )
  const [describedByIds, setDescribedByIds] = useState<string[]>([])
  const claimedRef = useRef(false)

  const bindControl = useCallback((id: string) => {
    setBoundControlId((current) => (current === id ? current : id))
  }, [])

  // A field that renders its control conditionally must not keep pointing a
  // label at an id that is no longer in the document.
  const unbindControl = useCallback((id: string) => {
    setBoundControlId((current) => (current === id ? undefined : current))
  }, [])

  const registerDescribedBy = useCallback((id: string) => {
    setDescribedByIds((current) =>
      current.includes(id) ? current : [...current, id]
    )

    return () => {
      setDescribedByIds((current) => current.filter((entry) => entry !== id))
    }
  }, [])

  const claimControlId = useCallback(() => {
    // Only the first control in a field may take the id. A field with a date
    // range and no explicit ids would otherwise emit the same id twice, which
    // breaks the label association for both.
    if (claimedRef.current) {
      return undefined
    }

    claimedRef.current = true
    return controlId
  }, [controlId])

  const contextValue = useMemo<FieldContextValue>(
    () => ({
      controlId,
      boundControlId,
      invalid: isInvalid,
      required,
      disabled,
      describedBy: describedByIds.join(" "),
      claimControlId,
      bindControl,
      unbindControl,
      registerDescribedBy,
    }),
    [
      controlId,
      boundControlId,
      isInvalid,
      required,
      disabled,
      describedByIds,
      claimControlId,
      bindControl,
      unbindControl,
      registerDescribedBy,
    ]
  )

  return (
    <FieldContext.Provider value={contextValue}>
      <div
        role="group"
        data-slot="field"
        {...props}
        data-orientation={orientation}
        data-invalid={isInvalid || undefined}
        data-disabled={disabled || undefined}
        className={cn(fieldVariants({ orientation }), className)}
      />
    </FieldContext.Provider>
  )
}

function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn(
        "group/field-content flex flex-1 flex-col gap-0.5 leading-snug",
        className
      )}
      {...props}
    />
  )
}

/**
 * A real `<label for>`. When the caller does not name the control, the field's
 * own control is targeted, so a form that forgets `htmlFor` still announces.
 */
function FieldLabel({
  className,
  required,
  children,
  htmlFor,
  ...props
}: React.ComponentProps<typeof Label> & { required?: boolean }) {
  const field = useFieldContext()
  const showMark = required === true
  const announceRequired = required ?? field?.required ?? false
  // Only a control that has actually bound itself is named. Pointing `for` at
  // the field's offered id before any control has claimed it would emit a
  // `for` attribute with nothing behind it, which is a worse defect than the
  // missing association this is here to repair.
  const resolvedHtmlFor = htmlFor ?? field?.boundControlId

  return (
    <Label
      data-slot="field-label"
      htmlFor={resolvedHtmlFor}
      className={cn(
        "group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50 has-data-checked:border-primary/30 has-data-checked:bg-primary/5 has-[>[data-slot=field]]:rounded-none has-[>[data-slot=field]]:border has-[>[data-slot=field]]:not-has-[:disabled,[data-disabled]]:hover:bg-muted/50 has-[>[data-slot=field]]:has-[:focus-visible]:border-ring has-[>[data-slot=field]]:has-[:focus-visible]:ring-1 has-[>[data-slot=field]]:has-[:focus-visible]:ring-ring *:data-[slot=field]:p-2 dark:has-data-checked:border-primary/20 dark:has-data-checked:bg-primary/10",
        "has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col",
        className
      )}
      {...props}
    >
      {children}
      {showMark ? (
        <span aria-hidden="true" data-slot="field-required-mark">
          *
        </span>
      ) : null}
      {announceRequired ? <span className="sr-only">{" (required)"}</span> : null}
    </Label>
  )
}

function FieldTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-label"
      className={cn(
        "flex w-fit items-center gap-2 text-sm/relaxed group-data-[disabled=true]/field:opacity-50",
        className
      )}
      {...props}
    />
  )
}

/**
 * Registers itself with the enclosing `Field` so the control's
 * `aria-describedby` reaches it, whether or not the caller gave it an id.
 */
function FieldDescription({ className, id, ...props }: React.ComponentProps<"p">) {
  const field = useFieldContext()
  const registerDescribedBy = field?.registerDescribedBy
  const resolvedId = id ?? (field ? `${field.controlId}-description` : undefined)

  useIsomorphicLayoutEffect(() => {
    if (!registerDescribedBy || !resolvedId) {
      return
    }

    return registerDescribedBy(resolvedId)
  }, [registerDescribedBy, resolvedId])

  return (
    <p
      data-slot="field-description"
      id={resolvedId}
      className={cn(
        "text-left text-sm/relaxed leading-normal font-normal text-muted-foreground group-has-data-horizontal/field:text-balance [[data-variant=legend]+&]:-mt-1.5",
        "last:mt-0 nth-last-2:-mt-1",
        "[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        className
      )}
      {...props}
    />
  )
}

function FieldSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  children?: React.ReactNode
}) {
  return (
    <div
      data-slot="field-separator"
      data-content={!!children}
      className={cn(
        "relative -my-2 h-5 text-xs group-data-[variant=outline]/field-group:-mb-2",
        className
      )}
      {...props}
    >
      <Separator className="absolute inset-0 top-1/2" />
      {children && (
        <span
          className="relative mx-auto block w-fit bg-background px-2 text-muted-foreground"
          data-slot="field-separator-content"
        >
          {children}
        </span>
      )}
    </div>
  )
}

function FieldError({
  className,
  children,
  errors,
  id,
  ...props
}: React.ComponentProps<"div"> & {
  errors?: Array<{ message?: string } | undefined>
}) {
  const field = useFieldContext()
  const registerDescribedBy = field?.registerDescribedBy
  const resolvedId = id ?? (field ? `${field.controlId}-error` : undefined)

  const content = useMemo(() => {
    if (children) {
      return children
    }

    if (!errors?.length) {
      return null
    }

    const uniqueErrors = [
      ...new Map(errors.map((error) => [error?.message, error])).values(),
    ]

    if (uniqueErrors?.length == 1) {
      return uniqueErrors[0]?.message
    }

    return (
      <ul className="ml-4 flex list-disc flex-col gap-1">
        {uniqueErrors.map(
          (error, index) =>
            error?.message && <li key={index}>{error.message}</li>
        )}
      </ul>
    )
  }, [children, errors])

  // Keyed on a boolean rather than on `content`: the rendered error can be a
  // fresh element on every pass, and re-running the effect would unregister
  // and re-register the id, which is a state change, which re-renders, which
  // builds a fresh element.
  const hasContent = content !== null

  useIsomorphicLayoutEffect(() => {
    if (!hasContent || !registerDescribedBy || !resolvedId) {
      return
    }

    return registerDescribedBy(resolvedId)
  }, [hasContent, registerDescribedBy, resolvedId])

  if (!content) {
    return null
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn("text-sm font-medium text-destructive", className)}
      {...props}
    >
      {content}
    </div>
  )
}

type FieldControlAriaProps = {
  id?: string
  disabled?: boolean
  "aria-invalid"?: React.AriaAttributes["aria-invalid"]
  "aria-required"?: React.AriaAttributes["aria-required"]
  "aria-describedby"?: string
}

function mergeDescribedBy(explicit: string | undefined, auto: string | undefined) {
  if (!auto) {
    return explicit
  }

  if (!explicit) {
    return auto
  }

  const ids = new Set([
    ...explicit.split(/\s+/).filter(Boolean),
    ...auto.split(/\s+/).filter(Boolean),
  ])

  return [...ids].join(" ")
}

/**
 * Applied by every control in this package (`Input`, `Textarea`,
 * `SelectTrigger`, `Checkbox`, `ComboboxInput`) so a form does not have to
 * repeat the association. Every prop the caller supplies is left alone; the
 * field only fills in what was missing.
 *
 * Pass `enabled={false}` for an input that must not claim the field's id — a
 * hidden carrier input, for instance, which would otherwise steal the label.
 */
function useFieldControlProps<T extends FieldControlAriaProps>(
  props: T,
  enabled = true
): T {
  const field = useFieldContext()
  const claimedIdRef = useRef<string | undefined>(undefined)
  const bindControl = field?.bindControl
  const unbindControl = field?.unbindControl

  if (enabled && props.id === undefined && claimedIdRef.current === undefined) {
    claimedIdRef.current = field?.claimControlId()
  }

  const controlId = enabled ? (props.id ?? claimedIdRef.current) : props.id

  useIsomorphicLayoutEffect(() => {
    if (!controlId) {
      return
    }

    bindControl?.(controlId)

    return () => {
      unbindControl?.(controlId)
    }
  }, [bindControl, unbindControl, controlId])

  if (!enabled) {
    return props
  }

  return {
    ...props,
    id: controlId,
    disabled: props.disabled ?? field?.disabled,
    "aria-invalid":
      props["aria-invalid"] ?? (field?.invalid ? true : undefined),
    "aria-required":
      props["aria-required"] ?? (field?.required ? true : undefined),
    "aria-describedby": mergeDescribedBy(
      props["aria-describedby"],
      field?.describedBy
    ),
  }
}

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
  useFieldContext,
  useFieldControlProps,
}
