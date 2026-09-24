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
    return "WORKING…";
  }

  return isUnban ? "UNBAN ACCOUNT" : "BAN ACCOUNT";
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
      <AlertDialogContent className="max-w-[440px] border border-[#013405]/18 bg-[#fffdf6] p-0">
        <AlertDialogHeader className="border-b border-[#013405]/12 px-6 py-5">
          <div className="text-[12px] font-extrabold tracking-[0.24em] text-[#A51919]">
            {isUnban ? "RESTORE ACCESS" : "SUSPEND ACCOUNT"}
          </div>
          <AlertDialogTitle className="font-heading text-[24px] font-semibold text-[#013405]">
            {isUnban ? "Unban this account?" : "Ban this account?"}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[13px] leading-relaxed text-[#013405]/65">
            {isUnban ? (
              <>
                <strong className="text-[#013405]">{target?.name}</strong> (
                {target?.email}) will be able to sign in again immediately.
                {target?.banReason && (
                  <>
                    {" "}
                    The reason on file was:
                    <span className="text-[#013405]">
                      {" "}
                      “{target.banReason}”
                    </span>
                  </>
                )}
              </>
            ) : (
              <>
                <strong className="text-[#013405]">{target?.name}</strong> (
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
              <span className="text-[12px] font-bold tracking-[0.14em] text-[#013405]/70">
                REASON FOR THE BAN
              </span>
              <textarea
                className="min-h-[74px] w-full resize-y border border-[#013405]/22 bg-white px-3 py-2 text-[13px] leading-relaxed text-[#013405] outline-none focus:border-[#013405]"
                id="ban-reason"
                onChange={(event) => setReason(event.target.value)}
                placeholder="e.g. left the College — staff record closed"
                required
                value={reason}
              />
            </label>
            <p className="mt-2 text-[12px] leading-relaxed text-[#013405]/50">
              The reason is stored on the account and shown wherever the ban is
              displayed, so write it for whoever reads it next.
            </p>
          </div>
        )}

        <AlertDialogFooter className="border-t border-[#013405]/12 px-6 py-4">
          <AlertDialogCancel
            className="border border-[#013405]/30 px-4 py-2 text-xs font-extrabold tracking-[0.04em] text-[#013405] hover:bg-[#013405]/5"
            disabled={isPending}
          >
            {isUnban ? "KEEP BANNED" : "CANCEL"}
          </AlertDialogCancel>
          <AlertDialogAction
            className={`px-4 py-2 text-xs font-extrabold tracking-[0.04em] text-[#FFF8E7] disabled:opacity-60 ${
              isUnban
                ? "bg-[#013405] hover:bg-[#064A12]"
                : "bg-[#A51919] hover:bg-[#7F1212]"
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
