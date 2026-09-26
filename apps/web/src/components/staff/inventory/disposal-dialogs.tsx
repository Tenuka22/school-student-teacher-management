"use client";

/**
 * The two-stage write-off, modelled on `leave-management`'s review chain.
 *
 * Four procedures and one ladder, and the shape of the UI is the shape of the
 * ladder:
 *
 * | stage | procedure | moves stock? | who |
 * | --- | --- | --- | --- |
 * | raise | `disposals.create` | **no** | anybody with `inventory:create` |
 * | sign off | `disposals.approve` | **no** | a leadership seat, never the requester |
 * | finalise | `disposals.finalize` | **yes — the point of no return** | a leadership seat |
 * | withdraw | `disposals.cancel` | **no** | anybody with `inventory:update` |
 *
 * **The first three rows all say "no" except one, and that is the entire design.**
 * A storekeeper who noticed a projector is broken and a principal who says "yes,
 * take it off the books" are different acts, and only the last one changes a
 * counter. Every dialog below says which row it is, because a storekeeper who
 * believes they have written something off when they have only raised a request
 * will stop looking for the signature.
 *
 * `finalize` is the only `AlertDialog` in this file. `create` writes a proposal,
 * `approve` writes a signature, and `cancel` withdraws a proposal — none of them
 * moves a device, and a confirm step in front of a non-destructive action only
 * teaches people to dismiss confirms.
 */
import {
  DISPOSAL_FINAL_STATUSES,
  DISPOSAL_METHODS,
  disposalMethodLabel,
  disposalMethodSchema,
  disposalStatusLabel,
} from "@school-student-teacher-management/db/constants/inventory";
import { moneyStringSchema } from "@school-student-teacher-management/db/schema/inventory";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@school-student-teacher-management/ui/components/alert-dialog";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@school-student-teacher-management/ui/components/collapsible";
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
} from "@school-student-teacher-management/ui/components/field";
import { Input } from "@school-student-teacher-management/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import { Textarea } from "@school-student-teacher-management/ui/components/textarea";
import {
  IconCheck,
  IconCircleCheck,
  IconHistory,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import type { DisposalRecord } from "@/components/staff/inventory/inventory-types";
import {
  formatCount,
  InventoryEmptyState,
  InventoryErrorState,
  InventoryInlineNotice,
  InventorySkeleton,
  ItemPickerField,
  MoneyField,
  UnitPickerField,
  invalidateInventory,
} from "@/components/staff/inventory/shared";
import {
  PartyName,
  describeParty,
  formatDateTime,
  issuesToFieldErrors,
  toQuantity,
  useDiscardGuard,
} from "@/components/staff/inventory/stock-dialogs";
import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

/** `listDisposals`' own default and hard ceiling. */
const DISPOSAL_LIST_LIMIT = 50;

/** `cancelDisposal`'s own cap. The character counter is honest because of it. */
const MAX_CANCEL_REASON = 500;

/**
 * The queue presets on the register tab.
 *
 * `final` is the odd one out: `listDisposals` takes a single `disposalStatusSchema`
 * and has no "any of the six terminal outcomes" input, so that preset is a
 * narrowing of the returned page rather than a server filter. See
 * `DisposalsPanel` for what that costs and how the difference is surfaced.
 */
type DisposalFilter =
  | "all"
  | "pending_approval"
  | "approved"
  | "final"
  | "cancelled";

/**
 * Money with thousand separators and no currency symbol.
 *
 * Nothing in this repo — schema, constants, or any other screen — names a
 * currency, so putting an `LKR` or an `Rs` on one column here would disagree with
 * every other place the same figure is shown. The amount is displayed; the unit
 * is not guessed.
 *
 * The grouping is `formatCount`'s, not a second opinion. This used to hardcode its
 * own `en-US` while the rest of the feature assumed `en-GB` — a per-call-site locale
 * choice that happened to agree today (both render `1,250.50` identically on this
 * repo's runtime) and would not the first time a school formatted something this
 * feature has not thought about yet. The two-decimal part is passed as options
 * because that is a property of a *money* figure, not of how this feature writes a
 * number.
 */
const formatAmount = (value: string | null): string => {
  if (value === null) {
    return "—";
  }

  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? formatCount(parsed, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : value;
};

/**
 * A `set null` staff column, which is a fact and not a gap.
 *
 * All four of a disposal's `*ByStaffId` columns are `onDelete: "set null"` by
 * design — a storekeeper who leaves the school must not delete the record of the
 * write-offs they signed — so a non-null id with a null name is a normal,
 * expected row. It is rendered as a stated fact ("no longer on the roll"), never
 * as a blank cell that reads as an unfilled field and never as the word "null".
 *
 * The wording itself is `describeParty` / `PartyName` in `stock-dialogs.tsx`,
 * because "no longer on the staff roll", "Issuer no longer on the roll",
 * "Borrower no longer on the roll" and "Account with no staff record" were four
 * sentences for the one fact — and three of the four collapsed the two states
 * that matter: a person who left (the change was real) and a slot that was never
 * filled (nothing is missing). The certificate is the record that must be able to
 * tell those apart, so it does.
 */

/** True for the six terminal outcomes, narrowing the wire's `string` to the picklist. */
const isFinalStatus = (
  value: string
): value is (typeof DISPOSAL_FINAL_STATUSES)[number] =>
  (DISPOSAL_FINAL_STATUSES as readonly string[]).includes(value);

/**
 * The three queue presets that *are* a single `disposalStatusSchema` value, as
 * opposed to "all" and to the six-outcome group the server has no input for.
 */
const SINGLE_STATUS_FILTERS = [
  "pending_approval",
  "approved",
  "cancelled",
] as const;

const isSingleStatusFilter = (
  value: DisposalFilter
): value is (typeof SINGLE_STATUS_FILTERS)[number] =>
  (SINGLE_STATUS_FILTERS as readonly string[]).includes(value);

/**
 * The `changedBy` of a status-history row, in words — and the three-way split is
 * the entire reason this is a function and not a `??`.
 *
 * **The projection used to carry `changedByName` and nothing else**, so a
 * transition written by a colleague who has since left arrived as `null` and was
 * rendered by passing `staffId: null` to `describeParty` — which is the *third*
 * state's spelling. "No name on record for this transition" was therefore the only
 * sentence this one surface could produce, and it was wrong for a person who
 * demonstrably did the work. A blank cell reads as unfilled; "unknown" implies the
 * change might not have happened; and a certificate is exactly where that
 * implication does the most damage.
 *
 * `listDisposals` now projects `changedByStaffId` alongside the name, so this can
 * hand both to the shared `PartyName` / `describeParty` and get the same three
 * states every other surface in the feature already has:
 *
 * | name | staffId | rendered as | the fact |
 * | --- | --- | --- | --- |
 * | set | set | the name, in normal weight | the person, on the roll |
 * | null | set | ~~"No longer on the staff roll"~~ | the change was real; the person has been dealt with |
 * | null | null | "Recorded against an account with no staff row" | the slot was never filled by a person — the seeded leadership seats |
 *
 * The three are kept apart rather than collapsed for the reason `describeParty`'s
 * own comment gives, and the one that matters most is the middle row: a withdrawal
 * signed off by a storekeeper who has since left is a fact about the past, and
 * rendering it as a gap implies the school cannot say who withdrew the request.
 *
 * So the history renders through `PartyName` — the same component the four
 * sign-off cells below use — and there is no local wording left to disagree with
 * it. `DisposalHistoryEntry` is projected from the router, not restated, so a
 * server-side change to either column is a compile error at the call rather than a
 * silently-wrong sentence.
 */

/**
 * What each of the six terminal outcomes actually does to the school's books.
 *
 * Keyed by `DISPOSAL_FINAL_STATUSES` and typed as a `Record` over that tuple, so
 * a seventh terminal outcome added to `packages/db/src/constants/inventory.ts` is
 * a **type error here** rather than a finalise dialog that quietly offers six of
 * the seven. The labels themselves come from `disposalStatusLabel`; what is written
 * here is the consequence, which no constants file has an opinion about.
 */
const FINAL_OUTCOME_CONSEQUENCE: Record<
  (typeof DISPOSAL_FINAL_STATUSES)[number],
  string
> = {
  disposed:
    "Disposed — removed from the register, and nothing is recovered from it",
  recycled:
    "Recycled — removed from the register; the materials were recovered",
  auctioned:
    "Auctioned — removed from the register and sold; any proceeds belong on the certificate",
  written_off:
    "Written off — removed from the register with no proceeds and no recipient",
  donated:
    "Donated — removed from the register and recorded as a donation to the named body",
  returned_to_supplier:
    "Returned to supplier — removed from the register and sent back to the vendor",
};

const disposalRequestSchema = v.object({
  itemId: v.pipe(v.string(), v.minLength(1, "Choose the item to write off")),
  qty: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(1, "Enter how many units are being written off")
  ),
  reason: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "Say why the property is being written off"),
    v.maxLength(200, "Keep the reason under 200 characters")
  ),
  method: disposalMethodSchema,
  /**
   * `moneyStringSchema()` and not `v.optional(v.string())`, which is what this was.
   * A bare string accepts `1,250.00` and `-40` and `1e5`, the field's own client
   * check catches them visually, and then the *server* refuses the write — so a
   * clerk who mistyped a comma got a toast about a number after a round trip
   * instead of a blocked submit. The pattern is the column's own
   * `numeric(14,2)` written out, and it is the same schema the item form uses, so
   * there is one definition of "an amount this database can hold" in the feature.
   */
  estimatedValue: v.optional(moneyStringSchema()),
  notes: v.optional(v.string()),
  uniqueItemIds: v.optional(v.array(v.string())),
});

