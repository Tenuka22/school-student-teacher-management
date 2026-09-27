import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@school-student-teacher-management/ui/components/alert-dialog";
import { Button } from "@school-student-teacher-management/ui/components/button";
import { IconLoader2 } from "@tabler/icons-react";
import type { ReactNode } from "react";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  /** Runs the existing mutation. The caller closes the dialog on success. */
  onConfirm: () => void;
  confirmLabel: string;
  /** Shown on the confirm button while `isPending`, e.g. "Deleting…". */
  pendingLabel?: string;
  cancelLabel?: string;
  isPending?: boolean;
  /** `destructive` renders a solid crimson confirm button. */
  tone?: "default" | "destructive";
  /** Extra content between the description and the buttons. */
  children?: ReactNode;
}

/**
 * A confirmation step in front of an existing action.
 *
 * While the action is pending both buttons are disabled and the dialog
 * ignores Escape/backdrop dismissal, so a double click can never send the
 * mutation twice and the user can't lose sight of an in-flight change.
 */
export const ConfirmDialog = ({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel,
  pendingLabel,
  cancelLabel = "Cancel",
  isPending = false,
  tone = "default",
  children,
}: ConfirmDialogProps) => (
  <AlertDialog
    open={open}
    onOpenChange={(next) => {
      if (isPending && !next) {
        return;
      }
      onOpenChange(next);
    }}
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      {children}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isPending}>
          {cancelLabel}
        </AlertDialogCancel>
        <Button
          type="button"
          onClick={onConfirm}
          disabled={isPending}
          aria-busy={isPending || undefined}
          className={
            tone === "destructive"
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : undefined
          }
        >
          {isPending ? (
            <IconLoader2 aria-hidden="true" className="animate-spin" />
          ) : null}
          {isPending ? (pendingLabel ?? confirmLabel) : confirmLabel}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
