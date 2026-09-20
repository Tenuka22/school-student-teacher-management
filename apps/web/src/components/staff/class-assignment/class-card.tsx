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
    <Card className="gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <button
            type="button"
            className="text-left font-semibold hover:underline"
            onClick={() => onEditClick(cls)}
          >
            {cls.name}
          </button>
          <p className="text-muted-foreground text-xs">
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

      <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <IconUserCircle className="size-4 shrink-0" />
        <span className="truncate">{teacher?.name || "Unassigned"}</span>
      </div>
    </Card>
  );
};