/**
 * The request form's first block: the two-stage notice, the item and the
 * quantity.
 *
 * Split out because the notice and the item picker are one argument — "this does
 * not write anything off, and here is what it is about" — and because a form this
 * long is better read as blocks.
 */
const DisposalRequestIdentityFields: React.FC<{
  itemId: string | null;
  onItemChange: (itemId: string | null) => void;
  qtyInput: string;
  onQtyChange: (value: string) => void;
  errors: Record<string, string>;
  disabled: boolean;
}> = ({ itemId, onItemChange, qtyInput, onQtyChange, errors, disabled }) => (
  <>
    {/**
     * The two-stage separation, stated as plainly as the dialog can.
     *
     * `createDisposal` and `approveDisposal` both write a ledger row with the
     * item's counters **identical on both sides**, because a proposal and a
     * signature are not movements. Only `finalizeDisposal` decrements `qty`. So
     * this form cannot write off anything, and saying so is the difference between
     * a clerk who goes looking for the signature and one who walks away thinking
     * the job is done.
     */}
    <InventoryInlineNotice
      tone="info"
      title="Raising this does not write anything off"
      description="This creates a proposal and puts it in front of somebody who has to sign it. The quantity on hand, the asset tags and the register are all untouched until that signature is given and the request is finalised — which is the only step that moves stock. Nothing here is approved by pressing Save."
    />

    <ItemPickerField
      value={itemId}
      onChange={onItemChange}
      label="Item *"
      description="Only items with units on the shelf are offered. Anything currently out on loan is excluded."
      error={errors.itemId}
      disabled={disabled}
      onlyAvailable
    />

    <Field data-invalid={errors.qty ? true : undefined}>
      <FieldLabel htmlFor="disposal-qty">Quantity *</FieldLabel>
      <Input
        id="disposal-qty"
        type="number"
        inputMode="numeric"
        min={1}
        value={qtyInput}
        onChange={(event) => onQtyChange(event.target.value)}
        disabled={disabled}
      />
      <FieldDescription>
        The units must be on the shelf now, even though nothing moves yet — a
        request asking a principal to sign off stock the school does not have is
        a request whose problem is found at the wrong moment.
      </FieldDescription>
      {errors.qty ? <FieldError>{errors.qty}</FieldError> : null}
    </Field>
  </>
);

/**
 * Raise a request to write school property off the books. **Nothing moves.**
 *
 * This is stage one of two, and the dialog says so above the form rather than in
 * a footnote: the request goes into a queue for somebody else to sign, the
 * counters are untouched, and only finalising the signed request takes the stock
 * off the shelf. A clerk who closes this dialog believing the projector is gone
 * will stop looking for the signature.
 *
 * `uniqueItemIds` is optional here in a way it is not in the other movements, and
 * the server's own comment says why: a clerk raising "the two broken projectors"
 * should not have to walk to the cupboard and read two labels before the request
 * can even be saved, because the specific devices are not settled until somebody
 * signs — a third projector may turn out to be the broken one. Leave the pins
 * empty and the units are picked oldest-first at finalisation.
 */
