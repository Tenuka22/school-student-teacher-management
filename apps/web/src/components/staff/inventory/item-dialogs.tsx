"use client";

import {
  ITEM_CONDITIONS,
  itemConditionLabel,
  itemConditionSchema,
  normalizeInventoryKey,
} from "@school-student-teacher-management/db/constants/inventory";
import {
  inventoryCategoryIdSchema,
  moneyStringSchema,
} from "@school-student-teacher-management/db/schema/inventory";
import { staffIdSchema } from "@school-student-teacher-management/db/schema/staff";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import { Checkbox } from "@school-student-teacher-management/ui/components/checkbox";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@school-student-teacher-management/ui/components/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@school-student-teacher-management/ui/components/field";
import { Input } from "@school-student-teacher-management/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import { Textarea } from "@school-student-teacher-management/ui/components/textarea";
import {
  IconAlertTriangle,
  IconCategoryPlus,
  IconInfoCircle,
  IconPackageExport,
  IconSwitchHorizontal,
  IconTrash,
  IconUserCheck,
} from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type * as React from "react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import type {
  CategoryOption,
  InventoryItemView,
} from "@/components/staff/inventory/inventory-types";
import {
  invalidateInventory,
  MoneyField,
  StaffComboboxField,
} from "@/components/staff/inventory/shared";
import { formatApiErrorMessage, validationFieldErrors } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

/** `createItem`'s own ceiling on `qty`, restated so the input can enforce it. */
const MAX_ITEM_QTY = 1000;

/** `inventory_item_sku_format` — the CHECK the column itself carries. */
const SKU_PATTERN = /^INV-\d{5}$/u;

/** `numeric(14,2)`, the money columns' own precision and scale. */
const MONEY_PATTERN = /^\d{1,12}(?:\.\d{1,2})?$/u;

type ItemFormField =
  | "categoryId"
  | "name"
  | "sku"
  | "unit"
  | "description"
  | "qty"
  | "condition"
  | "location"
  | "minQty"
  | "borrowable"
  | "purchaseValue"
  | "currentValue"
  | "uniqueIds"
  | "managerStaffId"
  | "custodianStaffId";

type ItemFormErrors = Partial<Record<ItemFormField, string>>;

/** The fields both forms share, validated by one schema per mode. */
const identitySchema = {
  name: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "Give the item a name"),
    v.maxLength(200, "Keep the name under 200 characters")
  ),
  description: v.pipe(
    v.string(),
    v.trim(),
    v.maxLength(500, "Keep the description under 500 characters")
  ),
  unit: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "Say what one of these is counted in — unit, chair, box"),
    v.maxLength(40, "Keep the unit under 40 characters")
  ),
  condition: itemConditionSchema,
  location: v.pipe(v.string(), v.trim(), v.maxLength(200)),
  borrowable: v.boolean(),
  purchaseValue: v.optional(moneyStringSchema()),
  currentValue: v.optional(moneyStringSchema()),
};

const reorderLevelSchema = v.pipe(
  v.number(),
  v.integer("The reorder level is a whole number of units"),
  v.minValue(0, "The reorder level cannot be negative"),
  v.maxValue(MAX_ITEM_QTY, "That is more units than a single line can hold")
);

const createItemSchema = v.object({
  ...identitySchema,
  qty: v.pipe(
    v.number(),
    v.integer("The quantity is a whole number of units"),
    v.minValue(1, "A new item has to have at least one unit"),
    v.maxValue(
      MAX_ITEM_QTY,
      `A single item line is at most ${MAX_ITEM_QTY} units`
    )
  ),
  minQty: reorderLevelSchema,
});

/**
 * The edit schema is the create schema minus `qty`.
 *
 * `updateItem` refuses `qty` outright — it is the number of unit rows an item has,
 * a *consequence* of movements rather than an editable fact — so there is nothing
 * here to validate it against. The reorder level is the one cross-field rule that
 * survives, and it is checked against the item's own count at submit.
 *
 * **`categoryId` is absent from this schema on purpose, which used to hide a
 * blocker.** It is not validated here on create either: it arrives as a branded id
 * from a `Combobox` rather than from a typed `<input>`, so the builder parses it
 * with `v.parse(inventoryCategoryIdSchema, …)` after this schema has run. That is
 * correct — but the create branch said so out loud, and this one did not, which is
 * how the edit branch came to read `category` from nowhere and return
 * `{ ...result.output }` with the re-categorisation silently dropped. If a field is
 * added to `updateItem` by hand, the submit builder is where it has to be named.
 */
const editItemSchema = v.object({
  ...identitySchema,
  minQty: reorderLevelSchema,
});

/**
 * Only the keys valibot objected to, so each issue lands on the field that caused
 * it. It takes the **issues** rather than the result object because
 * `v.SafeParseResult` is generic over the *schema*, and threading a schema type
 * through a helper whose whole job is to read `issue.path[0].key` would buy
 * nothing.
 */
const issuesToErrors = <T extends string>(
  issues: readonly {
    path?: readonly { key?: unknown }[] | null;
    message: string;
  }[]
): Partial<Record<T, string>> => {
  const errors: Partial<Record<T, string>> = {};

  for (const issue of issues) {
    const key = issue.path?.[0]?.key;
    if (typeof key === "string" && !(key in errors)) {
      errors[key as T] = issue.message;
    }
  }

  return errors;
};

const toQuantity = (raw: string): number => {
  const parsed = Math.trunc(Number(raw));
  return Number.isNaN(parsed) ? 0 : parsed;
};

// ─── Asset tag rows ─────────────────────────────────────────────────────────

/**
 * One row of the repeated tag input, with a **stable** identity.
 *
 * The rows are positional and the count is locked to the quantity, so the position
 * *is* the identity today — but a key that is only accidentally correct is a key
 * that breaks the day someone adds a "move row up" button, and React's
 * reconciliation would then carry a keystroke from one row to another. A counter is
 * enough: `crypto.randomUUID` is unavailable on a plain-HTTP origin, which is
 * exactly the school's LAN, and a row that exists for the lifetime of one dialog
 * does not need a globally unique identifier.
 */
interface TagRow {
  id: number;
  value: string;
}

let nextTagRowId = 0;

const newTagRow = (value = ""): TagRow => {
  nextTagRowId += 1;
  return { id: nextTagRowId, value };
};

/**
 * Grow or shrink the tag list to the quantity, keeping whatever is typed.
 *
 * The row count is *locked* to the quantity rather than validated against it, and
 * both directions are non-destructive where they can be: raising the quantity
 * never blanks a row, and lowering it discards only the rows past the new count —
 * which is exactly what typing the smaller number asks for. Existing rows keep
 * their ids, so nothing is remounted and no keystroke is lost.
 */
const resizeTagRows = (rows: TagRow[], qty: number): TagRow[] => {
  const size = Math.max(0, Math.min(qty, MAX_ITEM_QTY));
  const kept = rows.slice(0, size);
  const added = Array.from({ length: size - kept.length }, () => newTagRow());
  return [...kept, ...added];
};

/**
 * Which rows repeat a tag typed somewhere else in the list.
 *
 * `normalizeInventoryKey` is the same function the server's unique index is written
 * against, so `LT-0042`, `lt 0042` and `LT-0042 ` are one tag here for exactly the
 * reason they are one tag in the database. Both the row that claimed a tag and the
 * row that repeated it are flagged: marking only the second leaves the first looking
 * innocent and the clerk guessing which one to change.
 */
