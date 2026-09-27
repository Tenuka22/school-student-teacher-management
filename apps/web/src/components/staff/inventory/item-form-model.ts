/**
 * The item form's model: constants, schemas, the asset-tag algebra, and the one
 * function that decides whether a submit may go out.
 *
 * **This file is the half of the item form that has no markup in it**, split out
 * of `item-dialogs.tsx` along a real seam rather than for its length. The rule a
 * form is built from is the part worth being able to read as a list, and a
 * `handleSubmit` that owned the schemas, the tag arithmetic, the two cross-field
 * rules and the state in one function could only be read by running it. Nothing
 * here imports React, and nothing here renders — so a change to a validation
 * rule cannot quietly acquire a side effect, and the fields in
 * `item-form-fields.tsx` cannot invent a rule this file does not know about.
 *
 * No barrel: the two importers reach this file by path.
 */

import {
  itemConditionSchema,
  normalizeInventoryKey,
} from "@school-student-teacher-management/db/constants/inventory";
import {
  inventoryCategoryIdSchema,
  moneyStringSchema,
} from "@school-student-teacher-management/db/schema/inventory";
import { staffIdSchema } from "@school-student-teacher-management/db/schema/staff";
import * as v from "valibot";

import type {
  CategoryOption,
  InventoryItemView,
} from "@/components/staff/inventory/inventory-types";

/** `createItem`'s own ceiling on `qty`, restated so the input can enforce it. */
export const MAX_ITEM_QTY = 1000;

/**
 * The units a school's store actually counts things in. `unit` is a free
 * `text` column with no CHECK behind it — a school that counts something in
 * "reams" is still allowed to — so this is a picklist of common answers,
 * not a closed set: `CUSTOM_UNIT` is always the last option, and choosing it
 * reveals a plain text field for anything not on the list.
 */
export const UNIT_PRESETS = [
  "unit",
  "box",
  "set",
  "pair",
  "pack",
  "dozen",
  "roll",
  "kg",
  "litre",
] as const;

export const CUSTOM_UNIT = "__custom__";

/** `inventory_item_sku_format` — the CHECK the column itself carries. */
export const SKU_PATTERN = /^INV-\d{5}$/u;

/**
 * `numeric(14,2)`, the money columns' own precision and scale.
 *
 * Duplicated from `shared/money-field.tsx` rather than imported: that module's
 * constant is private to the shared control, and this file is the second money
 * input on the form. Two copies of a column's precision, both read from the same
 * schema comment, is a smaller risk than a cross-module export for one regex.
 */
export const MONEY_PATTERN = /^\d{1,12}(?:\.\d{1,2})?$/u;

export type ItemFormField =
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

export type ItemFormErrors = Partial<Record<ItemFormField, string>>;

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
 * correct — but the create branch says so out loud, and this one does not, which is
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