export const DisposalRequestDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const queryClient = useQueryClient();

  const [itemId, setItemId] = useState<string | null>(null);
  const [qtyInput, setQtyInput] = useState("1");
  const [unitTags, setUnitTags] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<string>("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const qty = toQuantity(qtyInput);

  const reset = () => {
    setItemId(null);
    setQtyInput("1");
    setUnitTags([]);
    setReason("");
    setMethod("");
    setEstimatedValue("");
    setNotes("");
    setErrors({});
  };

  const isDirty =
    itemId !== null ||
    qtyInput !== "1" ||
    unitTags.length > 0 ||
    reason.trim().length > 0 ||
    method !== "" ||
    estimatedValue.trim().length > 0 ||
    notes.trim().length > 0;

  const { requestClose, confirmNode } = useDiscardGuard(isDirty, () => {
    reset();
    onOpenChange(false);
  });

  const createMutation = useMutation(
    orpc.inventory.disposals.create.mutationOptions({
      onSuccess: async (result) => {
        toast.success(
          `Write-off requested for ${result.qty} × ${result.itemName} — it is now waiting for a signature, and no stock has moved yet`
        );
        reset();
        onOpenChange(false);
        /**
         * `disposal`, **not** `disposalDecision`. This is the *raise*, and the
         * distinction is the whole design of this flow: a request is a proposal
         * and a decision is a signature or a finalisation. Both dirty the same
         * keys today, so the two scopes are twins in
         * `inventory-query-keys.ts` — but they are kept apart because the day
         * they diverge, "which of the four procedures is this" has to be a value
         * somebody chose on purpose rather than a coincidence. `auditLogs` comes
         * with it, which is the point: raising a request writes a change-log row,
         * and the Change log says every create appears.
         */
        await invalidateInventory(queryClient, "disposal");
      },
      onError: (error) => {
        toast.error(
          formatApiErrorMessage(error, "Could not raise this write-off request")
        );
      },
    })
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const result = v.safeParse(disposalRequestSchema, {
      itemId: itemId ?? "",
      qty,
      reason,
      method,
      estimatedValue: estimatedValue.trim() || undefined,
      notes: notes.trim() || undefined,
      uniqueItemIds: unitTags.length > 0 ? unitTags : undefined,
    });

    if (!result.success) {
      setErrors(issuesToFieldErrors(result));
      return;
    }
    setErrors({});

    /**
     * A part-named tag list is refused here rather than at the server, which
     * answers "Only 1 unit(s) are available" for an item that has three. On this
     * form naming units is genuinely optional — the specific device is often not
     * settled until somebody signs — so the refusal points at both ways out and
     * the empty field stays the recommended answer.
     */
    if (unitTags.length > 0 && unitTags.length !== qty) {
      setErrors({
        uniqueItemIds: `You pinned ${unitTags.length} tag${
          unitTags.length === 1 ? "" : "s"
        } but the quantity is ${qty}. Pin ${qty} tag${
          qty === 1 ? "" : "s"
        }, or clear this field and the oldest ${qty} will be chosen at sign-off.`,
      });
      return;
    }

    createMutation.mutate({
      itemId: result.output.itemId,
      qty: result.output.qty,
      reason: result.output.reason,
      method: result.output.method,
      /**
       * Explicit `null` when the field was left blank, which is a readability
       * choice rather than a workaround: `drizzle-valibot` wraps every nullable
       * column in both `nullable` and `optional`, so omitting the key is valid
       * and nothing here is compensating for a required one. "We were not told"
       * is a statement about the certificate; an absent key would be a statement
       * about the form.
       */
      estimatedValue: result.output.estimatedValue ?? null,
      ...(result.output.notes ? { notes: result.output.notes } : {}),
      ...(result.output.uniqueItemIds
        ? { uniqueItemIds: result.output.uniqueItemIds }
        : {}),
    });
  };

  const { isPending } = createMutation;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next || isPending) {
            onOpenChange(next);
            return;
          }
          requestClose();
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle>Raise a write-off request</DialogTitle>
            <DialogDescription>
              Propose that school property comes off the books, and wait for it
              to be signed
            </DialogDescription>
          </DialogHeader>

          <form
            id="disposal-request-form"
            onSubmit={handleSubmit}
            className="flex-1 space-y-6 overflow-y-auto px-6 py-4"
          >
            <FieldGroup>
              <DisposalRequestIdentityFields
                itemId={itemId}
                onItemChange={setItemId}
                qtyInput={qtyInput}
                onQtyChange={setQtyInput}
                errors={errors}
                disabled={isPending}
              />

              <Field data-invalid={errors.reason ? true : undefined}>
                <FieldLabel htmlFor="disposal-reason">Reason *</FieldLabel>
                <Textarea
                  id="disposal-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  maxLength={200}
                  placeholder="e.g. Beyond repair after the water damage in the east storeroom; insurance settled"
                  disabled={isPending}
                />
                <FieldDescription>
                  What the approver reads before signing, and what an audit
                  reads after. {reason.length}/200.
                </FieldDescription>
                {errors.reason ? (
                  <FieldError>{errors.reason}</FieldError>
                ) : null}
              </Field>

              <Field data-invalid={errors.method ? true : undefined}>
                <FieldLabel htmlFor="disposal-method">Method *</FieldLabel>
                <Select
                  value={method === "" ? null : method}
                  onValueChange={(value: string | null) => {
                    setMethod(value ?? "");
                  }}
                >
                  <SelectTrigger
                    id="disposal-method"
                    disabled={isPending}
                    aria-invalid={errors.method ? true : undefined}
                  >
                    <SelectValue placeholder="How is it leaving the school?" />
                  </SelectTrigger>
                  <SelectContent>
                    {DISPOSAL_METHODS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {disposalMethodLabel(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  The route the property takes. It is recorded on the
                  certificate and is what the final outcome is checked against.
                </FieldDescription>
                {errors.method ? (
                  <FieldError>{errors.method}</FieldError>
                ) : null}
              </Field>

              <UnitPickerField
                itemId={itemId}
                value={unitTags}
                onChange={setUnitTags}
                qty={qty}
                label="Pin specific units (optional)"
                error={errors.uniqueItemIds}
                description="Name the tags when the broken devices are in front of you — a pinned unit cannot be moved by any other flow while the request waits. Leave empty and the oldest available units are chosen at sign-off, which is usually the right answer because the specific device is often not settled until then. Pin as many as the quantity, or none at all: a part-pinned list is refused rather than half-applied."
                disabled={isPending}
              />

              {/**
               * **One money field, not two.**
               *
               * This form rendered `Estimated value` twice against the same
               * `estimatedValue` state with two different descriptions, both with
               * the same hardcoded DOM id. The second `<FieldLabel htmlFor>` resolved
               * to the *first* input, so the second input had no accessible name at
               * all, and the two descriptions told the clerk two different things
               * about the same figure on the same screen. The kept description is the
               * truer of the two, with the one real fact the deleted one carried —
               * that the figure can wait until finalisation — folded into it.
               *
               * `id` is passed because the field's default is a literal, and a
               * form that renders more than one money field must namespace it.
               */}
              <MoneyField
                id="disposal-estimated-value"
                value={estimatedValue}
                onChange={setEstimatedValue}
                label="Estimated value (optional)"
                description="What the school thinks it is losing. Recorded on the certificate and never recalculated — leave it empty if you do not know the figure, and supply or revise it at finalisation, which is the last chance to change it."
                error={errors.estimatedValue}
              />

              <Field>
                <FieldLabel htmlFor="disposal-notes">Notes</FieldLabel>
                <Textarea
                  id="disposal-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={2}
                  disabled={isPending}
                />
                <FieldDescription>
                  Anything the reason cannot hold in a sentence: an insurance
                  claim number, who collected it, where it is going.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>

          <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={requestClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="disposal-request-form"
              disabled={isPending}
            >
              {isPending ? "Raising..." : "Raise request"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {confirmNode}
    </>
  );
};

/**
 * Sign off that a proposed write-off *should* happen. **Still nothing moves.**
 *
 * A sign-off dialog, not a one-click button, because the approver is signing a
 * financial certificate and the server refuses self-approval: `approveDisposal`
 * compares the actor's staff id against `requestedByStaffId` and returns
 * `FORBIDDEN` when they match, or `BAD_REQUEST` when the account has no staff row
 * at all and the certificate would have nobody to name.
 *
 * **Both refusals are surfaced honestly rather than hidden behind a disabled
 * button.** The screen cannot know the caller's staff id — this component is not
 * given a session — so the rule is stated on the face of the dialog and the
 * server's own sentence is shown verbatim if it refuses. Hiding the button would
 * have produced a dead control and no explanation; a clerk who needs to know why
 * they cannot sign their own request is exactly the person who must be told.
 */
export const ApproveDisposalDialog = ({
  disposal,
  open,
  onOpenChange,
}: {
  disposal: DisposalRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");

  const approveMutation = useMutation(
    orpc.inventory.disposals.approve.mutationOptions({
      onSuccess: async (result) => {
        toast.success(
          `Write-off approved by ${result.approvedByName} — it can now be finalised, and the stock still has not moved`
        );
        setNote("");
        onOpenChange(false);
        /**
         * `disposalDecision`, not `disposal`. A signature is one of the three
         * decisions on an existing certificate; raising a request is the fourth
         * thing that writes to this list and it is a different act. Both dirty the
         * same keys today — the two scopes are deliberate twins in
         * `inventory-query-keys.ts` — but the queue this screen sits on is the
         * *decision* queue, and the change-log row it just wrote is the audit of a
         * signature rather than of a proposal.
         */
        await invalidateInventory(queryClient, "disposalDecision");
      },
      onError: (error) => {
        toast.error(
          formatApiErrorMessage(error, "Could not sign off this write-off")
        );
      },
    })
  );

  const { requestClose, confirmNode } = useDiscardGuard(
    note.trim().length > 0,
    () => {
      setNote("");
      onOpenChange(false);
    }
  );

  if (!disposal) {
    return null;
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next || approveMutation.isPending) {
            onOpenChange(next);
            return;
          }
          requestClose();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sign off this write-off</DialogTitle>
            <DialogDescription>
              You are approving that the school&rsquo;s books should say this
              property is gone. The stock does not move yet.
            </DialogDescription>
          </DialogHeader>

          <form
            id="disposal-approve-form"
            onSubmit={(event) => {
              event.preventDefault();
              approveMutation.mutate({
                disposalId: disposal.id,
                ...(note.trim() ? { note: note.trim() } : {}),
              });
            }}
            className="space-y-4"
          >
            <dl className="border-border divide-border divide-y border">
              <div className="flex gap-3 px-3 py-2">
                <dt className="text-muted-foreground w-32 shrink-0 text-xs">
                  Item
                </dt>
                <dd className="min-w-0 text-sm font-medium">
                  {disposal.qty} &times; {disposal.itemName}
                  <span className="text-muted-foreground ml-2 font-mono text-xs">
                    {disposal.itemSku}
                  </span>
                </dd>
              </div>
              <div className="flex gap-3 px-3 py-2">
                <dt className="text-muted-foreground w-32 shrink-0 text-xs">
                  Reason
                </dt>
                <dd className="min-w-0 text-sm">{disposal.reason}</dd>
              </div>
              <div className="flex gap-3 px-3 py-2">
                <dt className="text-muted-foreground w-32 shrink-0 text-xs">
                  Method
                </dt>
                <dd className="text-sm">
                  {disposal.methodLabel ?? disposalMethodLabel(disposal.method)}
                </dd>
              </div>
              <div className="flex gap-3 px-3 py-2">
                <dt className="text-muted-foreground w-32 shrink-0 text-xs">
                  Estimated value
                </dt>
                <dd className="text-sm tabular-nums">
                  {formatAmount(disposal.estimatedValue ?? null)}
                </dd>
              </div>
              <div className="flex gap-3 px-3 py-2">
                <dt className="text-muted-foreground w-32 shrink-0 text-xs">
                  Requested by
                </dt>
                <dd className="text-sm">
                  <PartyName
                    name={disposal.requestedByName}
                    staffId={disposal.requestedByStaffId}
                    emptyLabel="Raised by an account with no staff record"
                  />
                  {disposal.requestedAt ? (
                    <span className="text-muted-foreground ml-2 text-xs">
                      {formatDateTime(disposal.requestedAt)}
                    </span>
                  ) : null}
                </dd>
              </div>
              {disposal.units.length > 0 ? (
                <div className="flex gap-3 px-3 py-2">
                  <dt className="text-muted-foreground w-32 shrink-0 text-xs">
                    Pinned tags
                  </dt>
                  {/**
                   * Every tag, in full, on the page where the approver is signing a
                   * financial certificate. This is the one screen where a shortened
                   * list is a shortened decision: an approver who sees three of
                   * twenty is signing for twenty.
                   */}
                  <dd className="font-mono text-sm break-all">
                    {disposal.units.map((unit) => unit.uniqueNo).join(", ")}
                  </dd>
                </div>
              ) : null}
            </dl>

            <InventoryInlineNotice
              tone="warning"
              title="Two things the server will refuse"
              description="You cannot sign a request you raised yourself, and an account with no staff record cannot sign anything at all — the certificate has to name a person. If either applies, the message will say so plainly rather than failing silently."
            />

            <Field>
              <FieldLabel htmlFor="disposal-approve-note">
                Signature note (optional)
              </FieldLabel>
              <Textarea
                id="disposal-approve-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                placeholder="e.g. Agreed with the HOD; the replacement is on order"
                disabled={approveMutation.isPending}
              />
              <FieldDescription>
                Recorded on the status history and on the ledger row, so the
                transition reads on its own.
              </FieldDescription>
            </Field>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={requestClose}
                disabled={approveMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="disposal-approve-form"
                disabled={approveMutation.isPending}
                data-icon="inline-start"
              >
                <IconCheck data-icon="inline-start" />
                {approveMutation.isPending ? "Signing..." : "Sign off"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {confirmNode}
    </>
  );
};

/**
 * Finalise a signed write-off. **The stock leaves the books at this moment.**
 *
 * The one irreversible step in the whole feature, so:
 *
 * 1. The six terminal outcomes are a `Select`, not free text, and each carries a
 *    one-line consequence in `FINAL_OUTCOME_CONSEQUENCE` — "Written off" and
 *    "Donated" are both "removed from the register" to a reader who does not
 *    already know the difference, and the difference is the whole point of
 *    choosing.
 * 2. The `AlertDialog` says, in words, that the quantity drops and the tags
 *    become `disposed` the moment this is confirmed.
 * 3. `finalizeDisposal` re-checks availability itself, because weeks pass between
 *    the request and the signature and the units may have been issued or borrowed
 *    in between. That refusal is surfaced as-is.
 */
export const FinalizeDisposalDialog = ({
  disposal,
  open,
  onOpenChange,
}: {
  disposal: DisposalRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const queryClient = useQueryClient();
  const [finalStatus, setFinalStatus] = useState<string>("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const finalizeMutation = useMutation(
    orpc.inventory.disposals.finalize.mutationOptions({
      onSuccess: async (result) => {
        toast.success(
          `Write-off finalised as ${disposalStatusLabel(
            result.status
          )} by ${result.finalizedByName} — ${result.item.availableQty} now available`
        );
        setFinalStatus("");
        setEstimatedValue("");
        setNote("");
        setConfirmOpen(false);
        onOpenChange(false);
        /**
         * `disposalDecision` — the third of the three. This is the only step in
         * the whole feature that moves stock on the write-off path, and the
         * change-log row it writes is the audit of the point of no return.
         */
        await invalidateInventory(queryClient, "disposalDecision");
      },
      onError: (error) => {
        setConfirmOpen(false);
        toast.error(
          formatApiErrorMessage(error, "Could not finalise this write-off")
        );
      },
    })
  );

  const isDirty =
    finalStatus !== "" ||
    estimatedValue.trim().length > 0 ||
    note.trim().length > 0;

  const { requestClose, confirmNode } = useDiscardGuard(isDirty, () => {
    setFinalStatus("");
    setEstimatedValue("");
    setNote("");
    setConfirmOpen(false);
    onOpenChange(false);
  });

  if (!disposal) {
    return null;
  }

  /**
   * The chosen outcome, narrowed to the picklist — or `null`.
   *
   * Derived once rather than re-narrowed at each use site, because the `Select`'s
   * value and the `AlertDialog`'s confirmation are two different renders of the
   * same choice and they must not be able to disagree about which one is set.
   */
  const selectedFinal = isFinalStatus(finalStatus) ? finalStatus : null;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next || finalizeMutation.isPending) {
            onOpenChange(next);
            return;
          }
          requestClose();
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle>Finalise this write-off</DialogTitle>
            <DialogDescription>
              {disposal.qty} &times; {disposal.itemName}, signed off by{" "}
              {describeParty({
                name: disposal.approvedByName,
                staffId: disposal.approvedByStaffId,
                emptyLabel: "an account with no staff record",
              })}
            </DialogDescription>
          </DialogHeader>

          <form
            id="disposal-finalize-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (selectedFinal !== null) {
                setConfirmOpen(true);
                return;
              }
              setErrors({
                finalStatus: "Choose how the property is leaving the school",
              });
            }}
            className="flex-1 space-y-6 overflow-y-auto px-6 py-4"
          >
            <InventoryInlineNotice
              tone="danger"
              title="This is the point of no return"
              description="The quantity drops by the amount on the certificate, the asset tags become disposed, and the school's books stop counting them. A finalised certificate is a record, not an action — it cannot be undone or withdrawn afterwards, only superseded by a new one."
            />

            <Field data-invalid={errors.finalStatus ? true : undefined}>
              <FieldLabel htmlFor="disposal-final-status">
                How is it leaving the school? *
              </FieldLabel>
              <Select
                value={selectedFinal}
                onValueChange={(value: string | null) => {
                  setFinalStatus(value ?? "");
                  setErrors({});
                }}
              >
                <SelectTrigger
                  id="disposal-final-status"
                  aria-invalid={errors.finalStatus ? true : undefined}
                >
                  <SelectValue placeholder="Choose the outcome" />
                </SelectTrigger>
                <SelectContent>
                  {DISPOSAL_FINAL_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {disposalStatusLabel(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedFinal === null ? (
                <FieldDescription>
                  Six outcomes, and each is a different kind of loss. The one
                  you pick is what the certificate will say the school did.
                </FieldDescription>
              ) : (
                <FieldDescription>
                  {FINAL_OUTCOME_CONSEQUENCE[selectedFinal]}
                </FieldDescription>
              )}
              {errors.finalStatus ? (
                <FieldError>{errors.finalStatus}</FieldError>
              ) : null}
            </Field>

            <MoneyField
              id="disposal-finalize-estimated-value"
              value={estimatedValue}
              onChange={setEstimatedValue}
              label="Revised estimated value (optional)"
              description="Leave empty to keep the figure the requester supplied. Supplying one revises it — this is the only chance to correct it, because the certificate is issued as final."
            />

            <Field>
              <FieldLabel htmlFor="disposal-finalize-note">
                Finalisation note
              </FieldLabel>
              <Textarea
                id="disposal-finalize-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                placeholder="e.g. Collected by the contractor on 12 April; scrap receipt attached"
              />
              <FieldDescription>
                Appended to the movement note in the ledger, and to the status
                history so the transition reads on its own.
              </FieldDescription>
            </Field>
          </form>

          <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={requestClose}
              disabled={finalizeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="disposal-finalize-form"
              variant="destructive"
              disabled={finalizeMutation.isPending}
            >
              {finalizeMutation.isPending
                ? "Finalising..."
                : "Finalise write-off"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>
            Finalise as{" "}
            {selectedFinal === null
              ? "nothing"
              : disposalStatusLabel(selectedFinal)}
            ?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {selectedFinal === null
              ? "No outcome has been chosen, so there is nothing to confirm."
              : FINAL_OUTCOME_CONSEQUENCE[selectedFinal]}{" "}
            <span className="mt-2 block">
              {disposal.qty} unit{disposal.qty === 1 ? "" : "s"} of{" "}
              {disposal.itemName} will come off the school&rsquo;s books now,
              their asset tags will be marked disposed, and the register will
              stop counting them. This cannot be undone.
            </span>
          </AlertDialogDescription>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedFinal === null) {
                  return;
                }
                finalizeMutation.mutate({
                  disposalId: disposal.id,
                  finalStatus: selectedFinal,
                  ...(estimatedValue.trim()
                    ? { estimatedValue: estimatedValue.trim() }
                    : {}),
                  ...(note.trim() ? { note: note.trim() } : {}),
                });
              }}
              disabled={finalizeMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {finalizeMutation.isPending
                ? "Finalising..."
                : "Yes, finalise it"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      {confirmNode}
    </>
  );
};

const cancelSchema = v.object({
  reason: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "Say why this request is being withdrawn"),
    v.maxLength(
      MAX_CANCEL_REASON,
      `Keep the reason under ${MAX_CANCEL_REASON} characters`
    )
  ),
});

/**
 * Withdraw a write-off request. **No stock moves, and the request does not
 * vanish.**
 *
 * The reason is the only mandatory input anywhere in this flow, and the live
 * counter is here because the cap is the point: a cancellation with no stated
 * cause is how an asset register becomes unauditable — the next person to ask
 * "why was this dropped?" gets nothing, and the answer was known at the moment it
 * was dropped. The 500-character cap keeps it a sentence rather than a pasted
 * log, which is what makes it readable on the certificate a year later.
 *
 * Cancelling is not undoing anything, because nothing was done. The units were
 * never moved, so there is nothing to put back, and the dialog says so rather
 * than implying a reversal.
 */
export const CancelDisposalDialog = ({
  disposal,
  open,
  onOpenChange,
}: {
  disposal: DisposalRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const cancelMutation = useMutation(
    orpc.inventory.disposals.cancel.mutationOptions({
      onSuccess: async (result) => {
        toast.success(
          `Write-off withdrawn by ${result.cancelledByName} — no stock was ever moved`
        );
        setReason("");
        setErrors({});
        onOpenChange(false);
        /**
         * `disposalDecision` — the fourth and last of the write-off writes. A
         * withdrawal is a decision about an existing certificate, not a new
         * proposal, and it is audited exactly like the other three.
         */
        await invalidateInventory(queryClient, "disposalDecision");
      },
      onError: (error) => {
        toast.error(
          formatApiErrorMessage(error, "Could not withdraw this request")
        );
      },
    })
  );

  const { requestClose, confirmNode } = useDiscardGuard(
    reason.trim().length > 0,
    () => {
      setReason("");
      setErrors({});
      onOpenChange(false);
    }
  );

  if (!disposal) {
    return null;
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = v.safeParse(cancelSchema, { reason });

    if (!result.success) {
      setErrors(issuesToFieldErrors(result));
      return;
    }
    setErrors({});

    cancelMutation.mutate({
      disposalId: disposal.id,
      reason: result.output.reason,
    });
  };

  const isOverLimit = reason.length > MAX_CANCEL_REASON;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next || cancelMutation.isPending) {
            onOpenChange(next);
            return;
          }
          requestClose();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Withdraw this write-off request</DialogTitle>
            <DialogDescription>
              {disposal.qty} &times; {disposal.itemName} &mdash;{" "}
              {disposalStatusLabel(disposal.status)}
            </DialogDescription>
          </DialogHeader>

          <form
            id="disposal-cancel-form"
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            <InventoryInlineNotice
              tone="info"
              title="Nothing was moved, so nothing is being reversed"
              description="A request that has not been finalised has never touched the stock: the quantity, the asset tags and the register are exactly as they were. Withdrawing it closes the request and records who closed it and why. A certificate that has already been finalised cannot be withdrawn at all — it is a record, not an action."
            />

            <Field
              data-invalid={errors.reason || isOverLimit ? true : undefined}
            >
              <FieldLabel htmlFor="disposal-cancel-reason">Reason *</FieldLabel>
              <Textarea
                id="disposal-cancel-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                placeholder="e.g. Miscounted — there are four working projectors, not three"
                disabled={cancelMutation.isPending}
                aria-invalid={errors.reason || isOverLimit ? true : undefined}
              />
              <FieldDescription>
                The one mandatory field in this flow, and it is written to three
                places: the certificate, the status history, and the ledger row.
                A sentence is enough.
              </FieldDescription>
              <div className="flex justify-end">
                <p
                  className={`text-xs tabular-nums ${
                    isOverLimit ? "text-destructive" : "text-muted-foreground"
                  }`}
                  aria-live="polite"
                >
                  {reason.length} / {MAX_CANCEL_REASON}
                </p>
              </div>
              {errors.reason ? <FieldError>{errors.reason}</FieldError> : null}
              {isOverLimit ? (
                <FieldError>
                  {reason.length - MAX_CANCEL_REASON} character
                  {reason.length - MAX_CANCEL_REASON === 1 ? "" : "s"} over the
                  limit
                </FieldError>
              ) : null}
            </Field>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={requestClose}
                disabled={cancelMutation.isPending}
              >
                Keep it open
              </Button>
              {/**
               * **Not destructive, and that is the fix.**
               *
               * This button used to be `variant="destructive"` while Finalise —
               * the only step in the feature that actually moves stock, cannot be
               * undone, and is guarded by an `AlertDialog` — was *also* red. The
               * escalation was inverted, and the practical cost is worse than the
               * colour: a red button that opens no confirm teaches a clerk that
               * red means "this needs a second look", so the button that does get
               * a second look stops being the one that needs it. Withdrawing
               * changes no counter and cannot be undone, because nothing was done
               * — so it is the plain primary button, and Finalise keeps both the
               * colour and the confirm.
               */}
              <Button
                type="submit"
                form="disposal-cancel-form"
                disabled={cancelMutation.isPending}
                data-icon="inline-start"
              >
                <IconX data-icon="inline-start" />
                {cancelMutation.isPending
                  ? "Withdrawing..."
                  : "Withdraw request"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {confirmNode}
    </>
  );
};

/**
 * The four header counts.
 *
 * Rendered locally rather than through `InventoryStatCards`, and deliberately so:
 * that component's seven fields (`totalItems`, `lowStockItems`,
 * `unassignedItems`, …) describe the *item* register, and a card labelled "Items"
 * sitting above a count of write-off certificates would be a lie about what the
 * number is. These four come from `listDisposals`' own `summary`, which is computed
 * over the **whole filtered set** rather than the page — a header reading "3
 * awaiting approval" while the list shows one of them is a bug the user cannot see
 * through.
 */
const DisposalSummaryStrip: React.FC<{
  summary: {
    pendingApproval: number;
    approved: number;
    finalized: number;
    cancelled: number;
  };
}> = ({ summary }) => (
  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
    {(
      [
        {
          key: "pendingApproval",
          label: "Awaiting a signature",
          value: summary.pendingApproval,
          // `text-warning-ink`, not `text-gold`: this is a figure in body-sized
          // type and `--gold` is 3.87:1 on the page, below AA. The two tokens
          // coexist deliberately — `--gold` is still the right one for the
          // `border-accent/50` rules and the `accent` fills on the badges below,
          // where it is a surface rather than ink, and it is used as ink nowhere
          // in this feature after this change.
          tone: "text-warning-ink",
        },
        {
          key: "approved",
          label: "Signed, not finalised",
          value: summary.approved,
          tone: "text-foreground",
        },
        {
          key: "finalized",
          label: "Finalised — left the books",
          value: summary.finalized,
          tone: "text-destructive",
        },
        {
          key: "cancelled",
          label: "Withdrawn",
          value: summary.cancelled,
          tone: "text-muted-foreground",
        },
      ] as const
    ).map(({ key, label, value, tone }) => (
      <div key={key} className="border-border rounded-none border px-3 py-2">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className={`text-lg font-semibold tabular-nums ${tone}`}>{value}</p>
      </div>
    ))}
  </div>
);

/**
 * One certificate's status history, newest first, behind a `Collapsible`.
 *
 * **A `Collapsible` and not a `Tooltip`, deliberately.** A tooltip is reachable by
 * pointer and by focus on its trigger, but it is not in the tab order, it closes
 * on blur, and its content is not reliably announced — which makes it the wrong
 * control for the one thing a reader opens a history to read. A `Collapsible` is a
 * real button: tab to it, press Enter, read the rows, press again.
 *
 * **An empty list here is a normal state, not a failed load.** `listDisposals`
 * returns `history` only when the caller passes `withHistory`, and the absence of
 * the key is the signal that it was not asked for — a `pending_approval` request
 * legitimately has zero transitions because raising one writes none, and
 * approving it is the *first* row that will ever exist. So an empty array here
 * means "asked, and nothing has happened to it yet", and the copy says that rather
 * than showing a spinner or an error.
 */
const DisposalHistory: React.FC<{
  disposal: DisposalRecord;
  history: NonNullable<DisposalRecord["history"]>;
}> = ({ disposal, history }) => (
  <Collapsible>
    <CollapsibleTrigger
      render={
        <Button
          variant="ghost"
          size="sm"
          data-icon="inline-start"
          aria-label={`Status history for the ${disposal.qty} ${disposal.itemName} write-off`}
        />
      }
    >
      {/*
        An inline-start icon like every other button in this file, so the
        icon-to-label gap here is the button's own `gap-1` rather than a hand-set
        `mr-2`. The count beside the label is the one *trailing* element in the
        feature, and it keeps its `ml-2` — the house idiom sizes the leading gap,
        not the badge that follows the words.
      */}
      <IconHistory data-icon="inline-start" />
      History
      {history.length > 0 ? (
        <Badge variant="outline" className="ml-2 tabular-nums">
          {history.length}
        </Badge>
      ) : null}
    </CollapsibleTrigger>
    <CollapsibleContent>
      {history.length === 0 ? (
        <p className="text-muted-foreground border border-dashed p-3 text-xs">
          No transitions recorded yet. Raising a request writes none by design,
          so this stays empty until somebody signs it off or it is withdrawn.
        </p>
      ) : (
        <ol className="border-border divide-border divide-y border">
          {history.map((entry) => (
            <li
              /**
               * `changedAt` is the identity of a transition: the history table is
               * append-only and each row is written by its own insert, so the
               * timestamp is stable for the life of the row. The array index is
               * not, and keying a list a user can re-sort or filter by index is
               * how a row ends up showing somebody else's history.
               */
              key={entry.changedAt}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-3 py-2 text-xs"
            >
              <span className="font-medium">
                {entry.fromStatus === null
                  ? "Raised"
                  : `${disposalStatusLabel(entry.fromStatus)} → ${disposalStatusLabel(
                      entry.toStatus
                    )}`}
              </span>
              {/*
                `PartyName` rather than a local sentence, and the difference is the
                strike-through: a departed colleague's transition is a thing that
                happened, and the visual is what stops a reader scanning the list
                from taking "No longer on the staff roll" for a step that is still
                outstanding. Both columns are read, so this is the one surface in
                the feature that used to collapse "they have left" and "they never
                had a staff row" into a single gap and now does not.
              */}
              <span className="text-muted-foreground">
                <PartyName
                  name={entry.changedByName}
                  staffId={entry.changedByStaffId}
                  emptyLabel="Account with no staff row"
                />
              </span>
              <span className="text-muted-foreground ml-auto tabular-nums">
                {formatDateTime(entry.changedAt)}
              </span>
              {entry.note ? (
                <span className="text-muted-foreground w-full italic">
                  {entry.note}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </CollapsibleContent>
  </Collapsible>
);

/**
 * How a certificate's status badge reads, in the order the ladder is climbed.
 *
 * A request awaiting a signature is the row that needs a decision, so it is the
 * one that gets the emphasised treatment; a finalised certificate is a fact about
 * something that already happened and gets the destructive tone, because from the
 * store's point of view the school does not have the property any more. A signed,
 * not-yet-finalised request is deliberately quiet — it is a stage, not an outcome.
 */
const statusBadgeVariant = (
  isPendingApproval: boolean,
  isFinalOutcome: boolean
): "secondary" | "destructive" | "outline" => {
  if (isPendingApproval) {
    return "secondary";
  }

  if (isFinalOutcome) {
    return "destructive";
  }

  return "outline";
};

/** One actor/timestamp pair, or an explicit "has not happened" for an unset one. */
const SignOffCell: React.FC<{
  name: string | null;
  staffId: string | null;
  at: string | null;
  pending: string;
}> = ({ name, staffId, at, pending }) => {
  if (at === null) {
    return <span className="text-muted-foreground">{pending}</span>;
  }

  return (
    <span className="block">
      {/*
       * The *stage* is the empty state here, not "no name": `pending` says what
       * this column would be holding if the step had not happened yet, which is
       * true whether the column is empty because the step is outstanding or
       * because it never will be. `PartyName` then only speaks when there is a
       * timestamp, so a name can never appear next to "Not finalised".
       */}
      <PartyName
        name={name}
        staffId={staffId}
        emptyLabel="Recorded against an account with no staff row"
      />
      <span className="text-muted-foreground block text-xs tabular-nums">
        {formatDateTime(at)}
      </span>
    </span>
  );
};

/**
 * The queue presets, in the order a person works the ladder.
 *
 * **"Signed off" is first because it is the default.** The panel used to open on
 * `pending_approval`, which is the one stage the server refuses for its most
 * likely viewer: `approveDisposal` compares the actor's staff id against
 * `requestedByStaffId` and returns `FORBIDDEN` when they match, so a principal
 * who raised the request themselves — the common case for a storekeeper's
 * principal, and the case the tab order in `lifecycle-tabs.tsx` explicitly warns
 * about — lands on a queue of rows that cannot be actioned and spends two round
 * trips finding out. The signed-off queue is the one where every row can be
 * finalised, and finalising is the only step in the flow that moves stock, so it
 * is the one worth landing on. Nothing is hidden by the change: the summary strip
 * above carries the awaiting-a-signature count in words, and the preset is one
 * click away.
 */
const DISPOSAL_FILTERS: { value: DisposalFilter; label: string }[] = [
  { value: "approved", label: "Signed off" },
  { value: "pending_approval", label: "Awaiting signature" },
  { value: "final", label: "Finalised" },
  { value: "cancelled", label: "Withdrawn" },
  { value: "all", label: "All certificates" },
];

/**
 * The write-off register's rows.
 *
 * Split out of `DisposalsPanel` because it is the largest thing in the file and
 * because it is a different job from the panel: the panel owns the query, the
 * queue presets and the empty states, and this owns the shape of a certificate —
 * which is a document, not a list row, and it has ten columns because it has four
 * signatures on it.
 *
 * The row actions are handed in as callbacks rather than reaching for state, so
 * this component cannot open a dialog and the panel cannot accidentally render a
 * decision it does not own.
 */
const DisposalCertificatesTable: React.FC<{
  disposals: DisposalRecord[];
  onSignOff: (disposal: DisposalRecord) => void;
  onFinalise: (disposal: DisposalRecord) => void;
  onWithdraw: (disposal: DisposalRecord) => void;
}> = ({ disposals, onSignOff, onFinalise, onWithdraw }) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Item</TableHead>
        <TableHead className="text-right">Qty</TableHead>
        <TableHead>Reason</TableHead>
        <TableHead>Pinned tags</TableHead>
        <TableHead>Method</TableHead>
        <TableHead>Status</TableHead>
        <TableHead>Requested</TableHead>
        <TableHead>Approved</TableHead>
        <TableHead>Finalised</TableHead>
        <TableHead>Cancelled</TableHead>
        <TableHead>Actions</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {disposals.map((disposal) => {
        const isPendingApproval = disposal.pendingApproval;
        const isApproved = disposal.status === "approved";
        const isFinalOutcome = isFinalStatus(disposal.status);

        return (
          <TableRow key={disposal.id}>
            <TableCell>
              <span className="block font-medium">{disposal.itemName}</span>
              <span className="text-muted-foreground font-mono text-xs">
                {disposal.itemSku}
              </span>
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {disposal.qty}
            </TableCell>
            <TableCell className="max-w-64">
              <span className="line-clamp-2">{disposal.reason}</span>
            </TableCell>
            <TableCell>
              {/**
               * Every pinned tag, in full. The certificate is the only record of
               * which specific devices a write-off covered, so a count standing in
               * for the list is a count of nothing.
               */}
              {disposal.units.length > 0 ? (
                <span className="block font-mono text-xs break-all">
                  {disposal.units.map((unit) => unit.uniqueNo).join(", ")}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  &mdash; not pinned
                </span>
              )}
            </TableCell>
            <TableCell>
              {disposal.methodLabel ?? disposalMethodLabel(disposal.method)}
            </TableCell>
            <TableCell>
              <Badge
                variant={statusBadgeVariant(isPendingApproval, isFinalOutcome)}
              >
                {disposal.statusLabel ?? disposalStatusLabel(disposal.status)}
              </Badge>
            </TableCell>
            <TableCell>
              <SignOffCell
                name={disposal.requestedByName}
                staffId={disposal.requestedByStaffId}
                at={disposal.requestedAt}
                pending="Not recorded"
              />
            </TableCell>
            <TableCell>
              <SignOffCell
                name={disposal.approvedByName}
                staffId={disposal.approvedByStaffId}
                at={disposal.approvedAt}
                pending="Awaiting a signature"
              />
            </TableCell>
            <TableCell>
              <SignOffCell
                name={disposal.finalizedByName}
                staffId={disposal.finalizedByStaffId}
                at={disposal.finalizedAt}
                pending="Not finalised"
              />
            </TableCell>
            <TableCell>
              {/*
               * `pending="Not withdrawn"`, and not a dash.
               *
               * The three sibling columns answer an absent step in words —
               * "Awaiting a signature", "Not finalised" — because on a
               * certificate the reader is trying to work out *where in the ladder
               * this is*, and a dash says nothing at all about which step is
               * missing. This column is the fourth of the same ladder, so it
               * answers in the same language.
               */}
              <SignOffCell
                name={disposal.cancelledByName}
                staffId={disposal.cancelledByStaffId}
                at={disposal.cancelledAt}
                pending="Not withdrawn"
              />
              {disposal.cancellationReason ? (
                <span className="text-muted-foreground line-clamp-2 text-xs italic">
                  {disposal.cancellationReason}
                </span>
              ) : null}
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {isPendingApproval ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      onSignOff(disposal);
                    }}
                    data-icon="inline-start"
                  >
                    <IconCircleCheck data-icon="inline-start" />
                    Sign off
                  </Button>
                ) : null}
                {isApproved ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      onFinalise(disposal);
                    }}
                  >
                    Finalise
                  </Button>
                ) : null}
                {isPendingApproval || isApproved ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      onWithdraw(disposal);
                    }}
                  >
                    Withdraw
                  </Button>
                ) : null}
                {disposal.history ? (
                  <DisposalHistory
                    disposal={disposal}
                    history={disposal.history}
                  />
                ) : null}
              </div>
            </TableCell>
          </TableRow>
        );
      })}
    </TableBody>
  </Table>
);