const duplicateTagRows = (rows: TagRow[]): Set<number> => {
  const seen = new Map<string, number>();
  const duplicates = new Set<number>();

  for (const [index, row] of rows.entries()) {
    const key = normalizeInventoryKey(row.value);
    if (key.length === 0) {
      continue;
    }

    const firstIndex = seen.get(key);
    if (firstIndex === undefined) {
      seen.set(key, index);
    } else {
      duplicates.add(firstIndex);
      duplicates.add(index);
    }
  }

  return duplicates;
};

interface AssetTagFieldsProps {
  formId: string;
  rows: TagRow[];
  duplicates: Set<number>;
  error: string | undefined;
  disabled: boolean;
  onChange: (next: TagRow[]) => void;
}

/**
 * The asset tags, one row per unit.
 *
 * **`createItem` requires `uniqueIds.length === qty` the moment a single tag is
 * supplied** — `resolveAssetTags` compares the normalized count against `qty` and
 * refuses a mismatch, while an entirely empty list stays legitimate because a bulk
 * line ("200 chairs") is counted rather than tagged. That is a rule an object schema
 * cannot express, so it lives here: the rows track the quantity, a live count says
 * how many are still missing, and the two ways the list can be wrong (a blank row,
 * the same tag twice) are both named on the field. Learning this from the server's
 * toast would have thrown away a twenty-field form's worth of typing to be told its
 * tags were short.
 */
const AssetTagFields = ({
  formId,
  rows,
  duplicates,
  error,
  disabled,
  onChange,
}: AssetTagFieldsProps) => {
  const filled = rows.filter(
    (row) => normalizeInventoryKey(row.value).length > 0
  ).length;
  const missing = rows.length - filled;

  return (
    <FieldSet>
      <FieldLegend>Asset tags</FieldLegend>
      <FieldGroup>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs tabular-nums">
            {filled} of {rows.length} entered
            {missing > 0 ? ` — ${missing} still blank` : ""}
          </p>
          {duplicates.size > 0 ? (
            <Badge variant="destructive">
              <IconAlertTriangle />
              Repeated in {duplicates.size} row(s)
            </Badge>
          ) : null}
        </div>

        {rows.map((row, index) => {
          const inputId = `${formId}-tag-${row.id}`;
          const isDuplicate = duplicates.has(index);

          return (
            <Field key={row.id} data-invalid={isDuplicate || Boolean(error)}>
              <FieldLabel htmlFor={inputId}>
                Tag {index + 1}
                {isDuplicate ? (
                  <Badge variant="destructive" className="ml-1">
                    <IconAlertTriangle />
                    Repeated
                  </Badge>
                ) : null}
              </FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  id={inputId}
                  value={row.value}
                  maxLength={64}
                  autoComplete="off"
                  placeholder="As written on the device, e.g. LT-0042"
                  disabled={disabled}
                  aria-invalid={
                    isDuplicate || Boolean(error) ? true : undefined
                  }
                  aria-describedby={`${formId}-tags-error`}
                  onChange={(event) => {
                    const next = rows.toSpliced(index, 1, {
                      ...row,
                      value: event.target.value,
                    });
                    onChange(next);
                  }}
                />
                {/*
                  Clearing blanks the row rather than removing it. Removing it would
                  silently break the one-row-per-unit coupling, and the next submit
                  would then fail the count check for a reason the user did not cause
                  and cannot see.
                */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled || row.value.length === 0}
                  aria-label={`Clear asset tag ${index + 1}`}
                  onClick={() =>
                    onChange(rows.toSpliced(index, 1, newTagRow()))
                  }
                >
                  <IconTrash />
                </Button>
              </div>
            </Field>
          );
        })}

        <FieldError id={`${formId}-tags-error`}>{error}</FieldError>
        <FieldDescription>
          One tag per unit, and the number of rows follows the quantity above. A
          tag is how the school finds the thing again, so it is checked against
          the whole register: a tag already on file anywhere is refused. A bulk
          line that is counted rather than tracked individually simply leaves
          these boxes empty.
        </FieldDescription>
      </FieldGroup>
    </FieldSet>
  );
};

// ─── Category picker ────────────────────────────────────────────────────────

interface CategoryPickerProps {
  formId: string;
  categories: CategoryOption[];
  value: CategoryOption | null;
  onChange: (category: CategoryOption | null) => void;
  error: string | undefined;
  disabled: boolean;
  onCreateCategory: (name: string) => Promise<CategoryOption | null>;
  isCreatingCategory: boolean;
}

/**
 * The category, as a combobox with a way out of the dead end.
 *
 * **The inline "New category" row exists because the create form is otherwise a
 * trap on a store that has not been set up.** `createItem` requires a `categoryId`
 * behind a `restrict` foreign key, so a storekeeper who needs a category that does
 * not exist has exactly one route out of this dialog, and it used to be "cancel,
 * open the category panel, add it, come back, start again". Creating it from here
 * costs one line of typing and the new category is selected on the spot, so the
 * form ends up filled in rather than half filled. Duplicates are the server's call:
 * `categories.create` answers `CONFLICT` with the offending name, and that sentence
 * says which of the two entries to merge into.
 *
 * Filtering is left to the combobox rather than sent to the server, unlike every
 * other picker in this feature — and that is because `categories.list` deliberately
 * returns *every* category, used or not. There is nothing to page through, and a
 * picker that needed a round trip to filter eight rows would be strictly worse.
 */
