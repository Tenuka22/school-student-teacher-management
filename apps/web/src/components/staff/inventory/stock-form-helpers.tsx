"use client";

/*
 * The feature's form primitives: date formatting, tag prose, valibot-issue
 * mapping, the three-state person label, and the discard guard.
 *
 * **Why these live in their own module.** They were declared in `stock-dialogs.tsx`
 * because every one of the six dialog files in this feature already imported them
 * from there, and a sixth re-implementation of `summariseTags` is worse than a
 * Fast Refresh boundary. `stock-dialogs.tsx` still re-exports all eight, so those
 * import paths are unchanged — but the definitions now have a home that describes
 * what they are (form primitives) rather than inheriting the name of whichever
 * dialog happened to be written first.
 *
 * `toQuantity` keeps its original truncating behaviour **on purpose**, and
 * `parseQuantity` in `quantity.ts` is what this feature's own quantity fields
 * use. See the note on `toQuantity` for why the two coexist.
 */
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@school-student-teacher-management/ui/components/alert-dialog";
import { useState } from "react";
import type * as v from "valibot";

/* oxlint-disable react-doctor/only-export-components -- eight pure helpers and one hook shared by this feature's six dialog files; see the note above the imports */

/**
 * The refusal for a **part-named** list of asset tags, or `null` when the field is
 * empty (the recommended answer on all four movements) or exactly the right length.
 *
 * One function, four movements, four verbs — because the arithmetic and the false
 * sentence are the same every time and only the last clause differs. Each caller
 * passes its own verb:
 *
 * | movement | verb | the consequence it avoids |
 * | --- | --- | --- |
 * | `stockOut` | `taken` | `getAvailableUnits` answering *"Only 1 unit(s) are available"* for an item that has three |
 * | `issues.create` | `issued` | the same, one step earlier, on a certificate |
 * | `disposals.create` | `chosen at sign-off` | the same, on a request whose devices are not settled yet |
 * | `borrows.create` | `lent` | the same, in `borrow-dialogs.tsx` |
 *
 * **The server's wording is what is being avoided, deliberately.** *"Only 1 unit(s)
 * are available"* is **false** — the item has three and the clerk named one — and
 * repeating it puts a lie in front of the user at the moment they decide what to do
 * about it. A storebook that says a projector is unavailable when two are on the
 * shelf is a storebook nobody trusts.
 */
export const partNamedTagMessage = (
  named: number,
  qty: number,
  verb: string
): string | null => {
  if (named === 0 || named === qty) {
    return null;
  }
  return `You named ${named} tag${named === 1 ? "" : "s"} but the quantity is ${qty}. Name ${qty} tag${qty === 1 ? "" : "s"}, or clear this field and the oldest ${qty} will be ${verb} for you.`;
};

/**
 * Every timestamp in this feature reads the same way, in one format.
 *
 * `en-GB` with a two-digit day and a 24-hour clock, which is the only convention
 * a Sri Lankan school register uses, and identical in every file, so a movement at
 * 09:05 and its certificate at 09:05 cannot be rendered two different ways.
 */
export const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** The date half of `formatDateTime`, for a `date` column that is already `YYYY-MM-DD`. */
export const formatDate = (isoDate: string): string =>
  new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

/**
 * Parse a numeric input without letting `NaN` reach valibot.
 *
 * ## Kept exactly as it was, and this is a decision rather than an oversight
 *
 * This truncates (`2.7` → `2`) and folds anything unparseable to `0`. That is
 * **wrong** for a quantity, and `parseQuantity` in `quantity.ts` is the right
 * version — but this function is imported by `borrow-dialogs.tsx` and
 * `custody-dialogs.tsx`, which are owned by other agents and whose valibot
 * schemas were written against the truncating behaviour. Changing it here would
 * change what their `v.integer()` checks fire on, invisibly, in files I do not
 * own and cannot see the whole of.
 *
 * So it stays. **Nothing in the three dialog files this agent owns calls it**:
 * every quantity they capture goes through `parseQuantity`, which refuses a
 * decimal instead of rounding it away. The fix for the other two files is to move
 * them onto the same helper, and it is a one-line change per call site.
 */