/**
 * The disposal register: every write-off certificate, who raised it, who signed
 * it, who finalised it, and — optionally — how it got there.
 *
 * The row actions are driven entirely by `pendingApproval` and `status`, both of
 * which come from the server. Deriving "can I act on this" in the client would be
 * a second implementation of the ladder, and the one place it must not drift is
 * the buttons a principal clicks.
 */
/**
 * The write-off queue's empty state, and the reason it is a function rather than
 * two string constants.
 *
 * The three states are genuinely different facts, and only one of them is a
 * mistake. An empty queue filtered to *awaiting a signature* while the summary
 * says there are some pending is impossible — the summary and the list are
 * computed from the same `where` in one round trip — so that combination is
 * surfaced as a data inconsistency rather than as a cheerful "all clear". An
 * empty *finalised* list is the normal condition of a school that has not yet had
 * to destroy anything. And an entirely empty register is the one state that is
 * actually telling the user to do something.
 */
const disposalEmptyTitle = (
  filter: DisposalFilter,
  pendingApproval: number
): string => {
  if (filter === "pending_approval") {
    return pendingApproval > 0
      ? "The queue says these are signed, but no row is"
      : "Nothing is waiting for a signature";
  }
  if (filter === "approved") {
    return "No certificate is signed off and un-actioned";
  }
  if (filter === "cancelled") {
    return "No write-off has been withdrawn";
  }
  if (filter === "final") {
    return "Nothing has been finalised yet";
  }
  return "No school property has been written off";
};