const CategoryPicker = ({
  formId,
  categories,
  value,
  onChange,
  error,
  disabled,
  onCreateCategory,
  isCreatingCategory,
}: CategoryPickerProps) => {
  const [newName, setNewName] = useState("");

  const handleCreate = async () => {
    const created = await onCreateCategory(newName);
    if (created) {
      onChange(created);
      setNewName("");
    }
  };

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={`${formId}-category`}>Category *</FieldLabel>
      <Combobox<CategoryOption>
        items={categories}
        value={value}
        onValueChange={(option) => onChange(option ?? null)}
        itemToStringLabel={(option) => option?.name ?? ""}
        isItemEqualToValue={(a, b) => a?.id === b?.id}
      >
        <ComboboxInput
          id={`${formId}-category`}
          placeholder="Search the categories..."
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${formId}-category-error` : undefined}
        />
        <ComboboxContent>
          <ComboboxEmpty>
            {categories.length === 0
              ? "No categories yet — add one below"
              : "No category matches that"}
          </ComboboxEmpty>
          <ComboboxList>
            {categories.map((option) => (
              <ComboboxItem key={option.id} value={option}>
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="ring-foreground/10 size-2 shrink-0 rounded-full ring-1"
                    style={{ backgroundColor: option.color }}
                  />
                  <span className="truncate font-medium">{option.name}</span>
                </span>
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <FieldDescription>
        Every item belongs to exactly one category, and the register&rsquo;s
        category filter reads this list. If the one you need is not here, create
        it below rather than leaving this form.
      </FieldDescription>
      {error ? (
        <FieldError id={`${formId}-category-error`}>{error}</FieldError>
      ) : null}

      <div className="mt-2 flex items-end gap-2">
        <Field className="flex-1">
          <FieldLabel htmlFor={`${formId}-new-category`}>
            New category
          </FieldLabel>
          <Input
            id={`${formId}-new-category`}
            value={newName}
            maxLength={80}
            autoComplete="off"
            placeholder="e.g. Music Equipment"
            disabled={disabled || isCreatingCategory}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleCreate();
              }
            }}
          />
        </Field>
        <Button
          type="button"
          variant="outline"
          disabled={
            disabled || isCreatingCategory || newName.trim().length === 0
          }
          onClick={() => {
            void handleCreate();
          }}
          data-icon="inline-start"
        >
          <IconCategoryPlus data-icon="inline-start" />
          {isCreatingCategory ? "Adding..." : "Add"}
        </Button>
      </div>
    </Field>
  );
};

// ─── Valuation ──────────────────────────────────────────────────────────────

/**
 * The second money field, and why it is not the shared `MoneyField`.
 *
 * The shared control renders `<Input id="inventory-money-field">` with a label
 * pointing at that same hardcoded id. One instance per form is fine; this form has
 * two valuation columns (`purchase_value` and `current_value`), and two instances
 * would put one id in the document twice — so the second label would activate the
 * *first* input, announcing "Current value" against "Purchase value" and moving the
 * caret into the wrong box on click. This is the same control with a caller-supplied
 * id and the same string-typed `numeric(14,2)` contract; it exists to fix the id and
 * nothing else. The purchase-value half still uses the shared `MoneyField`, because
 * a single instance of it is correct.
 */
/**
 * The money field's error, with the format message taking precedence.
 *
 * Two messages are possible and only one can be shown: a malformed amount is
 * something the user can fix at the keyboard, and a server error is a statement
 * about the value as submitted. Showing the format message when both apply is
 * correct — it is the nearer problem — so the branch is a helper rather than a
 * nested ternary inside the markup.
 */
const MoneyFieldError = ({
  id,
  error,
  isMalformed,
}: {
  id: string;
  error: string | undefined;
  isMalformed: boolean;
}) => {
  if (isMalformed) {
    return (
      <FieldError id={id}>
        This is not a valid amount. Type digits with an optional decimal point
        and no comma, for example 1250.00
      </FieldError>
    );
  }

  if (!error) {
    return null;
  }

  return <FieldError id={id}>{error}</FieldError>;
};

const CurrentValueField = ({
  formId,
  value,
  onChange,
  error,
  description,
}: {
  formId: string;
  value: string;
  onChange: (next: string) => void;
  error: string | undefined;
  description: string;
}) => {
  const id = `${formId}-current-value`;
  const isMalformed = value !== "" && !MONEY_PATTERN.test(value);

  return (
    <Field data-invalid={Boolean(error) || isMalformed}>
      <FieldLabel htmlFor={id}>Current value</FieldLabel>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        value={value}
        aria-invalid={error || isMalformed ? true : undefined}
        aria-describedby={`${id}-error`}
        onChange={(event) => onChange(event.target.value)}
      />
      <MoneyFieldError
        id={`${id}-error`}
        error={error}
        isMalformed={isMalformed}
      />
      <FieldDescription>{description}</FieldDescription>
      <FieldDescription>
        Up to 12 digits with at most 2 decimal places. No thousands separators —
        type 1250.00, not 1,250.00.
      </FieldDescription>
    </Field>
  );
};

// ─── Form sections ──────────────────────────────────────────────────────────

/** The two ways a tag list can be wrong, named on the field rather than toasted. */
const resolveTagError = (
  enteredTagCount: number,
  qty: number,
  duplicates: Set<number>
): string | undefined => {
  if (enteredTagCount > 0 && enteredTagCount !== qty) {
    return `Enter one asset tag for each of the ${qty} unit(s) — ${enteredTagCount} entered so far.`;
  }

  if (duplicates.size > 0) {
    return "The same asset tag appears more than once. A tag identifies one physical unit.";
  }

  return undefined;
};

/** What the form looks like when it is about to be submitted.
 *
 * `minQty` is a **string** here even though it is a number on the wire, because it
 * is an `<input type="number">` bound to a controlled value: a number in state
 * would render `""` for an empty box and `0` for a box holding a zero, and the
 * difference between "not answered yet" and "answered zero" is exactly what the
 * reorder-level field needs. It is parsed once, at submit.
 */
interface FormValues {
  name: string;
  description: string;
  unit: string;
  minQty: string;
  borrowable: boolean;
  condition: string;
  location: string;
  purchaseValue: string;
  currentValue: string;
}

interface IdentityFieldsetProps {
  formId: string;
  errors: ItemFormErrors;
  isLoading: boolean;
  isEdit: boolean;
  values: FormValues;
  categories: CategoryOption[];
  category: CategoryOption | null;
  sku: string;
  onChange: (patch: Partial<FormValues>) => void;
  onCategoryChange: (category: CategoryOption | null) => void;
  onSkuChange: (sku: string) => void;
  onCreateCategory: (name: string) => Promise<CategoryOption | null>;
  isCreatingCategory: boolean;
}

/**
 * What the thing is called, and what kind of thing it is.
 *
 * The SKU field exists **only on create**, and that is not an oversight:
 * `updateItem` does not accept `sku` either. A SKU is the item's identity on the
 * ledger, every historical row refers to it, and letting it be retyped would make
 * those rows describe something the register no longer contains. So the field is
 * absent rather than disabled — there is nothing on this form to change.
 */
const IdentityFieldset = ({
  formId,
  errors,
  isLoading,
  isEdit,
  values,
  categories,
  category,
  sku,
  onChange,
  onCategoryChange,
  onSkuChange,
  onCreateCategory,
  isCreatingCategory,
}: IdentityFieldsetProps) => (
  <FieldSet>
    <FieldLegend>Identity</FieldLegend>
    <FieldGroup>
      <Field data-invalid={Boolean(errors.name)}>
        <FieldLabel htmlFor={`${formId}-name`}>Name *</FieldLabel>
        <Input
          id={`${formId}-name`}
          value={values.name}
          maxLength={200}
          placeholder="e.g. Portable projector, XGA"
          disabled={isLoading}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${formId}-name-error` : undefined}
          onChange={(event) => onChange({ name: event.target.value })}
        />
        <FieldError id={`${formId}-name-error`}>{errors.name}</FieldError>
      </Field>

      <CategoryPicker
        formId={formId}
        categories={categories}
        value={category}
        onChange={onCategoryChange}
        error={errors.categoryId}
        disabled={isLoading}
        onCreateCategory={onCreateCategory}
        isCreatingCategory={isCreatingCategory}
      />

      {isEdit ? null : (
        <Field data-invalid={Boolean(errors.sku)}>
          <FieldLabel htmlFor={`${formId}-sku`}>SKU</FieldLabel>
          <Input
            id={`${formId}-sku`}
            value={sku}
            maxLength={20}
            autoComplete="off"
            placeholder="INV-12345"
            className="font-mono"
            disabled={isLoading}
            aria-invalid={errors.sku ? true : undefined}
            aria-describedby={
              errors.sku
                ? `${formId}-sku-description ${formId}-sku-error`
                : `${formId}-sku-description`
            }
            onChange={(event) => onSkuChange(event.target.value)}
          />
          <FieldDescription id={`${formId}-sku-description`}>
            Leave it blank and the store generates one in the{" "}
            <span className="font-mono">INV-12345</span> format. Type your own
            only to match a numbering your school already uses — it has to look
            exactly like that and be unique across the whole register. It cannot
            be changed afterwards; it is the item&rsquo;s identity on the
            ledger.
          </FieldDescription>
          <FieldError id={`${formId}-sku-error`}>{errors.sku}</FieldError>
        </Field>
      )}

      <Field data-invalid={Boolean(errors.unit)}>
        <FieldLabel htmlFor={`${formId}-unit`}>Unit</FieldLabel>
        <Input
          id={`${formId}-unit`}
          value={values.unit}
          maxLength={40}
          placeholder="unit"
          disabled={isLoading}
          aria-invalid={errors.unit ? true : undefined}
          aria-describedby={errors.unit ? `${formId}-unit-error` : undefined}
          onChange={(event) => onChange({ unit: event.target.value })}
        />
        <FieldDescription>
          What one of these is counted in — unit, chair, box, set. It is what
          the quantity is read as.
        </FieldDescription>
        <FieldError id={`${formId}-unit-error`}>{errors.unit}</FieldError>
      </Field>

      <Field data-invalid={Boolean(errors.description)}>
        <FieldLabel htmlFor={`${formId}-description`}>Description</FieldLabel>
        <Textarea
          id={`${formId}-description`}
          value={values.description}
          rows={2}
          maxLength={500}
          placeholder="Anything that identifies this line — the make, the model, the room it was bought for"
          disabled={isLoading}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={
            errors.description ? `${formId}-description-error` : undefined
          }
          onChange={(event) => onChange({ description: event.target.value })}
        />
        <FieldDescription>
          One of the three things the register&rsquo;s search box looks at,
          alongside the name and the SKU.
        </FieldDescription>
        <FieldError id={`${formId}-description-error`}>
          {errors.description}
        </FieldError>
      </Field>
    </FieldGroup>
  </FieldSet>
);