export const toQuantity = (raw: string): number => {
  const parsed = Math.trunc(Number(raw));
  return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * Valibot issues → a `field: message` map, for rendering an error on the input
 * that caused it rather than only in a toast.
 *
 * Keyed as a plain string map so one helper serves every form in the feature
 * without a generic per form. Only the first issue per field is kept: a field
 * that has failed four ways should read as one problem, and the rest are noise.
 */
export const issuesToFieldErrors = (result: {
  issues?: readonly v.BaseIssue<unknown>[];
}): Record<string, string> => {
  const errors: Record<string, string> = {};

  for (const issue of result.issues ?? []) {
    const key = issue.path?.[0]?.key;
    if (typeof key === "string" && !(key in errors)) {
      errors[key] = issue.message;
    }
  }

  return errors;
};

/**
 * Name a handful of tags in a toast or a summary line, without pasting fifty into
 * it. **One format for the whole feature**, which is the point: it used to be
 * declared four times and rendered three different ways (`" and 17 more"` and
 * `" +17 more"` on the same kind of list), so the same twenty tags read as two
 * different lists depending on which tab you were on.
 *
 * This is for *prose* — a toast, a certificate summary. It is never used on a
 * record whose only content is the evidence: the issue certificate, the loan row
 * and the write-off certificate print every tag, because a truncated asset tag
 * list on the one page an auditor opens is a truncated audit trail.
 */
export const summariseTags = (tags: string[]): string => {
  const shown = tags.slice(0, 3).join(", ");
  return tags.length > 3 ? `${shown} and ${tags.length - 3} more` : shown;
};

/** The one sentence this feature uses for "there was a person, and they are gone". */
const PARTY_GONE_LABEL = "No longer on the staff roll";

/**
 * Who a recorded actor was, in words.
 *
 * **Three states, and the middle one is the reason this exists.** Every
 * `*ByStaffId` column in this feature is `onDelete: "set null"` so that deleting
 * a teacher does not delete the record of the write-offs they signed, which
 * means a row can arrive with a name and an id, a name and no id, or **no name
 * and an id**:
 *
 * - a name → the person, named.
 * - no name but an id → *the record is gone and the change was real*. A
 *   departed colleague's hand-over is a fact about the past; rendering it as a
 *   blank cell would make the row look unfilled, and rendering it as "unknown"
 *   would imply the change might not have happened.
 * - no name and no id → *the slot was never filled*. Nothing is missing.
 *
 * Collapsing the last two into one phrase is what produced four different
 * sentences for the same fact across the feature, and it is also what made a
 * withdrawn request look like a signed one. `emptyLabel` is per call site
 * because the empty state means something different on each: no signature
 * recorded, not withdrawn, an account with no staff row at all.
 */
export const describeParty = ({
  name,
  staffId,
  emptyLabel,
  goneLabel = PARTY_GONE_LABEL,
}: {
  name: string | null;
  staffId: string | null;
  emptyLabel: string;
  goneLabel?: string;
}): string => name ?? (staffId ? goneLabel : emptyLabel);

/**
 * `describeParty` as a cell, with the gone case struck through.
 *
 * The strike is the visual half of the distinction and not decoration: a name
 * rendered in the same weight as a live one reads as a current member of staff,
 * and this feature's whole point is that the row outlives the person.
 */
export const PartyName: React.FC<{
  name: string | null;
  staffId: string | null;
  emptyLabel: string;
  goneLabel?: string;
}> = ({ name, staffId, emptyLabel, goneLabel }) => {
  if (name) {
    return <span className="font-medium">{name}</span>;
  }

  if (staffId) {
    return (
      <span className="text-muted-foreground line-through">
        {goneLabel ?? PARTY_GONE_LABEL}
      </span>
    );
  }

  return <span className="text-muted-foreground">{emptyLabel}</span>;
};

/**
 * Ask before throwing away a form somebody has filled in.
 *
 * ## Why this is a `Dialog` and not a `beforeunload`
 *
 * Every way out of a `Dialog` funnels through its `onOpenChange` — Esc, the X,
 * the backdrop, the Cancel button — and the parent owns `open`, so refusing to
 * forward `false` is enough to keep the dialog standing. A native
 * `beforeunload` would only cover the browser tab, which is not where a
 * twenty-row delivery is lost: it is lost to a stray Esc.
 *
 * ## Esc is *allowed* here, and that is a different decision from the destructive
 * confirms in this feature
 *
 * `AlertDialog` refuses Esc by default, which is right for "finalise this
 * write-off — it cannot be undone". This prompt is not that: it moves no stock and
 * destroys nothing, and its whole job is to be easy to back out of. Esc closes
 * the question and leaves the form standing with every field intact, so the
 * worst outcome of a stray Esc is that the clerk presses Esc once more instead
 * of once. `closeOnEscape` makes that explicit rather than leaving Esc to do
 * nothing and look broken.
 *
 * ## What this deliberately does not do
 *
 * **It is not per-field.** The cheapest honest version is one boolean — "is any
 * field off its default" — and that is what this is. The alternative is a
 * per-field dirty map driving a list of exactly what will be lost ("4 asset tags,
 * the supplier and the invoice number"), which is nicer and costs a dirty-tracking
 * wrapper around every one of twenty-six controls and a list that has to be
 * written and kept true by hand. On a form this size that maintenance is a
 * bigger risk than the confirmation is a nicety, so the confirm says what is at
 * stake in the form's own terms and not in a field count.
 */
export const useDiscardGuard = (
  isDirty: boolean,
  onDiscard: () => void
): { requestClose: () => void; confirmNode: React.ReactNode } => {
  const [isAsking, setIsAsking] = useState(false);

  return {
    requestClose: () => {
      if (isDirty) {
        setIsAsking(true);
        return;
      }
      onDiscard();
    },
    // `isDirty` is re-read here rather than latched, so a form that went clean
    // for any reason while the question was open drops the question instead of
    // leaving a confirm for work that is no longer at stake.
    confirmNode:
      isAsking && isDirty ? (
        <AlertDialog open closeOnEscape onOpenChange={setIsAsking}>
          <AlertDialogContent>
            <AlertDialogTitle>Discard what you have typed?</AlertDialogTitle>
            <AlertDialogDescription>
              Nothing on this form has been saved, and closing it now loses all
              of it &mdash; every field you have filled in, including any asset
              tags you have named. There is no partial save and no draft to come
              back to, so the only way to keep this work is to stay on the form.
            </AlertDialogDescription>
            <div className="flex justify-end gap-2">
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  setIsAsking(false);
                  onDiscard();
                }}
              >
                Discard it
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      ) : null,
  };
};
