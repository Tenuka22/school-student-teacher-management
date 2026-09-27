"use client";

/*
 * The item create and edit dialogs.
 *
 * The state and the validation live in `item-form-model.ts`; the fields live in
 * `item-form-fields.tsx`. What is left here is the thing that actually cannot be
 * extracted: the `<form>` that owns the state, and the two dialogs that wrap it.
 *
 * The three things that only exist at this level, and why:
 *
 * - **Derived form ids.** The two dialogs are mounted together — `admin/$year`
 *   holds the create half open while the edit half is closed, and the register
 *   can have one of each. Every id on this form is built from a single `useId`,
 *   because a hardcoded `create-inventory-item-form` is one id and one `<form>`
 *   per dialog that a future second mount would silently duplicate. The submit
 *   button lives in the footer and reaches the form with `form={formId}`, so the
 *   id is load-bearing in two places and must be one value.
 * - **Escape is not an exit while there is typing in the dialog.** A half-typed
 *   item is twenty fields of work and the register has no undo for it, so `Esc`
 *   is cancelled while the form is dirty and left alone when it is not. The
 *   Cancel button and the dialog's close button still close it, because choosing
 *   to close a form is a different act from pressing a key that closes whatever
 *   has focus.
 * - **Where a failed save is announced.** The `useMutation`'s `onError` owns the
 *   toast — it is the only one of the two that survives the dialog unmounting,
 *   and toasting here too printed every sentence twice. What the toast cannot do
 *   is survive: it is gone in four seconds, and the form it belongs to is still
 *   open with everything the user typed still in it. So a failure that mapped to
 *   no field gets a panel that stays, and a failure that did map to a field does
 *   not — that one is already a `FieldError` with `role="alert"` on a control
 *   that focus has just been moved to.
 */

import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import type * as React from "react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  CategoryOption,
  InventoryItemView,
} from "@/components/staff/inventory/inventory-types";
import type {
  CategoryListState,
  EditActionProps,
} from "@/components/staff/inventory/item-form-fields";
import {
  EditScopeNotice,
  IdentityFieldset,
  InitialResponsibilityFieldset,
  StockFieldset,
  ConditionFieldset,
  ValuationFieldset,
} from "@/components/staff/inventory/item-form-fields";
import type {
  FormValues,
  ItemFormErrors,
  TagRow,
} from "@/components/staff/inventory/item-form-model";
import {
  buildSubmitOutcome,
  duplicateTagRows,
  enteredTagCount,
  focusFirstInvalidField,
  initialCategory,
  initialFormValues,
  newTagRow,
  resizeTagRows,
  resolveTagError,
  toQuantity,
} from "@/components/staff/inventory/item-form-model";
import { formatApiErrorMessage, validationFieldErrors } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

export type { EditActionProps } from "@/components/staff/inventory/item-form-fields";

/** `onOpenChange` as Base UI declares it, so the reason is available without a cast. */
type DialogOpenChange = NonNullable<
  React.ComponentProps<typeof Dialog>["onOpenChange"]
>;