interface StockFieldsetProps {
  formId: string;
  errors: ItemFormErrors;
  isLoading: boolean;
  isEdit: boolean;
  /** The count already on the shelf — create only, since edit cannot change it. */
  qty: number;
  onQtyChange: (raw: string) => void;
  minQty: string;
  onMinQtyChange: (raw: string) => void;
  tagRows: TagRow[];
  duplicates: Set<number>;
  onTagRowsChange: (rows: TagRow[]) => void;
}

/**
 * How many there are, and when to reorder.
 *
 * On edit there is deliberately **no quantity field at all**. `updateItem` refuses
 * `qty`, and a disabled input would have been a lie about what this dialog can do —
 * the note at the bottom of the form, with its four working buttons, is the honest
 * version of the same information.
 */
const StockFieldset = ({
  formId,
  errors,
  isLoading,
  isEdit,
  qty,
  onQtyChange,
  minQty,
  onMinQtyChange,
  tagRows,
  duplicates,
  onTagRowsChange,
}: StockFieldsetProps) => {
  const onHandNote =
    isEdit && qty > 0
      ? ` It cannot be set above the ${qty} unit(s) on hand.`
      : "";

  return (
    <FieldSet>
      <FieldLegend>Stock</FieldLegend>
      <FieldGroup>
        <div className="grid grid-cols-2 gap-4">
          {isEdit ? null : (
            <Field data-invalid={Boolean(errors.qty)}>
              <FieldLabel htmlFor={`${formId}-qty`}>Quantity *</FieldLabel>
              <Input
                id={`${formId}-qty`}
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_ITEM_QTY}
                value={String(qty)}
                disabled={isLoading}
                aria-invalid={errors.qty ? true : undefined}
                aria-describedby={
                  errors.qty ? `${formId}-qty-error` : undefined
                }
                onChange={(event) => onQtyChange(event.target.value)}
              />
              <FieldDescription>
                How many are on the shelf today, counted in the unit above. The
                asset-tag list has one row per unit to match it.
              </FieldDescription>
              <FieldError id={`${formId}-qty-error`}>{errors.qty}</FieldError>
            </Field>
          )}

          <Field data-invalid={Boolean(errors.minQty)}>
            <FieldLabel htmlFor={`${formId}-min-qty`}>Reorder level</FieldLabel>
            <Input
              id={`${formId}-min-qty`}
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_ITEM_QTY}
              value={minQty}
              disabled={isLoading}
              aria-invalid={errors.minQty ? true : undefined}
              aria-describedby={
                errors.minQty ? `${formId}-min-qty-error` : undefined
              }
              onChange={(event) => onMinQtyChange(event.target.value)}
            />
            <FieldDescription>
              A warning line, not a floor. Nothing stops the store dropping
              below it — that is what makes a write-off possible at all — but
              the register flags the item as low stock once the count reaches
              this number.
              {onHandNote}
            </FieldDescription>
            <FieldError id={`${formId}-min-qty-error`}>
              {errors.minQty}
            </FieldError>
          </Field>
        </div>

        {isEdit ? null : (
          <AssetTagFields
            formId={formId}
            rows={tagRows}
            duplicates={duplicates}
            error={errors.uniqueIds}
            disabled={isLoading}
            onChange={onTagRowsChange}
          />
        )}
      </FieldGroup>
    </FieldSet>
  );
};

interface ConditionFieldsetProps {
  formId: string;
  errors: ItemFormErrors;
  isLoading: boolean;
  values: FormValues;
  onChange: (patch: Partial<FormValues>) => void;
}

/**
 * Condition, where it lives, and whether it leaves the building.
 *
 * **Damaged is a status, not a note.** `calculateItemStatus` reads the condition
 * column, so an item marked Damaged is badged Damaged and stops counting as
 * available however many are on the shelf. Under Repair is deliberately a separate
 * value, because a repaired device comes back into service and a broken one does
 * not — collapsing them would hide the items that are coming back.
 *
 * The borrowable flag gets a checkbox rather than a switch, and a description that
 * says what it *does* rather than what it is called. `borrowable` gates
 * `custody.take` and the whole borrow flow on the server: an item that is not
 * borrowable is refused outright, with a sentence saying it stays with the store.
 * That is a policy about handing school property to people, and it deserves
 * stating before it is ticked rather than being discovered when somebody cannot
 * borrow a tripod.
 */
