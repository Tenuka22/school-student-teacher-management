import type { StaffListItem } from "@school-student-teacher-management/api/routers/staff/list-staff";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import { IconCalendarTime, IconId } from "@tabler/icons-react";
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
  const [hasCopied, setHasCopied] = useState(false);

  const credentialsText =
    teacher && loginUsername && initialPassword
      ? `Username: ${loginUsername}\nPassword: ${initialPassword}`
      : null;

  const handleCopyCredentials = async () => {
    if (!credentialsText) {
      return;
    }
    await navigator.clipboard.writeText(credentialsText);
    setHasCopied(true);
    toast.success("Credentials copied — share them with the teacher");
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

        {credentialsText && (
          <div className="bg-muted space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <IconId className="size-4" />
                Username
              </span>
              <code className="font-mono font-semibold">{loginUsername}</code>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Initial password</span>
              <code className="font-mono font-semibold">{initialPassword}</code>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={handleCopyCredentials}
            >
              {hasCopied ? "Copied!" : "Copy Credentials"}
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            className="justify-start"
            onClick={() => teacher && onManageTimetableClick(teacher)}
          >
            <IconCalendarTime className="mr-2 size-4" />
            Set Up Timetable
          </Button>
        </div>
        <div className="flex justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Done for now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
