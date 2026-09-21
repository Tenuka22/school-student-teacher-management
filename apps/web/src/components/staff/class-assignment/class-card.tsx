import type { class_ as classTable } from "@school-student-teacher-management/db/schema/academics";
import type { staff as staffTable } from "@school-student-teacher-management/db/schema/staff";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import { Card } from "@school-student-teacher-management/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@school-student-teacher-management/ui/components/dropdown-menu";
import {
  IconDotsVertical,
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
        hasTeacher
          ? "border-primary/14 border-l-primary gap-3 rounded-none border-l-[3px] p-4"
          : "border-destructive/30 border-l-destructive gap-3 rounded-none border-l-[3px] p-4"
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <button
            type="button"
            className="font-heading text-left text-2xl leading-none font-semibold hover:underline"
            onClick={() => onEditClick(cls)}
          >
            {cls.name}
          </button>
          <p className="text-muted-foreground mt-1.5 text-xs tracking-wide">
            Grade {cls.gradeLevel}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon">
                <IconDotsVertical className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEditClick(cls)}>
              <IconEdit className="mr-2 size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAssignTeacherClick(cls)}>
              <IconUserCog className="mr-2 size-4" />
              Assign Teacher
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDeleteClick(cls)}
              className="text-destructive"
            >
              <IconTrash className="mr-2 size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={MEDIUM_BADGE_VARIANT[cls.medium] ?? "secondary"}>
          {MEDIUM_LABEL[cls.medium] ?? cls.medium}
        </Badge>
        {hasTeacher ? (
          <Badge variant="outline">Active</Badge>
        ) : (
          <Badge variant="destructive">No Teacher</Badge>
        )}
      </div>

      <div className="border-primary/12 flex items-center gap-2.5 border-t pt-3">
        {hasTeacher && teacher ? (
          <>
            <span className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center text-[10.5px] font-bold">
              {getInitials(teacher.name)}
            </span>
            <span className="truncate text-sm font-semibold">
              {teacher.name}
            </span>
          </>
        ) : (
          <>
            <IconUserCircle className="text-destructive size-5 shrink-0" />
            <span className="text-destructive text-sm font-semibold">
              Not assigned
            </span>
          </>
        )}
      </div>

      <Button
        variant={hasTeacher ? "outline" : "default"}
        size="sm"
        className="w-full font-semibold"
        onClick={() => onAssignTeacherClick(cls)}
      >
        {hasTeacher ? "Replace Teacher" : "Assign Teacher"}
      </Button>
    </Card>
  );
};