const ConditionFieldset = ({
  formId,
  errors,
  isLoading,
  values,
  onChange,
}: ConditionFieldsetProps) => (
  <FieldSet>
    <FieldLegend>Condition and place</FieldLegend>
    <FieldGroup>
      <div className="grid grid-cols-2 gap-4">
        <Field data-invalid={Boolean(errors.condition)}>
          <FieldLabel htmlFor={`${formId}-condition`}>Condition</FieldLabel>
          <Select
            value={values.condition}
            onValueChange={(next) => {
              if (next) {
                onChange({ condition: next });
              }
            }}
          >
            <SelectTrigger
              id={`${formId}-condition`}
              disabled={isLoading}
              aria-invalid={errors.condition ? true : undefined}
              aria-describedby={
                errors.condition ? `${formId}-condition-error` : undefined
              }
            >
              <SelectValue placeholder="Select a condition">
                {itemConditionLabel(values.condition)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ITEM_CONDITIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {itemConditionLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            Damaged changes the item&rsquo;s status and takes it off the
            available count until it is fixed. Under Repair is tracked
            separately, because a repaired item comes back.
          </FieldDescription>
          <FieldError id={`${formId}-condition-error`}>
            {errors.condition}
          </FieldError>
        </Field>

        <Field data-invalid={Boolean(errors.location)}>
          <FieldLabel htmlFor={`${formId}-location`}>Location</FieldLabel>
          <Input
            id={`${formId}-location`}
            value={values.location}
            maxLength={200}
            placeholder="e.g. Science lab, cupboard B"
            disabled={isLoading}
            aria-invalid={errors.location ? true : undefined}
            aria-describedby={
              errors.location ? `${formId}-location-error` : undefined
            }
            onChange={(event) => onChange({ location: event.target.value })}
          />
          <FieldDescription>
            Where it is kept. Blank is a legitimate answer for something that
            moves, but a store cannot answer &ldquo;where is the
            microscope&rdquo; without it.
          </FieldDescription>
          <FieldError id={`${formId}-location-error`}>
            {errors.location}
          </FieldError>
        </Field>
      </div>

      <Field orientation="horizontal">
        <Checkbox
          id={`${formId}-borrowable`}
          checked={values.borrowable}
          disabled={isLoading}
          onCheckedChange={(checked) =>
            onChange({ borrowable: checked === true })
          }
        />
        <FieldLabel htmlFor={`${formId}-borrowable`} className="font-normal">
          Members of staff may borrow or take this item
        </FieldLabel>
      </Field>
      <FieldDescription>
        Unchecked, the item stays with the store: a member of staff claiming it
        is refused and no loan can be raised against it. Checked, it appears in
        the take and loan flows and can leave the building with whoever borrows
        it.
      </FieldDescription>
    </FieldGroup>
  </FieldSet>
);

interface ValuationFieldsetProps {
  formId: string;
  errors: ItemFormErrors;
  isEdit: boolean;
  values: FormValues;
  onChange: (patch: Partial<FormValues>) => void;
}

/**
 * What it cost and what it is worth.
 *
 * **`updateItem` reads a missing money field as "leave this valuation alone"**
 * (`?? existing.purchaseValue`), so a blank on the edit form is not a request to
 * erase the figure — it is silence. Both descriptions say so, because the other
 * reading (blank means nothing) is the one that loses a school its purchase price.
 *
 * And no currency symbol anywhere: nothing in this repository's schema, constants
 * or any other screen names a currency, so printing `LKR` here would put a unit on
 * one dialog that contradicts the column heading everywhere else.
 */
const ValuationFieldset = ({
  formId,
  errors,
  isEdit,
  values,
  onChange,
}: ValuationFieldsetProps) => (
  <FieldSet>
    <FieldLegend>Valuation</FieldLegend>
    <FieldGroup>
      <div className="grid grid-cols-2 gap-4">
        <MoneyField
          value={values.purchaseValue ?? ""}
          onChange={(purchaseValue) => onChange({ purchaseValue })}
          label="Purchase value"
          error={errors.purchaseValue}
          description={
            isEdit
              ? "What the school paid for one unit. Leave blank to keep the figure already on record."
              : "What the school paid for one unit. Optional — donated or inherited stock may have none."
          }
        />
        <CurrentValueField
          formId={formId}
          value={values.currentValue ?? ""}
          onChange={(currentValue) => onChange({ currentValue })}
          error={errors.currentValue}
          description={
            isEdit
              ? "What one unit is worth today. Leave blank to keep the figure already on record."
              : "What one unit is worth today, if that is no longer what it cost. Optional."
          }
        />
      </div>
      <FieldDescription>
        No currency is assumed — the column is a number and the school&rsquo;s
        own accounts decide what it is in.
      </FieldDescription>
    </FieldGroup>
  </FieldSet>
);

interface InitialResponsibilityFieldsetProps {
  managerStaffId: string | null;
  custodianStaffId: string | null;
  isLoading: boolean;
  errors: ItemFormErrors;
  onManagerChange: (staffId: string | null) => void;
  onCustodianChange: (staffId: string | null) => void;
}

/**
 * Who is in charge, and who is holding it — recorded once, at creation.
 *
 * `createItem` seeds the first `inventoryCustodyHistory` row from these two, with
 * `reason: null` — the single case `inventory_custody_history_reason_required`
 * exempts, because a first assignment onto an empty slot displaces nobody.
 * Afterwards the two belong to `custody.transfer` and `assignManager`, which each
 * write a history row *and* a ledger action and each demand a reason.
 *
 * **Hence the different wording from the transfer dialogs: "Initially in charge of"
 * and "Initially held by"** rather than "In charge of this item" and "Hand it to".
 * That is not decoration — it tells the reader this choice is recorded once, here,
 * without a cause, and that the custody dialogs own these two columns from now on.
 * Both are optional: an item can sit in the store with nobody accountable for it,
 * and the register flags exactly those rows.
 */
const InitialResponsibilityFieldset = ({
  managerStaffId,
  custodianStaffId,
  isLoading,
  errors,
  onManagerChange,
  onCustodianChange,
}: InitialResponsibilityFieldsetProps) => (
  <FieldSet>
    <FieldLegend>Responsibility, recorded once</FieldLegend>
    <FieldGroup>
      <StaffComboboxField
        value={managerStaffId}
        onChange={onManagerChange}
        label="Initially in charge of"
        description="The member of staff accountable for this item. Optional — an item can sit in the store with nobody accountable for it, and the register flags those rows."
        error={errors.managerStaffId}
        disabled={isLoading}
        allowClear
      />
      <StaffComboboxField
        value={custodianStaffId}
        onChange={onCustodianChange}
        label="Initially held by"
        description="The member of staff carrying it away today. Optional — leave blank if it is going on the shelf."
        error={errors.custodianStaffId}
        disabled={isLoading}
        allowClear
      />
      <FieldDescription>
        Both are written to the item&rsquo;s custody history from the moment it
        is created, with no reason attached — a first assignment displaces
        nobody. After this, custody moves through Transfer custody and the
        manager through Assign manager, and both record who changed it and why.
      </FieldDescription>
    </FieldGroup>
  </FieldSet>
);

export interface EditActionProps {
  isLoading: boolean;
  handleTransferCustody: () => void;
  handleAssignManager: () => void;
  handleRecordStockIn: () => void;
  handleWriteOffStock: () => void;
}

/**
 * The four things this dialog cannot do, as four working buttons.
 *
 * `qty`, the two counters, the manager, the custodian **and** the SKU are all
 * absent from `items.update` on purpose, so there is nothing to render — six
 * greyed-out inputs would have been a lie about what the form can do, and a form
 * whose footer does nothing teaches the reader that the footer is decorative. So
 * the note says what is missing, why, and which action does each thing.
 */
const EditScopeNotice: React.FC<EditActionProps> = ({
  isLoading,
  handleTransferCustody,
  handleAssignManager,
  handleRecordStockIn,
  handleWriteOffStock,
}) => (
  /*
   * `text-warning-ink` and not `text-gold`: this is a paragraph of body copy at
   * `text-sm` on `bg-accent/10`, where `--gold` is 3.65:1 — under AA for body
   * text. The border and the fill stay on `accent`, because those are surfaces
   * rather than ink and `--gold` was never the problem. One token for warning
   * *text* everywhere in this feature; the arithmetic is in
   * `packages/ui/src/styles/globals.css`.
   */
  <div className="border-accent/50 bg-accent/10 text-warning-ink border p-3">
    <p className="flex items-center gap-2 text-sm font-medium">
      <IconInfoCircle className="size-4 shrink-0" />
      What this dialog cannot change
    </p>
    <p className="mt-1 text-sm">
      The count, the asset tags, the SKU, the manager and the custodian are not
      editable here, and that is a rule rather than an oversight. A count is a
      consequence of stock movements; a SKU is the identity every ledger row
      refers to; and a custody pointer is only ever moved by the action that
      also writes the history row, which is what makes the trail trustworthy.
    </p>
    <div className="mt-2 flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isLoading}
        onClick={handleRecordStockIn}
        data-icon="inline-start"
      >
        <IconPackageExport data-icon="inline-start" />
        Record stock in
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isLoading}
        onClick={handleWriteOffStock}
        data-icon="inline-start"
      >
        <IconTrash data-icon="inline-start" />
        Write off stock
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isLoading}
        onClick={handleTransferCustody}
        data-icon="inline-start"
      >
        <IconSwitchHorizontal data-icon="inline-start" />
        Transfer custody
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isLoading}
        onClick={handleAssignManager}
        data-icon="inline-start"
      >
        <IconUserCheck data-icon="inline-start" />
        Assign manager
      </Button>
    </div>
  </div>
);