interface InventoryItemFormProps {
  formId: string;
  categories: CategoryOption[];
  categoryState: CategoryListState;
  initialData?: InventoryItemView;
  isLoading: boolean;
  serverErrors: ItemFormErrors;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  /**
   * Reported upward so the dialog can decide whether `Esc` closes it. The form
   * owns the values, so the form is the only thing that can answer it.
   */
  onDirtyChange: (isDirty: boolean) => void;
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
  categoryState,
  initialData,
  isLoading,
  serverErrors,
  onSubmit,
  onDirtyChange,
  editActions,
}: InventoryItemFormProps) => {
  const isEdit = initialData !== undefined;

  const [values, setValues] = useState<FormValues>(() =>
    initialFormValues(initialData)
  );
  const [category, setCategory] = useState(() =>
    initialCategory(initialData, categories)
  );
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState(initialData?.qty ?? 1);
  const [tagRows, setTagRows] = useState<TagRow[]>(() => [newTagRow()]);
  const [managerStaffId, setManagerStaffId] = useState<string | null>(null);
  const [custodianStaffId, setCustodianStaffId] = useState<string | null>(null);
  const [clientErrors, setClientErrors] = useState<ItemFormErrors>({});

  const formRef = useRef<HTMLFormElement>(null);
  const isSubmittingRef = useRef(false);

  /**
   * Client errors win over server errors for the same field, because they are the
   * more recent statement about it: the form clears its own errors at the top of
   * every submit, so anything left in `serverErrors` is from the last round trip and
   * is still the best thing to say until the user edits that field.
   *
   * **Memoised, and that is load-bearing rather than tidiness.** A fresh object on
   * every render would give the focus effect below a new dependency on every
   * keystroke, and the effect's whole job is to move focus — run on every render it
   * would pull the caret out of whatever the user is typing, which is worse than
   * never moving focus at all. As a memo it changes identity only when a submit
   * produced new errors, which is the only time focus *should* move. It also stops
   * five fieldsets re-rendering on every keystroke for an object they were handed
   * unchanged.
   */
  const errors: ItemFormErrors = useMemo(
    () => ({ ...serverErrors, ...clientErrors }),
    [serverErrors, clientErrors]
  );
  const duplicates = useMemo(() => duplicateTagRows(tagRows), [tagRows]);

  /**
   * The rule the object schema cannot hold, mirrored from `resolveAssetTags` in
   * `create-item.ts`: the moment one tag is typed the count has to equal the
   * quantity, and the comparison is on the *normalized* tag — so a row of three
   * spaces is a blank, not a tag. That is the same count the live counter above the
   * rows shows, which is why the two can never disagree: both read
   * `enteredTagCount`.
   */
  const tagError = resolveTagError(enteredTagCount(tagRows), qty, duplicates);

  /*
   * Focus the first field the last submit failed on, once, after the messages are
   * in the DOM.
   *
   * This is the step valibot does not do and the browser only does for native
   * constraint validation. A `role="alert"` error on a field twelve fields up a
   * scrolling dialog is announced and then invisible.
   */
  useEffect(() => {
    focusFirstInvalidField(formRef.current, errors);
  }, [errors]);

  /*
   * `latestErrors` is kept in a ref rather than read in the focus effect's closure
   * so that the effect can depend on the two error *objects* — which only ever get
   * a new identity at a submit — instead of on `errors`, which is a fresh object
   * on every render. Depending on `errors` would re-run the effect on every
   * keystroke and pull the caret out of whatever the user is typing, which is a
   * worse defect than never moving focus at all.
   */
  /*
   * Focus the first field the last submit failed on, once, after the messages are
   * in the DOM.
   *
   * This is the step valibot does not do and the browser only does for native
   * constraint validation. A `role="alert"` error on a field twelve fields up a
   * scrolling dialog is announced and then invisible.
   */
  useEffect(() => {
    focusFirstInvalidField(formRef.current, errors);
  }, [errors]);

  /**
   * Anything the user touches marks the form dirty, once.
   *
   * It is deliberately not a comparison against the initial values: a form that
   * was opened on an item and then had a field cleared and retyped to the same
   * character is not at risk in any way a form with a changed description is, and
   * the cost of being wrong is only that `Esc` closes. Being wrong the other way
   * — refusing to close a dialog on `Esc` — is the one this avoids.
   */
  const markDirty = useCallback(() => {
    onDirtyChange(true);
  }, [onDirtyChange]);

  const handleQtyChange = (raw: string) => {
    setQty(toQuantity(raw));
    setTagRows((previous) => resizeTagRows(previous, toQuantity(raw)));
    markDirty();
  };

  const handleValuesChange = (patch: Partial<FormValues>) => {
    setValues((previous) => ({ ...previous, ...patch }));
    markDirty();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    /*
     * `Button loading` stops a second press of *the button* reaching the server,
     * but the footer button lives outside the `<form>` and the form can also be
     * submitted by pressing Enter in a text field — a real second path, not a
     * theoretical one. A second `createItem` for the same line is a duplicate
     * asset, so the guard is here as well as there.
     */
    if (isSubmittingRef.current) {
      return;
    }

    setClientErrors({});

    /*
     * A category read that failed is not the user's mistake, and `MISSING_CATEGORY`
     * would tell them it is ("Choose a category, or seed the eight starter
     * categories") — which is advice to go and do a thing that cannot help while
     * the list is unreadable, and to seed eight categories the store may already
     * have. The picker above already says what happened and offers the retry; this
     * puts the same fact under the field so the message is on the field as well as
     * in the announcement.
     */
    if (category === null && categoryState.isFailed) {
      setClientErrors({
        categoryId:
          "The categories could not be read, so there is nothing to choose from yet. Try again on the field above, then pick one — nothing you have typed has been lost.",
      });
      return;
    }

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

    isSubmittingRef.current = true;
    /*
     * The guard is released on the promise rather than in a `finally`, because a
     * `try`/`finally` is control flow the React compiler will not analyse, and
     * this is the one function in the file that must not be left uncompiled by a
     * lint rule about a cleanup clause.
     */
    await onSubmit(outcome.values).finally(() => {
      isSubmittingRef.current = false;
    });
  };

  return (
    <form
      ref={formRef}
      id={formId}
      onSubmit={handleSubmit}
      aria-busy={isLoading}
      className="space-y-6"
    >
      <IdentityFieldset
        formId={formId}
        errors={errors}
        isLoading={isLoading}
        isEdit={isEdit}
        values={values}
        categories={categories}
        categoryState={categoryState}
        category={category}
        sku={sku}
        onChange={handleValuesChange}
        onCategoryChange={(next) => {
          setCategory(next);
          markDirty();
        }}
        onSkuChange={(next) => {
          setSku(next);
          markDirty();
        }}
        initialImageUrl={initialData?.imageUrl ?? null}
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
        onTagRowsChange={(next) => {
          setTagRows(next);
          markDirty();
        }}
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
        isLoading={isLoading}
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
          onManagerChange={(staffId) => {
            setManagerStaffId(staffId);
            markDirty();
          }}
          onCustodianChange={(staffId) => {
            setCustodianStaffId(staffId);
            markDirty();
          }}
        />
      )}

      {editActions ? <EditScopeNotice {...editActions} /> : null}
    </form>
  );
};

