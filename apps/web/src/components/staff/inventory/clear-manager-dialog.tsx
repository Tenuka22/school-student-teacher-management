"use client";

/**
 * The confirmation in front of removing the person an item is answerable to.
 *
 * **It is a separate file because the destructive third state of the manager
 * dialog is a dialog of its own, and it must be readable without the form.** The
 * whole point of this step is that it is a *different question* from the one
 * above it, asked in a different place, with its own consequences. Inlining it
 * put a second question in the middle of a form and made the file's two states
 * compete for the reader's attention.
 *
 * ## Why it is an `AlertDialog` and not a `Dialog`
 *
 * `AlertDialog` in `packages/ui` forces `modal` and `disablePointerDismissal`, and
 * refuses `Esc` unless a caller opts in. All three matter here:
 *
 * - **A backdrop click does nothing.** A half-typed reason is on the form behind
 *   this, and losing it to a stray click on the dimmed register is the exact
 *   failure `PRODUCT.md` calls a dangling state.
 * - **`Esc` does nothing either**, and that is the one worth arguing about. WCAG
 *   2.1 SC 2.1.2 is about *trapping* somebody who cannot leave, and nothing is
 *   trapped: `AlertDialogCancel` is a real button inside the focus order, so
 *   `Tab` then `Enter` walks out and returns focus to the trigger. What `Esc` is
 *   refused to prevent is the opposite failure — a reflex that removes the dialog
 *   that exists to force a decision, leaving the decision unmade and the form
 *   still holding somebody's ninety seconds of typing.
 * - **Focus is trapped and restored**, which is what "a deliberate destructive
 *   confirm must be deliberate" actually requires in a form this size.
 *
 * ## What it says, and why each sentence
 *
 * It names the item, it names the person losing the accountability, it says the
 * custodian is untouched, and it says the row is permanent. The third of those is
 * the one a reader of an accountability trail will otherwise get wrong: clearing
 * the manager does not move the item, and a form that only said "remove manager"
 * reads as "the item moves back to the store".
 */
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@school-student-teacher-management/ui/components/alert-dialog";
import { Button } from "@school-student-teacher-management/ui/components/button";
import { IconAlertTriangle } from "@tabler/icons-react";

export interface ClearManagerDialogProps {
  isOpen: boolean;
  isPending: boolean;
  itemName: string;
  currentManager: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Both action buttons get a fixed minimum width.
 *
 * The alternative — swapping the label to "Recording…" the way the older version
 * of this dialog did — changes the button's width on the one press where a misread
 * costs a school an item nobody is answerable for. `min-w-48` is wider than
 * "Clear the manager" at this size and identical in both states, so the box the
 * pointer is travelling toward does not move. The `Button`'s own `loading` prop
 * then blocks a second activation and sets `aria-busy` without either button
 * emptying itself.
 */
const ACTION_WIDTH = "min-w-48";

export const ClearManagerDialog = ({
  isOpen,
  isPending,
  itemName,
  currentManager,
  onCancel,
  onConfirm,
}: ClearManagerDialogProps) => (
  <AlertDialog
    open={isOpen}
    onOpenChange={(next) => {
      if (!next && !isPending) {
        onCancel();
      }
    }}
  >
    <AlertDialogContent className="sm:max-w-md">
      {/*
        The glyph is decoration and says nothing a screen reader needs, and the
        state is never carried by it: the title words it and the action is styled
        as destructive.
      */}
      <span aria-hidden="true" className="text-destructive flex">
        <IconAlertTriangle className="size-5" />
      </span>
      <AlertDialogTitle>Clear the manager for {itemName}?</AlertDialogTitle>
      <AlertDialogDescription>
        {currentManager
          ? `${currentManager} will stop being accountable for this item, and that is written to the item's history as a manager-cleared row with the reason you pick.`
          : "Nobody will be accountable for this item, and that is written to the item's history as a manager-cleared row with the reason you pick."}{" "}
        The item keeps its custodian and does not move: accountability and
        custody are separate facts on this trail, and clearing one never moves
        the other.
        {currentManager
          ? ` If you meant to leave ${currentManager} in charge, cancel — the dialog defaults to changing nothing.`
          : " If you meant to appoint somebody instead, cancel."}
      </AlertDialogDescription>
      <AlertDialogFooter>
        <AlertDialogCancel className={ACTION_WIDTH} disabled={isPending}>
          Leave {currentManager ?? "it"} as it is
        </AlertDialogCancel>
        {/*
          `type="button"` explicitly. This button sits inside the manager dialog's
          `<form>` in the React tree, and a submit-capable button inside a form
          whose `onSubmit` is the *manager* write is one stray `Enter` away from
          writing a row this dialog was opened to ask about.
        */}
        <Button
          type="button"
          variant="destructive"
          className={ACTION_WIDTH}
          loading={isPending}
          onClick={onConfirm}
        >
          Clear the manager
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