// ─── Submit ─────────────────────────────────────────────────────────────────

/**
 * The non-blank asset tags, in one pass.
 *
 * The filter is `normalizeInventoryKey(...).length > 0` rather than
 * `tag.trim().length > 0` because that is the test `resolveAssetTags` in
 * `create-item.ts` applies, and the count the form checks against `qty` has to be
 * the count the server will compute — a row of three spaces is a blank there, and
 * if it were a tag here the form would pass a length check the server then refuses.
 */
const enteredTags = (rows: TagRow[]): string[] => {
  const result: string[] = [];
  for (const row of rows) {
    if (normalizeInventoryKey(row.value).length > 0) {
      result.push(row.value);
    }
  }
  return result;
};

/** The outcome of a client-side validation pass: values, or the fields to mark. */
type SubmitOutcome =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; errors: ItemFormErrors };

/**
 * The one "no category" outcome, shared by both modes.
 *
 * It was written out twice — once in the create branch, once (after this fix) in
 * the edit branch — and two copies of a rule that the server also enforces is two
 * places for the wording to drift. One frozen object, returned by both, so the two
 * modes cannot disagree about what an item without a category is.
 */
const MISSING_CATEGORY: SubmitOutcome = {
  ok: false,
  errors: {
    categoryId:
      "Choose a category, or add one below — an item cannot exist without one.",
  },
};

interface BuildSubmitInput {
  isEdit: boolean;
  values: FormValues;
  qty: number;
  category: CategoryOption | null;
  sku: string;
  tagRows: TagRow[];
  tagError: string | undefined;
  onHandCount: number;
  managerStaffId: string | null;
  custodianStaffId: string | null;
}

/**
 * Everything the form can decide on its own, in one place.
 *
 * The point of pulling this out of the component is that the rules become
 * readable as a list: the schema has the fields, and the three rules a schema
 * cannot express are the category, the asset-tag count and the reorder level. A
 * `handleSubmit` that grew them inline was forty branches of "and then"; here each
 * one is a line with a reason attached, and the component is left holding state.
 */
const buildSubmitOutcome = ({
  isEdit,
  values,
  qty,
  category,
  sku,
  tagRows,
  tagError,
  onHandCount,
  managerStaffId,
  custodianStaffId,
}: BuildSubmitInput): SubmitOutcome => {
  const payload = {
    name: values.name,
    description: values.description,
    unit: values.unit,
    minQty: toQuantity(values.minQty),
    borrowable: values.borrowable,
    condition: values.condition,
    location: values.location,
    ...(values.purchaseValue?.trim()
      ? { purchaseValue: values.purchaseValue.trim() }
      : {}),
    ...(values.currentValue?.trim()
      ? { currentValue: values.currentValue.trim() }
      : {}),
  };

  if (isEdit) {
    const result = v.safeParse(editItemSchema, payload);
    if (!result.success) {
      return {
        ok: false,
        errors: issuesToErrors<ItemFormField>(result.issues),
      };
    }

    /*
     * The category, on edit as well as on create.
     *
     * **This key was missing here and the omission was client-side only.** The
     * backend has always accepted a re-categorisation: `update-item.ts` lists
     * `categoryId` among the fields it picks (`:89`), asserts the category exists
     * (`:113`) and applies it with `input.categoryId ?? existing.categoryId`
     * (`:148`). So the request the client used to send — everything except the
     * category — was a *valid* `updateItem` call that quietly left
     * `category_id` alone, and the success toast said the item was updated while
     * the row, the category filter and the category dot had not moved. Nothing
     * downstream of this function could have caught it: there is no error to
     * handle, only a value that never left the browser. Written down here because
     * this is exactly the omission that gets "fixed" in `packages/api` next time
     * somebody finds it, by adding a server-side guard for a condition the server
     * never had.
     *
     * The check comes after the schema parse and before the cross-field rule below
     * for the same reason the create branch puts it there: a name that is empty is
     * the nearer problem, and reporting one field per round trip is better than
     * reporting the category and leaving the name to be found on the next submit.
     */
    if (category === null) {
      return MISSING_CATEGORY;
    }

    // `updateItem` refuses a reorder level above the count on the shelf, and the
    // count is not a field on this form — so this is the one cross-field rule the
    // edit form still owns. Checking it here puts the message under the field
    // that caused it instead of in a toast.
    if (result.output.minQty > onHandCount) {
      return {
        ok: false,
        errors: {
          minQty: `The reorder level cannot be above the ${onHandCount} unit(s) currently on hand. The count changes through stock in and stock out.`,
        },
      };
    }

    /*
     * `categoryId` is added *after* the spread for the same reason the create
     * branch adds it there: it is not a key of `editItemSchema`, so `result.output`
     * cannot carry it, and the id is parsed through the repository's own schema
     * rather than asserted. `editItemSchema` validates shape (it runs against
     * plain strings from `<input>`s) while the branded id on the wire is the
     * thing worth parsing — one job each, and neither is doing the other's.
     */
    return {
      ok: true,
      values: {
        ...result.output,
        categoryId: v.parse(inventoryCategoryIdSchema, category.id),
      },
    };
  }

  const result = v.safeParse(createItemSchema, { ...payload, qty });
  if (!result.success) {
    return { ok: false, errors: issuesToErrors<ItemFormField>(result.issues) };
  }

  if (category === null) {
    return MISSING_CATEGORY;
  }

  if (tagError) {
    return { ok: false, errors: { uniqueIds: tagError } };
  }

  const trimmedSku = sku.trim().toUpperCase();
  if (trimmedSku !== "" && !SKU_PATTERN.test(trimmedSku)) {
    return { ok: false, errors: { sku: "A SKU must look like INV-12345" } };
  }

  /*
   * Ids are branded on the wire and plain strings in this component's state (a
   * `Combobox` hands back a `string`), so they are parsed through the repository's
   * own id schemas on the way out. That is a validation rather than an assertion: an
   * id that is not one is caught here instead of turning into a foreign-key
   * violation from the driver.
   *
   * The two staff pointers are omitted rather than sent as `null` when they were
   * left blank, which is the same distinction `updateItem` reads on the other side:
   * absent is "no initial assignment recorded", and the server's own default is
   * null anyway.
   */
  return {
    ok: true,
    values: {
      ...result.output,
      categoryId: v.parse(inventoryCategoryIdSchema, category.id),
      ...(trimmedSku === "" ? {} : { sku: trimmedSku }),
      uniqueIds: enteredTags(tagRows),
      ...(managerStaffId
        ? { managerStaffId: v.parse(staffIdSchema, managerStaffId) }
        : {}),
      ...(custodianStaffId
        ? { custodianStaffId: v.parse(staffIdSchema, custodianStaffId) }
        : {}),
    },
  };
};