/**
 * What a save that was refused for a reason with no field behind it looks like.
 *
 * Shown only when the failure mapped to no field. When it did map to one, the
 * `FieldError` on that field is the statement and focus has been moved to it —
 * printing the same thing in a panel as well would be the third telling.
 *
 * The two sentences that matter are the ones about *what did not happen*: the
 * dialog is still open and everything typed is still in it. A refused save that
 * reads as a lost one is how a clerk retypes twenty fields.
 */
const SaveFailureNotice = ({
  message,
  itemNoun,
}: {
  message: string;
  itemNoun: string;
}) => (
  <div
    aria-live="assertive"
    className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-2 border px-3 py-2.5"
    role="alert"
  >
    <IconAlertTriangle aria-hidden="true" className="mt-px size-4 shrink-0" />
    <div className="min-w-0 text-xs">
      <p className="font-bold">
        The {itemNoun} was not saved — {message}
      </p>
      <p className="text-foreground/80 mt-1">
        Nothing you typed has been lost. Fix the problem below if it is in this
        form, then press the button again; if it is not, the register is busy or
        the connection dropped, and trying again is safe.
      </p>
    </div>
  </div>
);

/**
 * The failure bookkeeping both dialogs share, as a hook rather than a helper
 * called twice.
 *
 * Three things live here and nowhere else: the field errors a refused save maps
 * to, the one sentence a refused save that maps to *nothing* gets, and whether
 * anybody has typed in the form yet.
 *
 * **The catch deliberately does not toast, and that is not an omission.**
 * `onSubmit` is `handleCreateSubmit` in `inventory-page.tsx`, which awaits
 * `mutateAsync`; that rejection has *already* been through the mutation observer's
 * own `onError`, which is where the toast comes from. Toasting here too printed
 * the identical sentence twice for every validation failure, every duplicate SKU
 * and every dropped connection — and the mutation observer is the only one of the
 * two that survives the dialog unmounting, so it has to be the one that speaks.
 * `custody-dialogs.tsx` reached the same conclusion from the other direction and
 * its submit handlers are the pattern these two follow.
 *
 * The handler does not rethrow: the dialog is closed by the caller on success, so
 * a failure is already reported, and letting it escape would put an unhandled
 * rejection on the form's submit handler.
 *
 * `isDirtyRef` is a ref and not state, and that is deliberate: it is read by
 * exactly one thing — the Escape-key guard — and re-rendering the whole form
 * (five fieldsets, and on create up to a thousand asset-tag rows) because a field
 * was touched would be work for nobody. The boolean appears nowhere on screen.
 */
const useItemSubmit = (
  onSubmit: (values: Record<string, unknown>) => Promise<void>,
  /** What to say when the refusal maps to no field at all. */
  unmappedFallback: string
) => {
  const [fieldErrors, setFieldErrors] = useState<ItemFormErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const isDirtyRef = useRef(false);

  const handleSubmit = useCallback(
    async (values: Record<string, unknown>) => {
      setFieldErrors({});
      setFailure(null);
      try {
        await onSubmit(values);
      } catch (error) {
        const mapped = validationFieldErrors<keyof ItemFormErrors>(error);
        setFieldErrors(mapped);
        setFailure(
          Object.keys(mapped).length > 0
            ? null
            : formatApiErrorMessage(error, unmappedFallback)
        );
      }
    },
    [onSubmit, unmappedFallback]
  );

  const handleDirtyChange = useCallback((isDirty: boolean) => {
    isDirtyRef.current = isDirty;
  }, []);

  const reset = useCallback(() => {
    setFieldErrors({});
    setFailure(null);
    isDirtyRef.current = false;
  }, []);

  return {
    fieldErrors,
    failure,
    isDirtyRef,
    handleSubmit,
    handleDirtyChange,
    reset,
  };
};

