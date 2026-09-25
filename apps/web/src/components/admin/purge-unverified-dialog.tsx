import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";

interface PurgeUnverifiedDialogProps {
  open: boolean;
  isPending: boolean;
  /** Accounts the sweep would remove, oldest first. */
  accounts: { name: string; createdAt: string }[];
  /** How long an unverified account is kept before it is swept. */
  retentionDays: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

const formatDate = (value: string): string => {
  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
};

/**
 * Confirmation for the unverified-account sweep.
 *
 * The list is the point: an administrator sees exactly which accounts go,
 * named, before agreeing to it. The same sweep runs unattended on a schedule,
 * so this dialog exists to make the *manual* run deliberate rather than to
 * gate the automatic one.
 */
export const PurgeUnverifiedDialog = ({
  open,
  isPending,
  accounts,
  retentionDays,
  onOpenChange,
  onConfirm,
}: PurgeUnverifiedDialogProps) => (
  <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent className="sm:max-w-[520px]">
      <DialogHeader>
        <div className="text-destructive text-[12px] font-extrabold tracking-[0.24em]">
          ACCOUNT CLEANUP
        </div>
        <DialogTitle className="font-heading text-primary text-[26px] font-semibold">
          {accounts.length === 0
            ? "Nothing to clean up"
            : `Delete ${accounts.length} unverified account${accounts.length === 1 ? "" : "s"}?`}
        </DialogTitle>
        <DialogDescription>
          {accounts.length === 0 ? (
            <>
              No account has gone {retentionDays} days without confirming its
              email address. The College server also clears stale accounts when
              it starts.
            </>
          ) : (
            <>
              These accounts registered but never entered the code sent to their
              address, and are more than {retentionDays} days old. They are
              deleted along with their sessions. This cannot be undone.
              <br />
              <br />
              Any staff record they created is kept, but loses its link to the
              deleted account, so it appears in the staff list without a
              username. Re-link or delete it under Teachers.
            </>
          )}
        </DialogDescription>
      </DialogHeader>

      {accounts.length > 0 && (
        <ul className="border-primary/14 bg-card max-h-[220px] overflow-y-auto border">
          {accounts.map((account) => (
            <li
              className="border-primary/8 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b px-4 py-2.5 last:border-b-0"
              key={`${account.name}-${account.createdAt}`}
            >
              <span className="text-primary text-[13.5px] font-semibold">
                {account.name}
              </span>
              <span className="text-primary/55 text-[12px]">
                registered {formatDate(account.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <DialogFooter>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="border-primary/30 text-primary hover:bg-primary/5 border px-4 py-2 text-xs font-extrabold tracking-[0.04em] transition-colors"
        >
          {accounts.length === 0 ? "CLOSE" : "CANCEL"}
        </button>
        <button
          type="button"
          disabled={isPending || accounts.length === 0}
          onClick={onConfirm}
          className="bg-destructive hover:bg-destructive-hover px-4 py-2 text-xs font-extrabold tracking-[0.04em] text-white transition-colors disabled:opacity-50"
        >
          {isPending ? "CLEANING…" : "DELETE THESE ACCOUNTS"}
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