/**
 * The form's starting values, for either mode.
 *
 * A create form's defaults are decisions, so they are written out rather than left
 * implicit: a new line is called *Good*, counted in *unit*, has a reorder level of
 * zero (no warning line until somebody sets one) and is not borrowable — which is
 * the safe direction, since a non-borrowable item is refused to whoever tries to
 * take it rather than handed out. An edit form's values are simply the row's.
 */
const initialFormValues = (item: InventoryItemView | undefined): FormValues => {
  if (!item) {
    return {
      name: "",
      description: "",
      unit: "unit",
      minQty: "0",
      borrowable: false,
      condition: "Good",
      location: "",
      purchaseValue: "",
      currentValue: "",
    };
  }

  return {
    name: item.name,
    description: item.description,
    unit: item.unit || "unit",
    minQty: String(item.minQty),
    borrowable: item.borrowable,
    condition: item.condition,
    location: item.location,
    purchaseValue: item.purchaseValue ?? "",
    currentValue: item.currentValue ?? "",
  };
};

/**
 * The category the form opens on, and the one case where it has to be built rather
 * than found.
 *
 * `categories.list` returns every category whether or not anything uses it, so the
 * item's own category is normally in the list — but if it was deleted between the
 * list being fetched and this row being opened, the option is missing. Falling back
 * to a synthesised one built from the row's own `categoryName` / `categoryColor`
 * means the edit form still opens with the name the item was registered under
 * instead of an empty picker that silently re-categorises the item on save.
 *
 * The id is parsed through the repository's own schema rather than asserted: the
 * wire carries a plain `string` where `CategoryOption` carries a branded id, and
 * parsing is a validation rather than a promise.
 */
const initialCategory = (
  item: InventoryItemView | undefined,
  categories: CategoryOption[]
): CategoryOption | null => {
  if (!item) {
    return null;
  }

  return (
    categories.find((option) => option.id === item.categoryId) ?? {
      id: v.parse(inventoryCategoryIdSchema, item.categoryId),
      name: item.categoryName,
      normalizedName: normalizeInventoryKey(item.categoryName),
      color: item.categoryColor,
      createdAt: item.createdAt,
    }
  );
};

interface InventoryItemFormProps {
  formId: string;
  categories: CategoryOption[];
  initialData?: InventoryItemView;
  isLoading: boolean;
  serverErrors: ItemFormErrors;
  onCreateCategory: (name: string) => Promise<CategoryOption | null>;
  isCreatingCategory: boolean;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  /** Only supplied in edit mode — the create form has nothing to point at. */
  editActions?: EditActionProps;
}

/**
 * Create and edit, as one form.
 *
 * The mode is `initialData`'s existence rather than a prop, because that is the one
 * fact that decides every difference between the two: which fields exist, which
 * schema validates them, and whether the note about what cannot be changed is
 * rendered at all.
 */