/**
 * Whether this close should be refused.
 *
 * A dirty form is not dismissed by the Escape key, because the register has no undo
 * for twenty typed fields. A clean form is, because that is what the key means
 * everywhere else in the app. The Cancel button and the dialog's own close button
 * are not second-guessed — a person who presses a button labelled Cancel has made
 * the decision that button offers, and a control that ignores itself is worse than
 * one that loses work.
 */
const refuseEscape = (
  open: boolean,
  details: Parameters<DialogOpenChange>[1],
  isDirty: boolean
): boolean => !open && details.reason === "escape-key" && isDirty;

interface CreateItemDialogProps {
  formId: string;
  categories: CategoryOption[];
  categoryState: CategoryListState;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
}

/**
 * The create half, on its own so that the edit half's state cannot be half of it.
 *
 * Both dialogs are composed the way `class-dialogs.tsx` composes them: the submit
 * button lives in the footer, outside the `<form>`, and reaches it with
 * `form={formId}`. That is not a stylistic choice. The footer has to stay put while
 * the form body scrolls, and a `<form>` cannot be a flex child of a scrolling
 * column without the footer scrolling away with it.
 *
 * **The form is keyed on `isOpen`, and that key is the reset.** The repeated
 * asset-tag rows are the reason it is not optional: a create dialog that reopened
 * carrying the last item's tags would submit them against a different item, and
 * the server would either refuse a tag already on file or — for tags that are not
 * — attach somebody else&rsquo;s equipment to this line. Remounting is what
 * guarantees the rows come back empty and the counters at zero.
 */
