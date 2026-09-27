interface FieldA11yOptions {
  /** The current validation message; marks the control invalid when set. */
  error?: string;
  /** Whether a `FieldDescription` with `id={descriptionId(id)}` is rendered. */
  hasDescription?: boolean;
  required?: boolean;
}

export const errorId = (id: string) => `${id}-error`;
export const descriptionId = (id: string) => `${id}-description`;

/**
 * Props that tie a form control to its label, help text and error message
 * (WCAG 1.3.1, 3.3.1, 4.1.2). Spread onto the `Input`/`SelectTrigger`; pair
 * with `<FieldLabel htmlFor={id}>`, `<FieldError id={errorId(id)}>` and
 * `<Field data-invalid={…}>` so the label and border turn crimson together.
 *
 * Presentation only: field names, values and validation are untouched.
 */
export const fieldA11y = (
  id: string,
  { error, hasDescription = false, required = false }: FieldA11yOptions = {}
) => {
  const describedBy = [
    hasDescription ? descriptionId(id) : undefined,
    error ? errorId(id) : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy || undefined,
    "aria-required": required || undefined,
  } as const;
};
