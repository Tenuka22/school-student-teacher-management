/**
 * The item form's fields: one component per section of the form, and no rules.
 *
 * Every component here is presentational. It renders, it reports what was typed
 * upwards, and it shows the error it was handed — the decisions live in
 * `item-form-model.ts` and the state lives in `item-dialogs.tsx`. That is the seam
 * this file was split along: the form was one 2000-line module in which a change
 * to a validation rule and a change to a grid class were the same edit.
 *
 * Two conventions run through it, both of them load-bearing rather than stylistic:
 *
 * - **Every control is a shadcn control inside a `Field`.** There is no raw
 *   `input` + `label` anywhere, and the `Field` is what wires `aria-invalid`,
 *   `aria-required` and `aria-describedby` to the control inside it. Where a field
 *   renders two descriptions, they are given explicit distinct ids, because the
 *   `Field` auto-id is one id per field and two of them is a duplicate id in the
 *   document.
 * - **Every field wrapper carries `data-item-field`**, which is what
 *   `focusFirstInvalidField` walks after a failed submit. See the comment on
 *   `FIELD_ANCHOR` for why it is an attribute and not a lookup table.
 *
 * No barrel: importers reach this file by path.
 */

import {
  ITEM_CONDITIONS,
  itemConditionLabel,
} from "@school-student-teacher-management/db/constants/inventory";
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
  IconCamera,
  IconInfoCircle,
  IconPackageExport,
  IconRefresh,
  IconSwitchHorizontal,
  IconTrash,
  IconUserCheck,
  IconUpload,
} from "@tabler/icons-react";
import { useRef, useState } from "react";

import { CategoryIcon } from "@/components/staff/inventory/category-icon";
import type { CategoryOption } from "@/components/staff/inventory/inventory-types";
import type {
  CategoryChoice,
  FormValues,
  ItemFormErrors,
  TagRow,
} from "@/components/staff/inventory/item-form-model";
import {
  CUSTOM_UNIT,
  enteredTagCount,
  MONEY_PATTERN,
  MAX_ITEM_QTY,
  newTagRow,
  UNIT_PRESETS,
} from "@/components/staff/inventory/item-form-model";
import {
  PhotoCropDialog,
  readFileAsDataUrl,
} from "@/components/staff/inventory/photo-crop-dialog";
import {
  MoneyField,
  StaffComboboxField,
} from "@/components/staff/inventory/shared";

// ─── Asset tag rows ─────────────────────────────────────────────────────────