const InventoryItemForm = ({
  formId,
  categories,
  initialData,
  isLoading,
  serverErrors,
  onCreateCategory,
  isCreatingCategory,
  onSubmit,
  editActions,
}: InventoryItemFormProps) => {
  const isEdit = initialData !== undefined;

  const [values, setValues] = useState<FormValues>(() =>
    initialFormValues(initialData)
  );
  const [category, setCategory] = useState<CategoryOption | null>(() =>
    initialCategory(initialData, categories)
  );
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState(initialData?.qty ?? 1);
  const [tagRows, setTagRows] = useState<TagRow[]>(() => [newTagRow()]);
  const [managerStaffId, setManagerStaffId] = useState<string | null>(null);
  const [custodianStaffId, setCustodianStaffId] = useState<string | null>(null);
  const [clientErrors, setClientErrors] = useState<ItemFormErrors>({});

  /**
   * Client errors win over server errors for the same field, because they are the
   * more recent statement about it: the form clears its own errors at the top of
   * every submit, so anything left in `serverErrors` is from the last round trip and
   * is still the best thing to say until the user edits that field.
   */
  const errors: ItemFormErrors = { ...serverErrors, ...clientErrors };
  const duplicates = useMemo(() => duplicateTagRows(tagRows), [tagRows]);

  /**
   * The rule the object schema cannot hold, mirrored from `resolveAssetTags` in
   * `create-item.ts`: the moment one tag is typed the count has to equal the
   * quantity, and the comparison is on the *normalized* tag — so a row of three
   * spaces is a blank, not a tag. That is the same count the live counter above the
   * rows shows, which is why the two can never disagree.
   */
  const enteredTagCount = tagRows.filter(
    (row) => normalizeInventoryKey(row.value).length > 0
  ).length;

  const tagError = resolveTagError(enteredTagCount, qty, duplicates);

  const handleQtyChange = (raw: string) => {
    setQty(toQuantity(raw));
    setTagRows((previous) => resizeTagRows(previous, toQuantity(raw)));
  };

  const handleValuesChange = (patch: Partial<FormValues>) => {
    setValues((previous) => ({ ...previous, ...patch }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setClientErrors({});

    const outcome = buildSubmitOutcome({
      isEdit,
      values,
      qty,
      category,
      sku,
      tagRows,
      tagError,
      onHandCount: initialData?.qty ?? qty,
      managerStaffId,
      custodianStaffId,
    });

    if (!outcome.ok) {
      setClientErrors(outcome.errors);
      return;
    }

    await onSubmit(outcome.values);
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      <IdentityFieldset
        formId={formId}
        errors={errors}
        isLoading={isLoading}
        isEdit={isEdit}
        values={values}
        categories={categories}
        category={category}
        sku={sku}
        onChange={handleValuesChange}
        onCategoryChange={setCategory}
        onSkuChange={setSku}
        onCreateCategory={onCreateCategory}
        isCreatingCategory={isCreatingCategory}
      />

      <StockFieldset
        formId={formId}
        errors={errors}
        isLoading={isLoading}
        isEdit={isEdit}
        qty={isEdit ? (initialData?.qty ?? 0) : qty}
        onQtyChange={handleQtyChange}
        minQty={values.minQty}
        onMinQtyChange={(raw) => handleValuesChange({ minQty: raw })}
        tagRows={tagRows}
        duplicates={duplicates}
        onTagRowsChange={setTagRows}
      />

      <ConditionFieldset
        formId={formId}
        errors={errors}
        isLoading={isLoading}
        values={values}
        onChange={handleValuesChange}
      />

      <ValuationFieldset
        formId={formId}
        errors={errors}
        isEdit={isEdit}
        values={values}
        onChange={handleValuesChange}
      />

      {isEdit ? null : (
        <InitialResponsibilityFieldset
          managerStaffId={managerStaffId}
          custodianStaffId={custodianStaffId}
          isLoading={isLoading}
          errors={errors}
          onManagerChange={setManagerStaffId}
          onCustodianChange={setCustodianStaffId}
        />
      )}

      {editActions ? <EditScopeNotice {...editActions} /> : null}
    </form>
  );
};

// ─── Dialogs ────────────────────────────────────────────────────────────────

export interface InventoryItemDialogsProps {
  categories: CategoryOption[];
  isCreateOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  isEditOpen: boolean;
  onEditOpenChange: (open: boolean) => void;
  selectedItem: InventoryItemView | null;
  isCreatePending: boolean;
  isEditPending: boolean;
  onCreateSubmit: (values: Record<string, unknown>) => Promise<void>;
  onEditSubmit: (values: Record<string, unknown>) => Promise<void>;
  /** Handed to the edit form's note, so the buttons reach the right dialogs. */
  editActions: EditActionProps;
}

/**
 * Create and edit, composed the way `class-dialogs.tsx` composes them: the submit
 * button lives in the dialog's footer, outside the `<form>`, and reaches it with
 * `form="id"`.
 *
 * That is not a stylistic choice. The footer has to stay put while the form body
 * scrolls, and a `<form>` cannot be a flex child of a scrolling column without the
 * footer scrolling away with it.
 *
 * **The create form is keyed on `isCreateOpen`, and that key is the reset.** The
 * repeated asset-tag rows are the reason it is not optional: a create dialog that
 * reopened carrying the last item's tags would submit them against a different item,
 * and the server would either refuse a tag already on file or — for tags that are
 * not — attach somebody else&rsquo;s equipment to this line. Remounting is what
 * guarantees the rows come back empty and the counters at zero.
 */
export const InventoryItemDialogs = ({
  categories,
  isCreateOpen,
  onCreateOpenChange,
  isEditOpen,
  onEditOpenChange,
  selectedItem,
  isCreatePending,
  isEditPending,
  onCreateSubmit,
  onEditSubmit,
  editActions,
}: InventoryItemDialogsProps) => {
  const queryClient = useQueryClient();
  const [createErrors, setCreateErrors] = useState<ItemFormErrors>({});
  const [editErrors, setEditErrors] = useState<ItemFormErrors>({});

  /**
   * The inline "New category" write. It lives here rather than only on the category
   * panel because the item form is where a missing category is discovered, and a
   * storekeeper who has to abandon a twenty-field form to fix a dropdown will not
   * fix the dropdown.
   *
   * The invalidation is `invalidateInventory(…, "category")` rather than a
   * hand-rolled `categories.list` key, for the reason the shared module exists at
   * all: a category is named by every register row that uses it, so the register
   * has to re-read too — and the scope is the one place that says so.
   */
  const createCategoryMutation = useMutation(
    orpc.inventory.categories.create.mutationOptions({
      onSuccess: async (created) => {
        toast.success(`Category "${created.name}" added`);
        await invalidateInventory(queryClient, "category");
      },
      onError: (error) => {
        toast.error(
          formatApiErrorMessage(error, "Could not add that category")
        );
      },
    })
  );

  const handleCreateCategory = useCallback(
    async (name: string): Promise<CategoryOption | null> => {
      const trimmed = name.trim();
      if (trimmed.length === 0) {
        return null;
      }

      try {
        return await createCategoryMutation.mutateAsync({ name: trimmed });
      } catch {
        // The mutation's own `onError` has already toasted the server's sentence,
        // which names the duplicate. Returning null leaves the form open with what
        // was typed instead of closing it over a failure.
        return null;
      }
    },
    [createCategoryMutation]
  );

  /**
   * Server-side validation, mapped back onto the fields — and nothing else.
   *
   * `validationFieldErrors` exists for exactly this: `createItem` validates against
   * the same `inventoryItemInsertSchema` the form does, so a message about a field
   * the user is looking at has to land on that field rather than in a toast. Rules
   * with no single field behind them — a duplicate asset tag on file, a reorder level
   * above the count — still arrive as the server's sentence in a toast, which is the
   * right place for them.
   *
   * **The catch deliberately does not toast, and that is not an omission.**
   * `onCreateSubmit` is `handleCreateSubmit` in `inventory-page.tsx`, which awaits
   * `mutateAsync`; that rejection has *already* been through the mutation
   * observer's own `onError`, which is where the toast comes from. Toasting here
   * too printed the identical sentence twice for every validation failure, every
   * duplicate SKU and every dropped connection — and the mutation observer is the
   * only one of the two that survives this dialog unmounting, so it has to be the
   * one that speaks. `custody-dialogs.tsx` reached the same conclusion from the
   * other direction and its submit handlers are the pattern these two now match.
   *
   * Neither handler rethrows: the dialog is closed by the caller on success, so the
   * failure is already reported and letting it escape would put an unhandled
   * rejection on the form's submit handler.
   */
  const handleCreateSubmit = async (values: Record<string, unknown>) => {
    setCreateErrors({});
    try {
      await onCreateSubmit(values);
    } catch (error) {
      setCreateErrors(validationFieldErrors<keyof ItemFormErrors>(error));
    }
  };

  const handleEditSubmit = async (values: Record<string, unknown>) => {
    setEditErrors({});
    try {
      await onEditSubmit(values);
    } catch (error) {
      setEditErrors(validationFieldErrors<keyof ItemFormErrors>(error));
    }
  };

  return (
    <>
      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCreateErrors({});
          }
          onCreateOpenChange(open);
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle>Register an item</DialogTitle>
            <DialogDescription>
              Add a line to the store: what it is, how many there are, and what
              each one is tagged
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <InventoryItemForm
              key={`create-${String(isCreateOpen)}`}
              formId="create-inventory-item-form"
              categories={categories}
              isLoading={isCreatePending}
              serverErrors={createErrors}
              onCreateCategory={handleCreateCategory}
              isCreatingCategory={createCategoryMutation.isPending}
              onSubmit={handleCreateSubmit}
            />
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onCreateOpenChange(false)}
              disabled={isCreatePending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="create-inventory-item-form"
              disabled={isCreatePending}
            >
              {isCreatePending ? "Saving..." : "Register item"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isEditOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditErrors({});
          }
          onEditOpenChange(open);
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle>Edit {selectedItem?.name ?? "item"}</DialogTitle>
            <DialogDescription>
              {selectedItem ? (
                <span className="font-mono">{selectedItem.sku}</span>
              ) : (
                "Update the item's descriptive details"
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {selectedItem ? (
              <InventoryItemForm
                key={`edit-${selectedItem.id}`}
                formId="edit-inventory-item-form"
                categories={categories}
                initialData={selectedItem}
                isLoading={isEditPending}
                serverErrors={editErrors}
                onCreateCategory={handleCreateCategory}
                isCreatingCategory={createCategoryMutation.isPending}
                onSubmit={handleEditSubmit}
                editActions={editActions}
              />
            ) : null}
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onEditOpenChange(false)}
              disabled={isEditPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="edit-inventory-item-form"
              disabled={isEditPending}
            >
              {isEditPending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
