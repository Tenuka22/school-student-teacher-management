import type { class_ as classTable } from "@school-student-teacher-management/db/schema/academics";
import type { staff as staffTable } from "@school-student-teacher-management/db/schema/staff";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import { Card } from "@school-student-teacher-management/ui/components/card";
import {
  IconEdit,
  IconTrash,
  IconUserCog,
  IconUserCircle,
} from "@tabler/icons-react";

type Staff = typeof staffTable.$inferSelect;
type Class = typeof classTable.$inferSelect;

const MEDIUM_BADGE_VARIANT: Record<string, "default" | "secondary"> = {
  english: "default",
  sinhala: "secondary",
  tamil: "secondary",
};

const MEDIUM_LABEL: Record<string, string> = {
  english: "English",
  sinhala: "Sinhala",
  tamil: "Tamil",
};

const getInitials = (name: string) =>
  name
    .replace(/^(?<prefix>Mr\.|Mrs\.|Ms\.|Dr\.)\s*/iu, "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

interface ClassCardProps {
  cls: Class;
  teacher?: Staff;
  onEditClick: (cls: Class) => void;
  onAssignTeacherClick: (cls: Class) => void;
  onDeleteClick: (cls: Class) => void;
}

export const ClassCard = ({
  cls,
  teacher,
  onEditClick,
  onAssignTeacherClick,
  onDeleteClick,
}: ClassCardProps) => {
  const hasTeacher = !!cls.homeroomTeacherId;

  return (
    <Card
      className={
        // A 2px edge, not a 4px one: the state is already stated in words below
        // ("Not assigned"), and the bar only has to reinforce it.
        hasTeacher
          ? "border-l-primary gap-3.5 border-l-2 p-5"
          : "border-l-muted-foreground/30 gap-3.5 border-l-2 p-5"
      }
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          className="min-w-0 text-left"
          onClick={() => onEditClick(cls)}
        >
          <div className="font-heading text-2xl leading-none font-semibold hover:underline">
            {cls.name}
          </div>
          <p className="text-muted-foreground mt-1.5 text-xs tracking-wide uppercase">
            Grade {cls.gradeLevel}
          </p>
        </button>
        <Badge
          variant={MEDIUM_BADGE_VARIANT[cls.medium] ?? "secondary"}
          className="flex-none"
        >
          {MEDIUM_LABEL[cls.medium] ?? cls.medium}
        </Badge>
      </div>

      <div className="flex flex-col gap-1.5 border-t pt-3">
        <span className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
          Homeroom Teacher
        </span>
        {hasTeacher && teacher ? (
          <div className="flex items-center gap-2">
            <span className="bg-primary/10 text-primary flex size-7 flex-none items-center justify-center rounded-full text-[10px] font-bold">
              {getInitials(teacher.name)}
            </span>
            <span className="truncate text-sm font-semibold">
              {teacher.name}
            </span>
          </div>
        ) : (
          <div className="text-destructive flex items-center gap-1.5 text-sm font-semibold">
            <IconUserCircle className="size-4 shrink-0" />
            Not assigned
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          className="flex-1 text-xs font-bold tracking-wide uppercase"
          onClick={() => onAssignTeacherClick(cls)}
        >
          <IconUserCog className="mr-2 size-4" />
          {hasTeacher ? "Reassign" : "Assign teacher"}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => onEditClick(cls)}
          aria-label={`Edit ${cls.name}`}
        >
          <IconEdit className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => onDeleteClick(cls)}
          aria-label={`Delete ${cls.name}`}
        >
          <IconTrash className="size-4" />
        </Button>
      </div>
    </Card>
  );
};