const CreateItemDialog = ({
  formId,
  categories,
  categoryState,
  isOpen,
  onOpenChange,
  isPending,
  onSubmit,
}: CreateItemDialogProps) => {
  const {
    fieldErrors,
    failure,
    isDirtyRef,
    handleSubmit,
    handleDirtyChange,
    reset,
  } = useItemSubmit(onSubmit, "The store did not accept it.");

  const handleOpenChange: DialogOpenChange = (open, details) => {
    if (refuseEscape(open, details, isDirtyRef.current)) {
      details.cancel();
      return;
    }
    if (!open) {
      reset();
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Register an item</DialogTitle>
          <DialogDescription>
            Add a line to the store: what it is, how many there are, and what
            each one is tagged
          </DialogDescription>
        </DialogHeader>
        <div
          aria-busy={isPending}
          className="flex-1 space-y-3 overflow-y-auto px-6 py-4"
        >
          {failure ? (
            <SaveFailureNotice message={failure} itemNoun="item" />
          ) : null}
          <InventoryItemForm
            key={`create-${String(isOpen)}`}
            formId={formId}
            categories={categories}
            categoryState={categoryState}
            isLoading={isPending}
            serverErrors={fieldErrors}
            onSubmit={handleSubmit}
            onDirtyChange={handleDirtyChange}
          />
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
            disabled={isPending}
          >
            Cancel
          </Button>
          {/*
            `loading` rather than `disabled` plus a swapped label. The width does
            not move, the button keeps focus so a keyboard submit does not drop the
            caret onto `<body>`, the second activation is refused, and `aria-busy`
            is set for assistive technology. The label stays in the layout and is
            only made transparent, so the button is the same size before and after
            the press — which is the whole point of the prop, given this is a
            twenty-field form and the button used to grow a word mid-submit.
          */}
          <Button type="submit" form={formId} loading={isPending}>
            Register item
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

interface EditItemDialogProps {
  formId: string;
  categories: CategoryOption[];
  categoryState: CategoryListState;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  selectedItem: InventoryItemView | null;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  editActions: EditActionProps;
}

/** The edit half. Same shape as the create half, one fewer fieldset and one more edge. */
const EditItemDialog = ({
  formId,
  categories,
  categoryState,
  isOpen,
  onOpenChange,
  isPending,
  selectedItem,
  onSubmit,
  editActions,
}: EditItemDialogProps) => {
  const {
    fieldErrors,
    failure,
    isDirtyRef,
    handleSubmit,
    handleDirtyChange,
    reset,
  } = useItemSubmit(onSubmit, "The store did not accept the change.");

  const handleOpenChange: DialogOpenChange = (open, details) => {
    if (refuseEscape(open, details, isDirtyRef.current)) {
      details.cancel();
      return;
    }
    if (!open) {
      reset();
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
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
        <div
          aria-busy={isPending}
          className="flex-1 space-y-3 overflow-y-auto px-6 py-4"
        >
          {failure ? (
            <SaveFailureNotice message={failure} itemNoun="change" />
          ) : null}
          {/*
            The one combination with nothing to edit. It used to render an empty
            body under a heading reading "Edit item", with a live "Save changes"
            button pointing at a form that was not in the document — a submit into
            a void, which is the shape of bug where a person is told their change
            was saved and nothing happened. Two callers hold this state today
            (`inventory-page.tsx` keeps the two in step, and `admin/$year` pins
            the edit half shut), so it has never been seen; it is here because
            "never been seen" is not the same as "cannot happen", and it costs one
            paragraph and a disabled button.
          */}
          {selectedItem ? (
            <InventoryItemForm
              key={`edit-${selectedItem.id}`}
              formId={formId}
              categories={categories}
              categoryState={categoryState}
              initialData={selectedItem}
              isLoading={isPending}
              serverErrors={fieldErrors}
              onSubmit={handleSubmit}
              onDirtyChange={handleDirtyChange}
              editActions={editActions}
            />
          ) : (
            <output className="text-muted-foreground block text-sm">
              No item is selected, so there is nothing to edit. Open the
              register, choose an item, and choose Edit.
            </output>
          )}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            loading={isPending}
            disabled={!selectedItem}
          >
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

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
 * The two dialogs, and the only two facts they share: one id namespace, and one
 * read of the category list.
 *
 * Everything else — the form, the failure state, the Escape policy — belongs to a
 * dialog rather than to the pair, which is why they are two components and not one
 * with a boolean in it. Two dialogs in one component meant one `isDirty`, one
 * `fieldErrors` and one `failure` deciding which of the two forms was mid-write.
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
  /**
   * One id namespace for the whole component, and therefore for both forms.
   *
   * `useId` because the create and edit dialogs are siblings that can both be in
   * the document: the register mounts this component once and holds two pieces of
   * open state, and `admin/$year` mounts it with the edit half pinned shut. Two
   * hardcoded form ids would put one id in the document twice, and the second
   * submit button's `form="…"` would submit the first form. The colons `useId`
   * produces are stripped because these values end up in a `form` attribute, an
   * `id` and an `aria-describedby` list, and an id containing a colon is a trap
   * for anyone who later tries to select it.
   */
  const formIdSuffix = useId().replaceAll(/[^\dA-Za-z_-]/gu, "");

  /**
   * The state of the category read, from the read the page already made.
   *
   * `categories` is an array, and an array cannot say whether it is empty because
   * the store has no categories or because the request failed — so this subscribes
   * to `orpc.inventory.categories.list` with the *same key and the same no-input
   * shape* the page and `admin/$year` use. TanStack deduplicates on the query key,
   * so this is the page's own query observed, not a second one: no extra request,
   * and no possibility of the picker and the categories panel describing different
   * moments. The rows still come from the prop, which is the page's read.
   */
  const categoriesQuery = useQuery(
    orpc.inventory.categories.list.queryOptions()
  );
  const categoryState: CategoryListState = {
    isLoading: categoriesQuery.isPending,
    isFailed: categoriesQuery.isError,
    failureMessage: categoriesQuery.isError
      ? formatApiErrorMessage(categoriesQuery.error, "") || null
      : null,
    isRetrying: categoriesQuery.isFetching && !categoriesQuery.isPending,
    onRetry: () => {
      void categoriesQuery.refetch();
    },
  };

  return (
    <>
      <CreateItemDialog
        categories={categories}
        categoryState={categoryState}
        formId={`create-item-form-${formIdSuffix}`}
        isOpen={isCreateOpen}
        isPending={isCreatePending}
        onOpenChange={onCreateOpenChange}
        onSubmit={onCreateSubmit}
      />
      <EditItemDialog
        categories={categories}
        categoryState={categoryState}
        editActions={editActions}
        formId={`edit-item-form-${formIdSuffix}`}
        isOpen={isEditOpen}
        isPending={isEditPending}
        onOpenChange={onEditOpenChange}
        onSubmit={onEditSubmit}
        selectedItem={selectedItem}
      />
    </>
  );
};
