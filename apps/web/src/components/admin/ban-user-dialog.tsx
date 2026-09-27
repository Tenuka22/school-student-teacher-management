import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@school-student-teacher-management/ui/components/alert-dialog";
import { useState } from "react";

export interface BanTarget {
  id: string;
  name: string;
  email: string;
  username?: string | null;
  role?: string | null;
  banReason?: string | null;
}

interface BanUserDialogProps {
  /** The account to act on, or null when the dialog is closed. */
  target: BanTarget | null;
  /** True lifts a ban instead of applying one. */
  isUnban: boolean;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: {
    userId: string;
    banned: boolean;
    reason: string;
  }) => void;
}

const getConfirmLabel = (isPending: boolean, isUnban: boolean): string => {
  if (isPending) {
    return "Working…";
  }

  return isUnban ? "Unban account" : "Ban account";
};

/**
 * Confirmation for a ban, and the same gate for lifting one.
 *
 * Banning is not a one-click toggle: it ends someone's access immediately and
 * the reason is stored on the user row, so it is typed here and cannot be left
 * blank. Unban goes through the same dialog with the wording reversed, because
 * restoring access to an account an administrator removed by mistake deserves
 * the same deliberate pause.
 */
export const BanUserDialog = ({
  target,
  isUnban,
  isPending,
  onOpenChange,
  onConfirm,
}: BanUserDialogProps) => {
  // Seeded from the target, which the parent keys on: a new target means a new
  // instance, so a previous reason can never leak into the next decision.
  const [reason, setReason] = useState(target?.banReason ?? "");

  const isOpen = target !== null;
  const trimmedReason = reason.trim();

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open) {
          setReason("");
        }
        onOpenChange(open);
      }}
      open={isOpen}
    >
      <AlertDialogContent className="border-border bg-card max-w-[440px] border p-0">
        <AlertDialogHeader className="border-border border-b px-6 py-5">
          <div className="text-destructive type-eyebrow">
            {isUnban ? "Restore access" : "Suspend account"}
          </div>
          <AlertDialogTitle className="text-foreground text-xl">
            {isUnban ? "Unban this account?" : "Ban this account?"}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground type-body">
            {isUnban ? (
              <>
                <strong className="text-foreground">{target?.name}</strong> (
                {target?.email}) will be able to sign in again immediately.
                {target?.banReason && (
                  <>
                    {" "}
                    The reason on file was:
                    <span className="text-foreground">
                      {" "}
                      “{target.banReason}”
                    </span>
                  </>
                )}
              </>
            ) : (
              <>
                <strong className="text-foreground">{target?.name}</strong> (
                {target?.email}) will be signed out and blocked from signing in
                again until a ban is lifted. Their data is kept — this is not a
                deletion.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {!isUnban && (
          <div className="px-6 py-5">
            <label className="flex flex-col gap-1.5" htmlFor="ban-reason">
              <span className="text-foreground text-sm font-semibold">
                Reason for the ban
              </span>
              <textarea
                className="border-input text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring min-h-[74px] w-full resize-y border bg-white px-3 py-2 text-base leading-relaxed outline-none focus-visible:ring-1 sm:text-sm"
                id="ban-reason"
                aria-describedby="ban-reason-hint"
                onChange={(event) => setReason(event.target.value)}
                placeholder="e.g. left the College — staff record closed"
                required
                value={reason}
              />
            </label>
            <p
              id="ban-reason-hint"
              className="text-muted-foreground mt-2 text-sm"
            >
              The reason is stored on the account and shown wherever the ban is
              displayed, so write it for whoever reads it next.
            </p>
          </div>
        )}

        <AlertDialogFooter className="border-border border-t px-6 py-4">
          <AlertDialogCancel
            className="border-input text-foreground hover:bg-primary/5 border px-4 py-2 text-sm font-semibold"
            disabled={isPending}
          >
            {isUnban ? "Keep banned" : "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            className={`text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-60 ${
              isUnban
                ? "bg-primary hover:bg-primary-hover"
                : "bg-destructive hover:bg-destructive/90"
            }`}
            disabled={isPending || (!isUnban && trimmedReason.length === 0)}
            onClick={() => {
              if (!target) {
                return;
              }

              onConfirm({
                userId: target.id,
                banned: !isUnban,
                reason: isUnban ? "" : trimmedReason,
              });
            }}
          >
            {getConfirmLabel(isPending, isUnban)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