export const toQuantity = (raw: string): number => {
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
export interface TagRow {
  id: number;
  value: string;
}

let nextTagRowId = 0;

export const newTagRow = (value = ""): TagRow => {
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
export const resizeTagRows = (rows: TagRow[], qty: number): TagRow[] => {
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
export const duplicateTagRows = (rows: TagRow[]): Set<number> => {
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

/**
 * The non-blank asset tags, in one pass.
 *
 * The filter is `normalizeInventoryKey(...).length > 0` rather than
 * `tag.trim().length > 0` because that is the test `resolveAssetTags` in
 * `create-item.ts` applies, and the count the form checks against `qty` has to be
 * the count the server will compute — a row of three spaces is a blank there, and
 * if it were a tag here the form would pass a length check the server then refuses.
 */
export const enteredTagCount = (rows: TagRow[]): number => {
  let count = 0;
  for (const row of rows) {
    if (normalizeInventoryKey(row.value).length > 0) {
      count += 1;
    }
  }
  return count;
};

/** The same test as `enteredTagCount`, returning the tags themselves. */
export const enteredTags = (rows: TagRow[]): string[] => {
  const result: string[] = [];
  for (const row of rows) {
    if (normalizeInventoryKey(row.value).length > 0) {
      result.push(row.value);
    }
  }
  return result;
};

/** The two ways a tag list can be wrong, named on the field rather than toasted. */
export const resolveTagError = (
  entered: number,
  qty: number,
  duplicates: Set<number>
): string | undefined => {
  if (entered > 0 && entered !== qty) {
    return `Enter one asset tag for each of the ${qty} unit(s) — ${entered} entered so far.`;
  }

  if (duplicates.size > 0) {
    return "The same asset tag appears more than once. A tag identifies one physical unit.";
  }

  return undefined;
};

// ─── Form values ────────────────────────────────────────────────────────────

/** What the form looks like when it is about to be submitted.
 *
 * `minQty` is a **string** here even though it is a number on the wire, because it
 * is an `<input type="number">` bound to a controlled value: a number in state
 * would render `""` for an empty box and `0` for a box holding a zero, and the
 * difference between "not answered yet" and "answered zero" is exactly what the
 * reorder-level field needs. It is parsed once, at submit.
 */
export interface FormValues {
  name: string;
  description: string;
  unit: string;
  minQty: string;
  borrowable: boolean;
  condition: string;
  location: string;
  purchaseValue: string;
  currentValue: string;
  imageFileId: string | null;
}

/**
 * The form's starting values, for either mode.
 *
 * A create form's defaults are decisions, so they are written out rather than left
 * implicit: a new line is called *Good*, counted in *unit*, has a reorder level of
 * zero (no warning line until somebody sets one) and is not borrowable — which is
 * the safe direction, since a non-borrowable item is refused to whoever tries to
 * take it rather than handed out. An edit form's values are simply the row's.
 */
export const initialFormValues = (
  item: InventoryItemView | undefined
): FormValues => {
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
      imageFileId: null,
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
    imageFileId: item.imageFileId,
  };
};

// ─── Category ───────────────────────────────────────────────────────────────

/**
 * The three facts the item form's category picker actually draws.
 *
 * **This is the whole fix for the `Property 'icon' is missing` type error, and
 * the reason it is a `Pick` rather than a cast or a widened optional.** The
 * category picker renders a dot in `color` beside `name`, and submits `id`. It
 * reads nothing else — `normalizedName` is the server's dedupe key and `icon` is a
 * Tabler component name no screen in this feature consumes. The one object here
 * that is *built* rather than fetched — `initialCategory`'s stand-in for a
 * category deleted between the list being read and the row being opened — has the
 * item row to build itself from, and the item row carries `categoryName` and
 * `categoryColor` and **no icon**. So the mismatch was not a missing field: it was
 * a picker asking for a fifth fact the row it is built from cannot supply, and the
 * object literal was the only place that could be seen.
 *
 * The alternative — inventing `"category"`, the column's `default` — would have
 * compiled and been a lie: it would put a real-looking icon key on a record the
 * database has never held one for, in the one type in the feature that is derived
 * from the router rather than hand-written (`inventory-types.ts` says so at the
 * top of the file). `CategoryOption` itself is untouched and still requires
 * `icon`, because `categories.list` really does project it and the categories
 * panel is entitled to it.
 */
export type CategoryChoice = Pick<CategoryOption, "id" | "name" | "color">;

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
 * wire carries a plain `string` where the picker's id is a branded one, and
 * parsing is a validation rather than a promise.
 */
export const initialCategory = (
  item: InventoryItemView | undefined,
  categories: CategoryOption[]
): CategoryChoice | null => {
  if (!item) {
    return null;
  }

  const listed = categories.find((option) => option.id === item.categoryId);
  if (listed) {
    return { id: listed.id, name: listed.name, color: listed.color };
  }

  return {
    id: v.parse(inventoryCategoryIdSchema, item.categoryId),
    name: item.categoryName,
    color: item.categoryColor,
  };
};

// ─── Submit ─────────────────────────────────────────────────────────────────

/** The outcome of a client-side validation pass: values, or the fields to mark. */
export type SubmitOutcome =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; errors: ItemFormErrors };

/**
 * The one "no category" outcome, shared by both modes.
 *
 * It was written out twice — once in the create branch, once (after this fix) in
 * the edit branch — and two copies of a rule that the server also enforces is two
 * places for the wording to drift. One frozen object, returned by both, so the two
 * modes cannot disagree about what an item without a category is.
 *
 * **The recovery it names used to be a feature that has been removed.** It said
 * "add one below" and pointed at an inline "New category" row; `categories.create`
 * no longer exists, so the sentence sent a clerk looking for a control that was not
 * on the form. It now names the action that is: the register's own Categories
 * panel, which is where `categories.seed` lives.
 */
const MISSING_CATEGORY: SubmitOutcome = {
  ok: false,
  errors: {
    categoryId:
      "Choose a category, or seed the eight starter categories from the register's Categories panel — an item cannot exist without one.",
  },
};

export interface BuildSubmitInput {
  isEdit: boolean;
  values: FormValues;
  qty: number;
  category: CategoryChoice | null;
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
export const buildSubmitOutcome = ({
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
     * `categoryId` among the fields it picks, asserts the category exists and
     * applies it with `input.categoryId ?? existing.categoryId`. So the request
     * the client used to send — everything except the category — was a *valid*
     * `updateItem` call that quietly left `category_id` alone, and the success
     * toast said the item was updated while the row, the category filter and the
     * category dot had not moved. Nothing downstream of this function could have
     * caught it: there is no error to handle, only a value that never left the
     * browser. Written down here because this is exactly the omission that gets
     * "fixed" in `packages/api` next time somebody finds it, by adding a
     * server-side guard for a condition the server never had.
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
        imageFileId: values.imageFileId,
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
      ...(values.imageFileId ? { imageFileId: values.imageFileId } : {}),
      ...(managerStaffId
        ? { managerStaffId: v.parse(staffIdSchema, managerStaffId) }
        : {}),
      ...(custodianStaffId
        ? { custodianStaffId: v.parse(staffIdSchema, custodianStaffId) }
        : {}),
    },
  };
};

// ─── Focus recovery ─────────────────────────────────────────────────────────

/**
 * The attribute that names which field a control belongs to.
 *
 * Focus recovery cannot be a lookup table of `formId`-derived ids, because two
 * of this form's controls mint their own ids: `MoneyField` and
 * `StaffComboboxField` both call `useId`, and the browser never tells a caller
 * what a child's `useId` produced. So each field marks its own wrapper with this
 * attribute and the walk is done over the DOM, where `querySelectorAll` returns
 * **document order** — which is the order a person filling the form in top to
 * bottom reads, and therefore the right "first invalid field".
 */
export const FIELD_ANCHOR = "data-item-field";

/**
 * The controls a focus walk will accept, most specific first.
 *
 * `SelectTrigger` is a `<button role="combobox">` and a base-ui `Combobox` input is
 * a plain `<input>`, so the selector has to cover both. A file input is excluded
 * deliberately: focusing it opens a system dialog the user did not ask for, and
 * the photo field is not one that can fail validation in this form.
 */
const FOCUSABLE_IN_FIELD =
  'input:not([type="file"]), textarea, select, [role="combobox"], button';

/**
 * Move focus to the first field in `errors`, in the order the form reads.
 *
 * **Valibot does not do this, and neither does `FieldError`.** A `role="alert"`
 * error is announced, and an announced error the user cannot see is not a
 * recovery: a form this long scrolls, the failing field is often above the fold,
 * and the browser's native "focus the first invalid control" only ever fires for
 * native constraint validation, which this form does not use. So a failed submit
 * that only paints red text on a field nobody is looking at is a failed submit.
 */
export const focusFirstInvalidField = (
  root: HTMLElement | null,
  errors: ItemFormErrors
): void => {
  if (!root) {
    return;
  }

  for (const anchor of root.querySelectorAll<HTMLElement>(
    `[${FIELD_ANCHOR}]`
  )) {
    const field = anchor.getAttribute(FIELD_ANCHOR) as ItemFormField | null;
    if (!field || !errors[field]) {
      continue;
    }

    anchor.querySelector<HTMLElement>(FOCUSABLE_IN_FIELD)?.focus();
    return;
  }
};
