import type { StaffListItem } from "@school-student-teacher-management/api/routers/staff/list-staff";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import { IconCalendarTime, IconCopy, IconId } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

type TeacherReference = Pick<StaffListItem, "id" | "name" | "email" | "phone">;

interface NewTeacherNextStepsDialogProps {
  teacher: TeacherReference | null;
  /** Login username (the teacher's NIC) returned by createStaff. */
  loginUsername?: string | null;
  /** One-time initial password shown only right after creation. */
  initialPassword?: string | null;
  onOpenChange: (open: boolean) => void;
  onManageTimetableClick: (teacher: TeacherReference) => void;
}

/** Shown right after a teacher is created: their fresh login credentials —
 * username = NIC — plus the natural next step, setting up their timetable. */
export const NewTeacherNextStepsDialog = ({
  teacher,
  loginUsername,
  initialPassword,
  onOpenChange,
  onManageTimetableClick,
}: NewTeacherNextStepsDialogProps) => {
  /**
   * Whether the credentials are on the clipboard, and it resets when the dialog
   * reopens.
   *
   * It used to be a plain `useState` that was only ever set to `true`, so a
   * second teacher created in the same session opened this dialog already
   * reading "Copied!" — a claim about a clipboard that still held the *first*
   * teacher's password. Keying it off the teacher it belongs to is what makes
   * the label true.
   */
  const [copiedFor, setCopiedFor] = useState<string | null>(null);
  const hasCopied = copiedFor !== null && copiedFor === teacher?.id;

  const credentialsText =
    teacher && loginUsername && initialPassword
      ? `Username: ${loginUsername}\nPassword: ${initialPassword}`
      : null;

  const handleCopyCredentials = async () => {
    if (!credentialsText || !teacher) {
      return;
    }

    /*
     * `navigator.clipboard` is not always there and not always allowed: a
     * non-secure origin, a browser policy, or a permission the reader has
     * refused. Every one of those threw out of an `async` event handler with
     * nothing catching it, so the button silently did nothing and the label
     * stayed "Copy Credentials" — an affordance that reliably fails and never
     * says why. A refused copy is a message, not a shrug.
     */
    try {
      await navigator.clipboard.writeText(credentialsText);
      setCopiedFor(teacher.id);
      toast.success("Credentials copied — share them with the teacher");
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? `Could not copy to the clipboard: ${error.message}. Select the username and password and copy them by hand.`
          : "Could not copy to the clipboard. Select the username and password and copy them by hand."
      );
    }
  };

  return (
    <Dialog open={!!teacher} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{teacher?.name} was created</DialogTitle>
          <DialogDescription>
            A login account was created automatically. Share these credentials
            with the teacher — they sign in with their NIC as the username and
            should change the password after first sign-in.
          </DialogDescription>
        </DialogHeader>

        {credentialsText ? (
          <div className="bg-muted flex flex-col gap-2 border p-3">
            <p className="text-muted-foreground text-xs">
              Shown once, immediately after the account is created. Copy them
              now — they cannot be read back later.
            </p>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <IconId className="size-4" aria-hidden="true" />
                Username
              </span>
              <code className="font-mono font-semibold break-all">
                {loginUsername}
              </code>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Initial password</span>
              <code className="font-mono font-semibold break-all">
                {initialPassword}
              </code>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              onClick={handleCopyCredentials}
            >
              {hasCopied ? (
                "Copied"
              ) : (
                <>
                  <IconCopy data-icon="inline-start" />
                  Copy credentials
                </>
              )}
            </Button>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            className="justify-start"
            onClick={() => teacher && onManageTimetableClick(teacher)}
          >
            <IconCalendarTime data-icon="inline-start" />
            Set up timetable
          </Button>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Done for now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
