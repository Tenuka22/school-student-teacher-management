import {
  INVENTORY_TRANSFER_REASON_KEYS,
  inventoryTransferReasonLabel,
} from "@school-student-teacher-management/db/constants/inventory";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import type * as React from "react";
import { useId } from "react";

const REQUIRED_REASON_COPY =
  "Required, and recorded on the item's custody history. Every transfer and every manager change has to say why — that history row is what an audit reads.";

/**
 * Why a holder or a manager changed — required, every time.
 *
 * **This is a server rule with a database CHECK behind it, so the field has to
 * say so before the user hits submit rather than letting a toast tell them
 * afterwards.** Both `orpc.inventory.custody.transfer` and
 * `orpc.inventory.custody.assignManager` declare `reason` as a required
 * `inventoryTransferReasonSchema`, and `inventory_custody_history_reason_required`
 * refuses a row whose reason is empty. A change of hands is the one thing an
 * audit is actually asked about and the one thing a storekeeper can do in three
 * clicks, which is exactly why it cannot be allowed to happen without saying
 * why.
 *
 * The eight options and their wording come from `INVENTORY_TRANSFER_REASON_KEYS`
 * and `inventoryTransferReasonLabel` in
 * `packages/db/src/constants/inventory.ts` — the same picklist the API validates
 * against and the same map the server uses to label a history row. Spelling the
 * reasons out here would be a fourth copy. `other` is a real member of the set,
 * not a hole in it: a storekeeper who cannot name any of the seven still has to
 * record the change, and the dialog's own note field is where they say what.
 *
 * The free-text `note` is deliberately **not** part of this component. It is a
 * separate field in the dialog, beside this one, because "misassignment" is a
 * category and "Mr Perera had both projectors" is a detail, and folding the
 * second into the first would leave the history row with a `reason` that is
 * really a sentence.
 */
export const TransferReasonField: React.FC<{
  value: string;
  onChange: (reason: string) => void;
  label?: string;
  description?: string;
  error?: string;
  required?: boolean;
}> = ({
  value,
  onChange,
  label = "Reason for the change",
  description,
  error,
  required = true,
}) => {
  /**
   * The caller's description wins when there is one, and the requirement is
   * stated separately rather than being folded into it — a caller that supplied
   * "Applies to both the manager and the custodian" must not be able to
   * accidentally drop the rule that the field is mandatory.
   */
  const shownDescription =
    description ?? (required ? REQUIRED_REASON_COPY : null);

  /**
   * A stable id per instance rather than the fixed `inventory-transfer-reason`
   * this used to hardcode.
   *
   * The transfer dialog and the manager dialog are separate dialogs that can
   * both be mounted in the page shell, and a hardcoded id put in the document
   * twice would leave the second label activating the first trigger — the same
   * defect `MoneyField` had. `useId` cannot collide, and it is the tool the
   * other two shared pickers in this folder already use.
   */
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const descriptionId = `${inputId}-description`;
  const describedBy = [
    error ? errorId : null,
    shownDescription ? descriptionId : null,
  ]
    .filter(Boolean)
    .join(" ");

  /**
   * `aria-invalid` follows the **server's** error and nothing else.
   *
   * The `Field` wrapper also turns red while a required field is still empty, and
   * that eagerness is deliberate as a colour hint — but marking the control
   * `aria-invalid` before the user has done anything announces "invalid" the
   * moment an untouched required field takes focus, which is a lie about a field
   * nobody has filled in wrongly yet. So the border follows the same condition as
   * the message.
   *
   * This attribute is also the *only* thing that styles the trigger. The
   * `SelectTrigger` class list in `packages/ui/src/components/select.tsx` carries
   * `aria-invalid:border-destructive` and `aria-invalid:ring-destructive/20` and
   * **no `data-invalid:` variant**, so the `data-invalid` this used to set was
   * inert markup: the one field in the feature with a database CHECK behind it
   * showed no invalid treatment whatsoever. `aria-invalid` is the variant the
   * component actually reacts to, so it is the one that is set.
   */
  const isInvalid = Boolean(error);

  return (
    <Field data-invalid={Boolean(error) || (required && value === "")}>
      {/*
        The asterisk stays — it is the convention every school office reads
        instantly — and `aria-required` on the trigger is what makes the same
        fact programmatic. `aria-required` rather than the HTML `required`
        attribute because the trigger renders a `<button role="combobox">`, and
        `required` is not a valid attribute on a button; for a combobox the
        programmatic form of "you must choose something" *is* `aria-required`.
        With the asterisk alone the requirement existed only as a glyph.
      */}
      <FieldLabel htmlFor={inputId}>
        {label}
        {required ? " *" : ""}
      </FieldLabel>
      <Select
        value={value || null}
        onValueChange={(reason) => onChange(reason ?? "")}
      >
        <SelectTrigger
          id={inputId}
          className="w-full"
          aria-invalid={isInvalid ? true : undefined}
          aria-required={required || undefined}
          aria-describedby={describedBy || undefined}
        >
          <SelectValue placeholder="Select a reason">
            {value ? inventoryTransferReasonLabel(value) : ""}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {INVENTORY_TRANSFER_REASON_KEYS.map((reason) => (
            <SelectItem key={reason} value={reason}>
              {inventoryTransferReasonLabel(reason)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {shownDescription ? (
        <FieldDescription id={descriptionId}>
          {shownDescription}
        </FieldDescription>
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </Field>
  );
};
