import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import { Input } from "@school-student-teacher-management/ui/components/input";
import type * as React from "react";
import { useId } from "react";

/**
 * What `numeric(14,2)` accepts, written out.
 *
 * Up to twelve digits before the point and at most two after it, no sign, no
 * exponent, no separator. `purchaseValue` and `currentValue` are `numeric(14,2)`
 * columns and drizzle reads them in its default `mode: "string"` precisely so
 * that 2400.50 does not become 2400.5 on the way to a client, so a school typing
 * `1,250.00` is a **predictable** mistake rather than an unusual one — the comma
 * is what a keyboard produces from a lakh-grouped figure, and the server will
 * refuse it.
 */
const MONEY_PATTERN = /^\d{1,12}(?<decimal>\.\d{1,2})?$/u;

const MONEY_CONSTRAINT =
  "Up to 12 digits with at most 2 decimal places. No thousands separators — type 1250.00, not 1,250.00.";
const MONEY_FORMAT_ERROR =
  "This is not a valid amount. Type digits with an optional decimal point and no comma, for example 1250.00";

/**
 * The control id used when a caller supplies none.
 *
 * Kept as a literal so every existing caller — the item form, the stock dialogs, the
 * write-off — keeps exactly the DOM it had, and so a form with a single money field
 * has a readable id in the inspector rather than `:r7:`.
 *
 * **This used to be a hazard and is no longer one, which is the whole point of the
 * `id` prop below.** It was hardcoded here with no way to override it, so the write-off
 * dialog — which legitimately renders two of these against the same state, one for the
 * request and one for the certificate — put `inventory-money-field` in the document
 * twice. The second `<FieldLabel htmlFor>` then activated the *first* input, and the
 * second input had no accessible name at all. A caller that needs two must now pass
 * `id`; leaving this as the default is only safe because the override exists.
 */
const DEFAULT_FIELD_ID = "inventory-money-field";

/**
 * A money input that stays a string from the keystroke to the mutation.
 *
 * `purchaseValue` / `currentValue` are `numeric(14,2)` and reach the client as
 * strings, and the string is kept all the way through: a `number` in the middle
 * would round 2400.50 to 2400.5 and write the wrong figure into a valuation
 * column, which is the one value on this screen that has to reconcile against a
 * purchase invoice. The control is therefore `type="text"` with
 * `inputMode="decimal"` rather than `type="number"` — a number input silently
 * discards characters it dislikes, so the user gets a field that refuses to hold
 * the comma they typed instead of a message explaining why it is wrong.
 *
 * The format is validated on the face of the field rather than at submit,
 * because the alternative is a toast after a round trip for something the user
 * could have been told while they were still typing. The constraint is also
 * stated in the description, so the rule is visible before the error appears.
 *
 * **The error and both descriptions are wired to the control.** This field
 * appears in five dialogs, so it is the *reused* field a screen reader meets
 * most often, and an unassociated `FieldError` means the one message that
 * explains a rejected amount — plus the two sentences of constraint copy that
 * exist precisely so the user is not left guessing — is announced to nobody.
 * The hand-written fields in `item-dialogs.tsx` already did this; the shared
 * ones did not, which is the wrong way round.
 */
export const MoneyField: React.FC<{
  value: string;
  onChange: (value: string) => void;
  label: string;
  description?: string;
  error?: string;
  placeholder?: string;
  required?: boolean;
  /**
   * The control's DOM id, and the namespace for this instance's `-error` /
   * `-description` / `-constraint` ids. **Pass this whenever a form can render
   * two of these** — the write-off dialog does, one for the request and one for
   * the certificate, and a repeated id means the second label focuses the first
   * field. Omit it only when a form has exactly one money field.
   */
  id?: string;
}> = ({
  value,
  onChange,
  label,
  description,
  error,
  placeholder = "0.00",
  required = false,
  id,
}) => {
  const isEmpty = value === "";
  const isMalformed = !isEmpty && !MONEY_PATTERN.test(value);
  // The local format complaint outranks the server's: a field holding `1,250`
  // is wrong whatever the API said about it, and showing both would leave the
  // user deciding which of two messages to believe.
  const shownError = isMalformed ? MONEY_FORMAT_ERROR : (error ?? null);

  /**
   * `fieldId` is the control's id and the label's `htmlFor`. `idBase` is what the
   * *referenced* ids are namespaced by, and it deliberately falls back to
   * `useId` rather than to the literal when the caller passed nothing: the
   * default `fieldId` is only safe because a two-instance form is expected to
   * pass `id`, and namespacing the sub-ids off the literal would put
   * `inventory-money-field-error` in the document twice in exactly the case the
   * `id` prop exists to fix. When an `id` *is* passed the sub-ids are derived
   * from it, so the DOM reads `writeoff-certificate-value-error` rather than
   * `:r9:-error`.
   */
  const generatedId = useId();
  const fieldId = id ?? DEFAULT_FIELD_ID;
  const idBase = id ?? generatedId;
  const errorId = `${idBase}-error`;
  const descriptionId = `${idBase}-description`;
  const constraintId = `${idBase}-constraint`;

  /**
   * Only the descriptions that are actually rendered are referenced — an
   * `aria-describedby` pointing at an id that is not in the document is worse
   * than no attribute, because some screen readers read the missing target as
   * an empty description and then stop.
   */
  const describedBy = [
    shownError ? errorId : null,
    description ? descriptionId : null,
    constraintId,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Field data-invalid={Boolean(shownError)}>
      <FieldLabel htmlFor={fieldId}>
        {label}
        {required ? " *" : ""}
      </FieldLabel>
      <Input
        id={fieldId}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={shownError ? true : undefined}
        aria-describedby={describedBy || undefined}
        data-invalid={shownError ? true : undefined}
      />
      {shownError ? <FieldError id={errorId}>{shownError}</FieldError> : null}
      {/*
        The format constraint is stated whether or not the caller supplied a
        description, and sits *below* it: the caller's description says what the
        figure is for, this one says what is allowed. Swallowing it whenever a
        description exists would mean the rule only appears on the fields whose
        author happened not to add one.
      */}
      {description ? (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      ) : null}
      <FieldDescription id={constraintId}>{MONEY_CONSTRAINT}</FieldDescription>
    </Field>
  );
};
