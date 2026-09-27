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

import type { AccountRow } from "./users-types";

interface BulkBanDialogProps {
  /** The ticked accounts, or an empty list when the dialog is closed. */
  accounts: AccountRow[];
  /** True lifts the bans instead of applying them. */
  isUnban: boolean;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: { banned: boolean; reason: string }) => void;
}

const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

const getConfirmLabel = (isPending: boolean, isUnban: boolean): string => {
  if (isPending) {
    return "Working…";
  }

  return isUnban ? "Unban accounts" : "Ban accounts";
};

/**
 * The confirmation for a ban across every ticked row, and the same gate for
 * lifting them.
 *
 * It is deliberately a different dialog from the single-account one rather than
 * the same dialog with a count in it. A ban ends someone's access immediately
 * and the reason is stored on their row, so the reason is typed here and cannot
 * be left blank — and on a bulk action that reason is written to *every* account
 * in the set, which is a fact the administrator has to be told before the
 * button, not after.
 *
 * The list of names is truncated rather than absent: somebody banning forty
 * accounts has ticked forty rows and does not need them read back, but somebody
 * banning three does need to see that the third is the wrong person, and the
 * first three are the only ones this says anything about.
 */
export const BulkBanDialog = ({
  accounts,
  isUnban,
  isPending,
  onOpenChange,
  onConfirm,
}: BulkBanDialogProps) => {
  // Seeded from the set, which the parent keys on: a new selection means a new
  // instance, so a previous reason cannot leak into the next decision.
  const [reason, setReason] = useState("");

  const isOpen = accounts.length > 0;
  const trimmedReason = reason.trim();
  const names = accounts.slice(0, 3).map((account) => account.name);
  const remaining = accounts.length - names.length;

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setReason("");
        }
        onOpenChange(open);
      }}
    >
      <AlertDialogContent className="border-border bg-card max-w-[440px] border p-0">
        <AlertDialogHeader className="border-border border-b px-6 py-5">
          <div className="text-destructive type-eyebrow">
            {isUnban ? "Restore access" : "Suspend accounts"}
          </div>
          <AlertDialogTitle className="text-foreground text-xl">
            {isUnban
              ? `Unban ${plural(accounts.length, "account")}?`
              : `Ban ${plural(accounts.length, "account")}?`}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground type-body">
            {names.join(", ")}
            {remaining > 0 && ` and ${plural(remaining, "other account")}`} will
            be {isUnban ? "able to sign in again" : "signed out and blocked"}{" "}
            {isUnban ? "immediately." : "until the ban is lifted."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {!isUnban && (
          <div className="px-6 py-5">
            <label className="flex flex-col gap-1.5" htmlFor="bulk-ban-reason">
              <span className="text-foreground text-sm font-semibold">
                Reason for the ban
              </span>
              <textarea
                className="border-input text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring min-h-[74px] w-full resize-y border bg-white px-3 py-2 text-base leading-relaxed outline-none focus-visible:ring-1 sm:text-sm"
                id="bulk-ban-reason"
                aria-describedby="bulk-ban-reason-hint"
                onChange={(event) => setReason(event.target.value)}
                placeholder="e.g. left the College - staff record closed"
                required
                value={reason}
              />
            </label>
            <p
              className="text-muted-foreground mt-2 text-sm"
              id="bulk-ban-reason-hint"
            >
              The same reason is written to every account in this batch, and it
              is shown wherever a ban is displayed — so it has to be a sentence
              that makes sense on all {accounts.length} of them.
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
              onConfirm({
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
