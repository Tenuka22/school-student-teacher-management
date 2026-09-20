import type { staff } from "@school-student-teacher-management/db/schema/staff";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import { IconCalendarTime } from "@tabler/icons-react";

type Staff = typeof staff.$inferSelect;

interface NewTeacherNextStepsDialogProps {
  teacher: Staff | null;
  onOpenChange: (open: boolean) => void;
  onManageTimetableClick: (teacher: Staff) => void;
}

/** Shown right after a teacher is created: the natural next step — setting
 * up their timetable, where subjects are assigned per period directly — is
 * one click away instead of buried back in the general list. */
export const NewTeacherNextStepsDialog = ({
  teacher,
  onOpenChange,
  onManageTimetableClick,
}: NewTeacherNextStepsDialogProps) => (
  <Dialog open={!!teacher} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{teacher?.name} was created</DialogTitle>
        <DialogDescription>
          Next, set up their timetable. This can be done later from the
          teacher&apos;s row menu.
        </DialogDescription>
      </DialogHeader>
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