const disposalEmptyDescription = (
  filter: DisposalFilter,
  hasFilter: boolean,
  summary: { pendingApproval: number; approved: number } | undefined
): string => {
  if (filter === "pending_approval" && summary && summary.pendingApproval > 0) {
    return "The summary above counts requests awaiting a signature, but no row is listed. Both numbers come from the same filtered set, so this is worth reporting rather than retrying — the list and the header are describing different things.";
  }
  if (filter === "pending_approval") {
    return "Every write-off request has been dealt with. Raising one puts a certificate in front of somebody who has to sign it, and the stock does not move until they do — so an empty queue means nothing is waiting on a decision.";
  }
  if (filter === "approved") {
    return "Nothing has been signed off and left waiting. A signed request can still be finalised, and finalising is the only step that takes stock off the books.";
  }
  if (filter === "cancelled") {
    return "No write-off request has been withdrawn. Withdrawing is for a request that turned out to be based on a miscount, a duplicated tag, or a device that turned out to be working.";
  }
  if (filter === "final") {
    return "A school that has not yet had to destroy anything looks exactly like this. A finalised certificate is the record of something that already happened — it cannot be created by finalising from here.";
  }
  if (hasFilter) {
    return "No certificate matches this search or queue. Clear them to see every write-off on record.";
  }
  return "The write-off register is empty, which is the best state it can be in. A certificate is a proposal first: raising one moves no stock, a second person has to sign it, and only finalising takes the property off the books.";
};