export interface AssetTagFieldsProps {
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
 * refuses a mismatch, while an entirely empty list means *mint them*: the server
 * writes `${sku}//1 … ${sku}//qty`, so a bulk line ("200 chairs") leaves
 * registration tagged like any other and every stock movement has unit rows to
 * move. That is a rule an object schema cannot express, so it lives on the form:
 * the rows track the quantity, a live count says how many are still missing, and
 * the two ways the list can be wrong (a partly filled list, the same tag twice)
 * are both named on the field. Learning this from the server's toast would have
 * thrown away a twenty-field form's worth of typing to be told its tags were
 * short.
 */
/**
 * The half of the counter line that follows "N of M entered".
 *
 * Three states, because blank rows mean two different things: a partly typed
 * list is work still to do ("still blank"), an untouched one is the *mint*
 * state the guide above describes, and a complete list has nothing to append.
 * Printing "still blank" on a pristine form would contradict the sentence a few
 * lines up — blank is not a gap there, it is a choice the store acts on.
 */
const blankRowsNote = (filled: number, missing: number): string => {
  if (missing === 0) {
    return "";
  }

  if (filled === 0) {
    return " — left empty, the store mints them";
  }

  return ` — ${missing} still blank`;
};

export const AssetTagFields = ({
  formId,
  rows,
  duplicates,
  error,
  disabled,
  onChange,
}: AssetTagFieldsProps) => {
  /*
   * The counter above the rows reads the *model's* count, not a local `trim()`.
   * `resolveAssetTags` in `create-item.ts` compares the normalized count against
   * `qty`, so a row of three spaces is a blank to the server and has to be a blank
   * here; two implementations of "is this tag filled in" is exactly the pair that
   * eventually disagrees and tells a clerk the form is satisfied when it is not.
   */
  const filled = enteredTagCount(rows);
  const missing = rows.length - filled;
  const errorId = `${formId}-tags-error`;
  const guideId = `${formId}-tags-guide`;

  return (
    <FieldSet aria-describedby={guideId}>
      <FieldLegend>Asset tags</FieldLegend>
      <FieldDescription id={guideId}>
        Optional to type, and it decides how this line is tracked. Leave every
        row blank and the register mints one tag per unit from this line&rsquo;s
        SKU — INV-00042//1 through INV-00042//4 — so a bulk line gets labelled
        too. Type your own tags instead when the labels are already on the
        devices: one per row, and it is all-or-nothing — fill in as many as
        there are units, or leave all of them blank.
      </FieldDescription>
      <FieldGroup>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs tabular-nums">
            {filled} of {rows.length} entered{blankRowsNote(filled, missing)}
          </p>
          {duplicates.size > 0 ? (
            <Badge variant="destructive">
              <IconAlertTriangle aria-hidden="true" />
              Repeated in {duplicates.size} row(s)
            </Badge>
          ) : null}
        </div>

        {rows.map((row, index) => {
          const inputId = `${formId}-tag-${row.id}`;
          const isDuplicate = duplicates.has(index);

          return (
            <Field
              key={row.id}
              invalid={isDuplicate || Boolean(error)}
              disabled={disabled}
            >
              <FieldLabel htmlFor={inputId}>
                Tag {index + 1}
                {isDuplicate ? (
                  <Badge variant="destructive" className="ml-1">
                    <IconAlertTriangle aria-hidden="true" />
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
                  /*
                   * Only the error that is actually rendered. An
                   * `aria-describedby` pointing at an id with nothing behind it is
                   * read by some screen readers as an empty description, and they
                   * then stop describing the field at all.
                   */
                  aria-describedby={error ? errorId : undefined}
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
                  <IconTrash aria-hidden="true" />
                </Button>
              </div>
            </Field>
          );
        })}

        <FieldError id={errorId}>{error}</FieldError>
        <FieldDescription>
          One tag per unit, and the number of rows follows the quantity above. A
          tag is how the school finds the thing again, so it is checked against
          the whole register: a tag already on file anywhere is refused. Leave
          these boxes empty and the store mints them from this line&rsquo;s SKU
          — INV-00042//1 upwards, one per unit.
        </FieldDescription>
      </FieldGroup>
    </FieldSet>
  );
};

// --- Unit field ---

interface UnitFieldProps {
  formId: string;
  value: string;
  error: string | undefined;
  disabled: boolean;
  onChange: (unit: string) => void;
}

/**
 * The unit of measure, as a select over the common answers plus a "Custom"
 * escape hatch — the same shape `CategoryPicker` uses for a value the
 * database does not close off. A value that already isn't one of the presets
 * (an item edited before this select existed, or a school's own word for
 * something) opens straight into the custom text field, pre-filled, rather
 * than silently swapping it for the nearest preset.
 */
const UnitField = ({
  formId,
  value,
  error,
  disabled,
  onChange,
}: UnitFieldProps) => {
  const isPreset = (UNIT_PRESETS as readonly string[]).includes(value);
  const [isCustom, setIsCustom] = useState(!isPreset && value.length > 0);
  const customId = `${formId}-unit-custom`;

  return (
    <Field
      data-item-field="unit"
      invalid={Boolean(error)}
      disabled={disabled}
      required
    >
      <FieldLabel required htmlFor={`${formId}-unit`}>
        Unit
      </FieldLabel>
      <Select
        value={isCustom ? CUSTOM_UNIT : value}
        onValueChange={(next) => {
          if (next === CUSTOM_UNIT) {
            setIsCustom(true);
            return;
          }
          setIsCustom(false);
          onChange(next ?? "unit");
        }}
      >
        <SelectTrigger id={`${formId}-unit`}>
          <SelectValue placeholder="unit" />
        </SelectTrigger>
        <SelectContent>
          {UNIT_PRESETS.map((preset) => (
            <SelectItem key={preset} value={preset}>
              {preset}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM_UNIT}>Custom…</SelectItem>
        </SelectContent>
      </Select>
      {/*
        The revealed text field is a *second* control inside the same `Field`, so
        it cannot claim the field's id and it has to name itself. Without a label
        of its own it reached the accessibility tree as an unlabelled input sitting
        directly under one labelled "Unit" — two inputs, one name.
      */}
      {isCustom ? (
        <Input
          id={customId}
          aria-label="Your own unit of measure"
          className="mt-2"
          maxLength={40}
          autoComplete="off"
          placeholder="Type your own, e.g. reams"
          value={isPreset ? "" : value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : null}
      <FieldDescription>
        What one of these is counted in — unit, chair, box, set. It is what the
        quantity is read as.
      </FieldDescription>
      <FieldError>{error}</FieldError>
    </Field>
  );
};

// --- Category picker ---

/**
 * What the picker needs to know about the category read beyond its rows.
 *
 * `categories` arrives as a plain array, and `[]` is three different facts: the
 * read is in flight, the read failed, or the store genuinely has no categories.
 * The page that owns the read cannot express the difference through an array, and
 * the picker cannot tell them apart from one — so it is told, and it says which.
 */
export interface CategoryListState {
  isLoading: boolean;
  isFailed: boolean;
  /** The server's sentence, via `formatApiErrorMessage`, or `null`. */
  failureMessage: string | null;
  isRetrying: boolean;
  onRetry: () => void;
}

interface CategoryPickerProps {
  formId: string;
  categories: CategoryOption[];
  state: CategoryListState;
  value: CategoryChoice | null;
  onChange: (category: CategoryChoice | null) => void;
  error: string | undefined;
  disabled: boolean;
}

/**
 * What the combobox's empty slot says, which is a question about the *read* and
 * not about the search.
 *
 * A helper rather than a nested ternary, because the four answers are four
 * different claims — two about this store's data and two about the connection to
 * the server — and reading them off a `categories.length` test in the markup is
 * how the second sentence became the first.
 */
const categoryEmptyMessage = (
  categories: number,
  state: CategoryListState
): string => {
  if (state.isLoading) {
    return "Loading the categories…";
  }
  if (state.isFailed) {
    return "The categories could not be read";
  }
  if (categories === 0) {
    return "No categories yet — seed the eight starters from the register";
  }
  return "No category matches that";
};

/**
 * The category, as a combobox.
 *
 * There used to be an inline "New category" row here, because `createItem`
 * requires a `categoryId` behind a `restrict` foreign key and a store with
 * nothing set up had no other way in. Categories are a closed set now —
 * the eight seeded ones, see `inventoryCategory`'s schema doc comment —
 * and `categories.create` no longer exists, so there is nothing left for this
 * picker to create. If the category picker is empty, the fix is the register's
 * own "Seed the eight starter categories" action, not a form typed here.
 *
 * Filtering is left to the combobox rather than sent to the server, unlike every
 * other picker in this feature — and that is because `categories.list` deliberately
 * returns *every* category, used or not. There is nothing to page through, and a
 * picker that needed a round trip to filter eight rows would be strictly worse.
 *
 * **The three states are the reason this component grew a `state` prop.** It used
 * to say "No categories yet — seed the eight starters from the register" for
 * `categories.length === 0`, which is a confident, well-written, false claim
 * whenever the read is what produced the empty array: a school whose categories
 * failed to load would be told, in the register's own voice, that it has none —
 * and the obvious response to that sentence is to go and create a duplicate of
 * every one of them. Loading now says it is loading, failure says what failed and
 * offers the retry, and only a read that *succeeded* with no rows is allowed to
 * claim the store is empty.
 */
const CategoryPicker = ({
  formId,
  categories,
  state,
  value,
  onChange,
  error,
  disabled,
}: CategoryPickerProps) => {
  const isUnavailable = disabled || state.isLoading || state.isFailed;

  return (
    <Field invalid={Boolean(error)} required>
      <FieldLabel required htmlFor={`${formId}-category`}>
        Category
      </FieldLabel>
      <Combobox<CategoryChoice>
        items={categories}
        value={value}
        onValueChange={(option) => onChange(option ?? null)}
        itemToStringLabel={(option) => option?.name ?? ""}
        isItemEqualToValue={(a, b) => a?.id === b?.id}
      >
        <ComboboxInput
          id={`${formId}-category`}
          placeholder={
            state.isLoading
              ? "Loading the categories…"
              : "Search the categories..."
          }
          disabled={isUnavailable}
          aria-busy={state.isLoading || undefined}
        />
        <ComboboxContent>
          <ComboboxEmpty>
            {categoryEmptyMessage(categories.length, state)}
          </ComboboxEmpty>
          <ComboboxList>
            {categories.map((option) => (
              <ComboboxItem key={option.id} value={option}>
                <span className="flex items-center gap-2">
                  {/*
                    The category's own glyph in its own colour, in place of the
                    bare dot this row used to draw: the picker's options are the
                    one place a reader meets the taxonomy before the register's
                    200 rows, and a chair for Furniture is quicker to find than
                    any of the eight colours on their own. `aria-hidden`, because
                    the name is beside it.
                  */}
                  <CategoryIcon
                    icon={option.icon}
                    color={option.color}
                    className="size-4 shrink-0"
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
        category filter reads this same fixed list.
      </FieldDescription>
      {/*
        The failure notice lives under the field, not inside the popup, because it
        has to be readable without opening the combobox and it has to survive the
        popup closing. It is the same shape `QueryErrorPanel` uses for a failed
        read: what could not be read, what the server said, and the way forward.
      */}
      {state.isFailed ? (
        <div
          aria-busy={state.isRetrying}
          className="border-destructive/30 bg-destructive/5 text-destructive flex flex-wrap items-center gap-x-2 gap-y-1 border px-2.5 py-2"
          role="alert"
        >
          <IconAlertTriangle aria-hidden="true" className="size-4 shrink-0" />
          <span className="text-xs">
            The categories could not be read.
            {state.failureMessage
              ? ` The server said: ${state.failureMessage}`
              : ""}{" "}
            Nothing you have typed has been lost.
          </span>
          <Button
            type="button"
            variant="outline"
            size="xs"
            loading={state.isRetrying}
            onClick={() => {
              state.onRetry();
            }}
            data-icon="inline-start"
          >
            <IconRefresh data-icon="inline-start" aria-hidden="true" />
            Try again
          </Button>
        </div>
      ) : null}
      <FieldError>{error}</FieldError>
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
 * nothing else. The purchase-value half now passes an id of its own for the same
 * reason, and for a second one: the create and edit dialogs can be mounted at the
 * same time, and the shared control's default id is a literal.
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
  disabled,
}: {
  formId: string;
  value: string;
  onChange: (next: string) => void;
  error: string | undefined;
  description: string;
  disabled: boolean;
}) => {
  const id = `${formId}-current-value`;
  const isMalformed = value !== "" && !MONEY_PATTERN.test(value);
  /*
   * Two descriptions, so two ids. A `FieldDescription` inside a `Field` defaults
   * to `${controlId}-description` — one id, and two of them is that id in the
   * document twice, which breaks the `aria-describedby` that points at it for
   * both. They are named here so each describes one thing.
   */
  const descriptionId = `${id}-description`;
  const constraintId = `${id}-constraint`;

  return (
    <Field
      data-item-field="currentValue"
      invalid={Boolean(error) || isMalformed}
      disabled={disabled}
    >
      <FieldLabel htmlFor={id}>Current value</FieldLabel>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <MoneyFieldError
        id={`${id}-error`}
        error={error}
        isMalformed={isMalformed}
      />
      <FieldDescription id={descriptionId}>{description}</FieldDescription>
      <FieldDescription id={constraintId}>
        Up to 12 digits with at most 2 decimal places. No thousands separators —
        type 1250.00, not 1,250.00.
      </FieldDescription>
    </Field>
  );
};

// ─── Photo ──────────────────────────────────────────────────────────────────

/**
 * The upload, as one function with three outcomes instead of a `try`/`catch` in a
 * component.
 *
 * There are exactly three ways this can end and they have three different
 * sentences, which is the reason it is not a bare `await fetch`: the server
 * refused it (and said why, in words meant for a person), the request never
 * arrived, or it arrived and the JSON had no `fileId` in it. The last of those is
 * folded into the first deliberately — a 200 with nothing usable in it is a
 * refusal as far as this form is concerned, and telling somebody "that worked"
 * about a file the item will not point at is worse than a plain failure.
 */
const uploadPhoto = async (
  file: File,
  handlers: {
    onUploaded: (fileId: string, url: string) => void;
    onRefused: (message: string) => void;
    onUnreachable: () => void;
  }
): Promise<void> => {
  const body = new FormData();
  body.set("file", file);

  let response: Response;
  try {
    response = await fetch("/api/files/upload", {
      method: "POST",
      body,
      credentials: "include",
    });
  } catch {
    handlers.onUnreachable();
    return;
  }

  const result = (await response.json().catch(() => null)) as {
    fileId?: string;
    url?: string;
    message?: string;
  } | null;

  if (!response.ok || !result?.fileId || !result.url) {
    handlers.onRefused(result?.message ?? "Could not upload that image");
    return;
  }

  handlers.onUploaded(result.fileId, result.url);
};

interface ImageUploadFieldProps {
  formId: string;
  disabled: boolean;
  initialImageUrl: string | null;
  onChange: (imageFileId: string | null) => void;
}

/**
 * A single item photo: pick a file, it uploads immediately to
 * `/api/files/upload`, and the returned `fileId` is what the form submits as
 * `imageFileId` — the item row itself is never sent binary data, only the
 * pointer. Uploading eagerly (rather than deferring to form submit) is what
 * lets the preview show the photo that was actually saved rather than a local
 * object URL that could still fail to upload after the item itself was created.
 *
 * **Two ways to start, one crop step, one upload.** "Take photo" carries
 * `capture="environment"` on its hidden input, which launches the device
 * camera directly on a phone or tablet; "Upload photo" has no `capture`, so it
 * opens the ordinary file/photo picker. Desktop browsers ignore `capture`
 * entirely, so both buttons open the same file dialog there — a graceful
 * degradation rather than a second code path, since the attribute is simply
 * absent from the platform's own picker. Whichever button is used, the picked
 * file goes to `PhotoCropDialog` before it ever reaches `uploadPhoto`: the
 * register shows a 1:1 photo everywhere it appears, and the crop step is what
 * lets the person attaching it choose *which* square, rather than leaving that
 * to the server's own centre-crop (`files.upload.ts`'s `fit: "cover"`, which
 * still runs regardless — belt and braces, not a duplicate step, because the
 * server does not trust a client it cannot see).
 *
 * All four upload outcomes are drawn: uploading (`aria-busy` on the row and a spoken
 * status), uploaded (the preview *is* the confirmation, plus a spoken status), a
 * refusal from the server (its own sentence, under the field, in a `FieldError`),
 * and no connection (a different sentence, saying the same thing differently).
 * The two error sentences are separate because they have different recoveries.
 */
const ImageUploadField = ({
  formId,
  disabled,
  initialImageUrl,
  onChange,
}: ImageUploadFieldProps) => {
  const [previewUrl, setPreviewUrl] = useState(initialImageUrl);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [pickedImageSrc, setPickedImageSrc] = useState<string | null>(null);
  const inputId = `${formId}-image`;
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setIsUploading(true);
    setError(null);
    setStatus("Uploading the photo…");
    /*
     * The busy flag is released on the promise rather than in a `finally`. Both
     * are equivalent here and one of them is analysable by the React compiler;
     * a `try`/`finally` is not.
     */
    await uploadPhoto(file, {
      onUploaded: (fileId, url) => {
        setPreviewUrl(url);
        onChange(fileId);
        setStatus("The photo is attached to this item.");
      },
      onRefused: (message) => {
        setError(message);
        setStatus("");
      },
      onUnreachable: () => {
        setError(
          "Could not reach the server to upload that image. Everything you typed is still here — try the photo again."
        );
        setStatus("");
      },
    }).finally(() => {
      setIsUploading(false);
    });
  };

  const handlePicked = async (file: File) => {
    setError(null);
    try {
      setPickedImageSrc(await readFileAsDataUrl(file));
    } catch {
      setError("That file could not be opened for cropping.");
    }
  };

  return (
    <Field invalid={Boolean(error)} disabled={disabled || isUploading}>
      <FieldLabel htmlFor={inputId}>Photo</FieldLabel>
      <div
        aria-busy={isUploading}
        className="flex flex-wrap items-center gap-3"
      >
        {previewUrl ? (
          <img
            alt=""
            className="border-primary/14 size-16 shrink-0 border object-cover"
            src={previewUrl}
          />
        ) : (
          <div
            aria-hidden="true"
            className="border-primary/14 text-muted-foreground flex size-16 shrink-0 items-center justify-center border text-xs"
          >
            None
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {/*
              Two hidden inputs rather than one input whose `capture`
              attribute is toggled: `capture` is read once, when the browser
              opens the picker, so swapping it on an input already in the DOM
              is unreliable across browsers. Two inputs is one attribute each,
              set once, and never changed.
            */}
            <input
              accept="image/*"
              capture="environment"
              className="sr-only"
              id={inputId}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handlePicked(file);
                }
                event.target.value = "";
              }}
              ref={cameraInputRef}
              tabIndex={-1}
              type="file"
            />
            <input
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handlePicked(file);
                }
                event.target.value = "";
              }}
              ref={uploadInputRef}
              tabIndex={-1}
              type="file"
            />
            <Button
              data-icon="inline-start"
              onClick={() => cameraInputRef.current?.click()}
              size="sm"
              type="button"
              variant="outline"
            >
              <IconCamera data-icon="inline-start" />
              Take photo
            </Button>
            <Button
              data-icon="inline-start"
              onClick={() => uploadInputRef.current?.click()}
              size="sm"
              type="button"
              variant="outline"
            >
              <IconUpload data-icon="inline-start" />
              Upload photo
            </Button>
          </div>
          {previewUrl ? (
            <Button
              disabled={isUploading}
              onClick={() => {
                setPreviewUrl(null);
                setStatus("");
                onChange(null);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              Remove photo
            </Button>
          ) : null}
        </div>
      </div>
      <PhotoCropDialog
        imageSrc={pickedImageSrc}
        onCancel={() => setPickedImageSrc(null)}
        onCropped={(file) => {
          setPickedImageSrc(null);
          void handleFile(file);
        }}
      />
      <FieldDescription>
        Optional. Take a photo or upload one — PNG, JPEG, WEBP or GIF, up to 8
        MB — then crop it to a square. It uploads as soon as you confirm the
        crop, so a failure is told to you here rather than after the item has
        been saved. Every photo is stored as WebP.
      </FieldDescription>
      {/*
        The four upload states are also spoken. `aria-busy` on the row stops a
        screen reader walking a half-built preview, and the visually hidden
        `<output>` carries the sentence the picture alone cannot: that it is
        uploading, and that it arrived. `<output>` because it is the element whose
        implicit role *is* `status`, and a `role` attribute on a `<span>` is the
        spelling the lint rules and half the screen readers disagree about.
      */}
      <output className="sr-only">{status}</output>
      <FieldError>{error}</FieldError>
    </Field>
  );
};

// ─── Form sections ──────────────────────────────────────────────────────────

interface IdentityFieldsetProps {
  formId: string;
  errors: ItemFormErrors;
  isLoading: boolean;
  isEdit: boolean;
  values: FormValues;
  categories: CategoryOption[];
  categoryState: CategoryListState;
  category: CategoryChoice | null;
  sku: string;
  onChange: (patch: Partial<FormValues>) => void;
  onCategoryChange: (category: CategoryChoice | null) => void;
  onSkuChange: (sku: string) => void;
  /** The item's current photo, if it already has one — absent on create. */
  initialImageUrl?: string | null;
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
export const IdentityFieldset = ({
  formId,
  errors,
  isLoading,
  isEdit,
  values,
  categories,
  categoryState,
  category,
  sku,
  onChange,
  onCategoryChange,
  onSkuChange,
  initialImageUrl,
}: IdentityFieldsetProps) => (
  <FieldSet>
    <FieldLegend>Identity</FieldLegend>
    <FieldGroup>
      <Field
        data-item-field="name"
        invalid={Boolean(errors.name)}
        disabled={isLoading}
        required
      >
        <FieldLabel required htmlFor={`${formId}-name`}>
          Name
        </FieldLabel>
        <Input
          id={`${formId}-name`}
          value={values.name}
          maxLength={200}
          placeholder="e.g. Portable projector, XGA"
          autoComplete="off"
          onChange={(event) => onChange({ name: event.target.value })}
        />
        <FieldError>{errors.name}</FieldError>
      </Field>

      <div data-item-field="categoryId">
        <CategoryPicker
          formId={formId}
          categories={categories}
          state={categoryState}
          value={category}
          onChange={onCategoryChange}
          error={errors.categoryId}
          disabled={isLoading}
        />
      </div>

      {isEdit ? null : (
        <Field
          data-item-field="sku"
          invalid={Boolean(errors.sku)}
          disabled={isLoading}
        >
          <FieldLabel htmlFor={`${formId}-sku`}>SKU</FieldLabel>
          <Input
            id={`${formId}-sku`}
            value={sku}
            maxLength={20}
            autoComplete="off"
            placeholder="INV-12345"
            className="font-mono"
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
          <FieldError>{errors.sku}</FieldError>
        </Field>
      )}

      <UnitField
        disabled={isLoading}
        error={errors.unit}
        formId={formId}
        onChange={(unit) => onChange({ unit })}
        value={values.unit}
      />

      <Field
        data-item-field="description"
        invalid={Boolean(errors.description)}
        disabled={isLoading}
      >
        <FieldLabel htmlFor={`${formId}-description`}>Description</FieldLabel>
        <Textarea
          id={`${formId}-description`}
          value={values.description}
          rows={2}
          maxLength={500}
          placeholder="Anything that identifies this line — the make, the model, the room it was bought for"
          onChange={(event) => onChange({ description: event.target.value })}
        />
        <FieldDescription>
          One of the three things the register&rsquo;s search box looks at,
          alongside the name and the SKU.
        </FieldDescription>
        <FieldError>{errors.description}</FieldError>
      </Field>

      <ImageUploadField
        disabled={isLoading}
        formId={formId}
        initialImageUrl={initialImageUrl ?? null}
        onChange={(imageFileId) => onChange({ imageFileId })}
      />
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
export const StockFieldset = ({
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {isEdit ? null : (
            <Field
              data-item-field="qty"
              invalid={Boolean(errors.qty)}
              disabled={isLoading}
              required
            >
              <FieldLabel required htmlFor={`${formId}-qty`}>
                Quantity
              </FieldLabel>
              <Input
                id={`${formId}-qty`}
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_ITEM_QTY}
                value={String(qty)}
                onChange={(event) => onQtyChange(event.target.value)}
              />
              <FieldDescription>
                How many are on the shelf today, counted in the unit above. The
                asset-tag list has one row per unit to match it.
              </FieldDescription>
              <FieldError>{errors.qty}</FieldError>
            </Field>
          )}

          <Field
            data-item-field="minQty"
            invalid={Boolean(errors.minQty)}
            disabled={isLoading}
          >
            <FieldLabel htmlFor={`${formId}-min-qty`}>Reorder level</FieldLabel>
            <Input
              id={`${formId}-min-qty`}
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_ITEM_QTY}
              value={minQty}
              onChange={(event) => onMinQtyChange(event.target.value)}
            />
            <FieldDescription>
              A warning line, not a floor. Nothing stops the store dropping
              below it — that is what makes a write-off possible at all — but
              the register flags the item as low stock once the count reaches
              this number.
              {onHandNote}
            </FieldDescription>
            <FieldError>{errors.minQty}</FieldError>
          </Field>
        </div>

        {isEdit ? null : (
          <div data-item-field="uniqueIds">
            <AssetTagFields
              formId={formId}
              rows={tagRows}
              duplicates={duplicates}
              error={errors.uniqueIds}
              disabled={isLoading}
              onChange={onTagRowsChange}
            />
          </div>
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
export const ConditionFieldset = ({
  formId,
  errors,
  isLoading,
  values,
  onChange,
}: ConditionFieldsetProps) => {
  const borrowableNoteId = `${formId}-borrowable-note`;

  return (
    <FieldSet>
      <FieldLegend>Condition and place</FieldLegend>
      <FieldGroup>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            data-item-field="condition"
            invalid={Boolean(errors.condition)}
            disabled={isLoading}
          >
            <FieldLabel htmlFor={`${formId}-condition`}>Condition</FieldLabel>
            <Select
              value={values.condition}
              onValueChange={(next) => {
                if (next) {
                  onChange({ condition: next });
                }
              }}
            >
              <SelectTrigger id={`${formId}-condition`}>
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
            <FieldError>{errors.condition}</FieldError>
          </Field>

          <Field
            data-item-field="location"
            invalid={Boolean(errors.location)}
            disabled={isLoading}
          >
            <FieldLabel htmlFor={`${formId}-location`}>Location</FieldLabel>
            <Input
              id={`${formId}-location`}
              value={values.location}
              maxLength={200}
              placeholder="e.g. Science lab, cupboard B"
              autoComplete="off"
              onChange={(event) => onChange({ location: event.target.value })}
            />
            <FieldDescription>
              Where it is kept. Blank is a legitimate answer for something that
              moves, but a store cannot answer &ldquo;where is the
              microscope&rdquo; without it.
            </FieldDescription>
            <FieldError>{errors.location}</FieldError>
          </Field>
        </div>

        <Field
          data-item-field="borrowable"
          orientation="horizontal"
          disabled={isLoading}
        >
          <Checkbox
            id={`${formId}-borrowable`}
            checked={values.borrowable}
            /*
             * The paragraph below is outside this `Field`, so the field's own
             * `aria-describedby` does not reach it — and a policy statement that
             * nobody hears is the same as not writing it. Named explicitly, and
             * merged with whatever the field contributes.
             */
            aria-describedby={borrowableNoteId}
            onCheckedChange={(checked) =>
              onChange({ borrowable: checked === true })
            }
          />
          <FieldLabel htmlFor={`${formId}-borrowable`} className="font-normal">
            Members of staff may borrow or take this item
          </FieldLabel>
        </Field>
        <FieldDescription id={borrowableNoteId}>
          Unchecked, the item stays with the store: a member of staff claiming
          it is refused and no loan can be raised against it. Checked, it
          appears in the take and loan flows and can leave the building with
          whoever borrows it.
        </FieldDescription>
      </FieldGroup>
    </FieldSet>
  );
};

interface ValuationFieldsetProps {
  formId: string;
  errors: ItemFormErrors;
  isLoading: boolean;
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
export const ValuationFieldset = ({
  formId,
  errors,
  isLoading,
  isEdit,
  values,
  onChange,
}: ValuationFieldsetProps) => (
  <FieldSet>
    <FieldLegend>Valuation</FieldLegend>
    <FieldGroup>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/*
          The id is passed because the shared control's default is a literal, and
          the create and edit dialogs can both be in the document at once — two
          `inventory-money-field` ids, one of which has lost its label. See the
          note above `MoneyFieldError`.
        */}
        <div data-item-field="purchaseValue">
          <MoneyField
            id={`${formId}-purchase-value`}
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
        </div>
        <CurrentValueField
          disabled={isLoading}
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
 * `createItem` requires both and seeds the first two `inventoryCustodyHistory`
 * rows from them — `manager_assigned` and `custody_taken`, each with
 * `reason: null` — the single case
 * `inventory_custody_history_reason_required` exempts, because a first
 * assignment onto an empty slot displaces nobody. Afterwards the two belong to
 * `custody.transfer` and `assignManager`, which each write a history row *and* a
 * ledger action and each demand a reason.
 *
 * **Hence the different wording from the transfer dialogs: "Initially in charge of"
 * and "Initially held by"** rather than "In charge of this item" and "Hand it to".
 * That is not decoration — it tells the reader this choice is recorded once, here,
 * without a cause, and that the custody dialogs own these two columns from now on.
 * Both are required: every line on the register answers "whose is this?" and "who
 * has it?" from the day it is written, and a shelf-bound item is held by the
 * member of staff who is in charge of it. The server refuses a creation without
 * both, so the pickers do not offer a clear button — the field cannot be sent
 * back to blank.
 *
 * Both wrappers carry `data-item-field` rather than a `Field`, because each
 * `StaffComboboxField` renders its own `Field` and mints its own id — the walk
 * after a failed submit needs a container it can find the combobox input inside.
 */
export const InitialResponsibilityFieldset = ({
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
      <div data-item-field="managerStaffId">
        <StaffComboboxField
          value={managerStaffId}
          onChange={onManagerChange}
          label="Initially in charge of"
          description="The member of staff accountable for this item. Required — every line on the register names one, so a shelf-bound item's answer can be the person in charge."
          error={errors.managerStaffId}
          disabled={isLoading}
        />
      </div>
      <div data-item-field="custodianStaffId">
        <StaffComboboxField
          value={custodianStaffId}
          onChange={onCustodianChange}
          label="Initially held by"
          description="The member of staff carrying it on day one. Required — if it is going straight on the shelf, that is the person in charge."
          error={errors.custodianStaffId}
          disabled={isLoading}
        />
      </div>
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
export const EditScopeNotice = ({
  isLoading,
  handleTransferCustody,
  handleAssignManager,
  handleRecordStockIn,
  handleWriteOffStock,
}: EditActionProps) => (
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
      <IconInfoCircle aria-hidden="true" className="size-4 shrink-0" />
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
      >
        <IconPackageExport data-icon="inline-start" aria-hidden="true" />
        Record stock in
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isLoading}
        onClick={handleWriteOffStock}
      >
        <IconTrash data-icon="inline-start" aria-hidden="true" />
        Write off stock
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isLoading}
        onClick={handleTransferCustody}
      >
        <IconSwitchHorizontal data-icon="inline-start" aria-hidden="true" />
        Transfer custody
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isLoading}
        onClick={handleAssignManager}
      >
        <IconUserCheck data-icon="inline-start" aria-hidden="true" />
        Assign manager
      </Button>
    </div>
  </div>
);
