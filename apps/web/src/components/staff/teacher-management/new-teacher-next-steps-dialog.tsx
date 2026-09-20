import type { staff } from "@school-student-teacher-management/db/schema/staff";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import { IconBook, IconCalendarTime } from "@tabler/icons-react";

type Staff = typeof staff.$inferSelect;

interface NewTeacherNextStepsDialogProps {
  teacher: Staff | null;
  onOpenChange: (open: boolean) => void;
  onAssignSubjectsClick: (teacher: Staff) => void;
  onManageTimetableClick: (teacher: Staff) => void;
}

/** Shown right after a teacher is created: the two natural next steps —
 * pick their preferred subjects, then set up their timetable — are one
 * click away instead of buried back in the general list. */
export const NewTeacherNextStepsDialog = ({
  teacher,
  onOpenChange,
  onAssignSubjectsClick,
  onManageTimetableClick,
}: NewTeacherNextStepsDialogProps) => (
  <Dialog open={!!teacher} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{teacher?.name} was created</DialogTitle>
        <DialogDescription>
          Next, pick their preferred subjects and set up their timetable. Both
          can be done later from the teacher&apos;s row menu.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          className="justify-start"
          onClick={() => teacher && onAssignSubjectsClick(teacher)}
        >
          <IconBook className="mr-2 size-4" />
          Assign Subjects
        </Button>
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