export const DisposalsPanel = () => {
  /**
   * "Signed off", not "Awaiting signature" — see `DISPOSAL_FILTERS` for why: the
   * awaiting-a-signature queue is the one stage the server refuses for the person
   * most likely to open it, so it is the worst place to land.
   */
  const [filter, setFilter] = useState<DisposalFilter>("approved");
  const [search, setSearch] = useState("");
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [approving, setApproving] = useState<DisposalRecord | null>(null);
  const [finalizing, setFinalizing] = useState<DisposalRecord | null>(null);
  const [cancelling, setCancelling] = useState<DisposalRecord | null>(null);

  const disposalsQuery = useQuery(
    orpc.inventory.disposals.list.queryOptions({
      input: {
        limit: DISPOSAL_LIST_LIMIT,
        // Asked for explicitly, because `history` is absent from the response
        // unless it is — and an absent key cannot be told from an empty one.
        withHistory: true,
        ...(isSingleStatusFilter(filter) ? { status: filter } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
      },
    })
  );

  const disposals = useMemo(
    () => disposalsQuery.data?.disposals ?? [],
    [disposalsQuery.data]
  );
  const summary = disposalsQuery.data?.summary;
  const total = disposalsQuery.data?.total ?? 0;
  const hasFilter = filter !== "all" || Boolean(search.trim());

  /**
   * The "Finalised" preset is a **client-side** narrowing of the returned page,
   * not a server filter, and the only place in this file that is true.
   *
   * `disposalStatusSchema` is a closed picklist and `listDisposals` has no
   * "any of these six" input, so there is no way to ask the server for the
   * terminal set as a group. The summary's `finalized` count is the server's own
   * figure for the same thing across the whole filtered set, and it is rendered
   * above — so if the narrowed page and that count disagree, the difference is
   * the page limit (50) rather than a filter that does not work. Stated here
   * rather than left for a reader to infer from a number.
   */
  const visibleDisposals = useMemo(
    () =>
      filter === "final"
        ? disposals.filter((row) => isFinalStatus(row.status))
        : disposals,
    [disposals, filter]
  );

  return (
    <div className="space-y-4">
      {summary ? <DisposalSummaryStrip summary={summary} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        {DISPOSAL_FILTERS.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={filter === option.value ? "default" : "outline"}
            aria-pressed={filter === option.value}
            onClick={() => {
              setFilter(option.value);
            }}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-56">
          <FieldLabel htmlFor="disposals-search">Search</FieldLabel>
          <Input
            id="disposals-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Reason, notes, item name or SKU"
            className="mt-1"
          />
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => setIsRequestOpen(true)}
          data-icon="inline-start"
        >
          <IconPlus data-icon="inline-start" />
          Raise a write-off
        </Button>
      </div>

      {disposalsQuery.isLoading ? <InventorySkeleton rows={6} /> : null}

      {disposalsQuery.isError ? (
        <InventoryErrorState
          error={disposalsQuery.error}
          onRetry={() => {
            void disposalsQuery.refetch();
          }}
        />
      ) : null}

      {!disposalsQuery.isLoading &&
      !disposalsQuery.isError &&
      visibleDisposals.length === 0 ? (
        <InventoryEmptyState
          title={disposalEmptyTitle(filter, summary?.pendingApproval ?? 0)}
          description={disposalEmptyDescription(filter, hasFilter, summary)}
        />
      ) : null}

      {!disposalsQuery.isLoading &&
      !disposalsQuery.isError &&
      visibleDisposals.length > 0 ? (
        <>
          <DisposalCertificatesTable
            disposals={visibleDisposals}
            onSignOff={setApproving}
            onFinalise={setFinalizing}
            onWithdraw={setCancelling}
          />

          {/**
           * **Two different numbers, and this line says which is which.**
           *
           * It used to read "Showing 12 of 30 certificates" under a *Finalised*
           * preset, where 12 is a browser-side narrowing of the 50 rows the server
           * sent and 30 is the server's own count for the same filter. Two filters
           * presented as one, and a reader comparing the two figures against the
           * "Finalised" count in the strip above had no way to know that the gap
           * was the page limit rather than a broken filter. The Finalised branch
           * now names the mechanism and the page size; every other preset is a
           * single server filter and says the simple thing.
           */}
          <p className="text-muted-foreground text-xs">
            {filter === "final" ? (
              <>
                Showing {visibleDisposals.length} of the {total} certificates
                this queue returned, narrowed in your browser rather than on the
                server: there is no &ldquo;any of the six terminal
                outcomes&rdquo; filter, so the {DISPOSAL_LIST_LIMIT} rows below
                the page limit are filtered here. The{" "}
                <span className="font-medium">Finalised</span> count in the
                strip above is the server&rsquo;s own figure across the whole
                set, so the two can differ by more than this page holds.
              </>
            ) : (
              <>
                Showing {visibleDisposals.length} of {total} certificates.
                Requests awaiting a signature are listed first, newest within
                each group.
              </>
            )}
          </p>
        </>
      ) : null}

      <DisposalRequestDialog
        open={isRequestOpen}
        onOpenChange={setIsRequestOpen}
      />
      <ApproveDisposalDialog
        disposal={approving}
        open={approving !== null}
        onOpenChange={(next) => {
          if (!next) {
            setApproving(null);
          }
        }}
      />
      <FinalizeDisposalDialog
        disposal={finalizing}
        open={finalizing !== null}
        onOpenChange={(next) => {
          if (!next) {
            setFinalizing(null);
          }
        }}
      />
      <CancelDisposalDialog
        disposal={cancelling}
        open={cancelling !== null}
        onOpenChange={(next) => {
          if (!next) {
            setCancelling(null);
          }
        }}
      />
    </div>
  );
};
