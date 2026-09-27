import type { class_ as classTable } from "@school-student-teacher-management/db/schema/academics";
import type { staff as staffTable } from "@school-student-teacher-management/db/schema/staff";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@school-student-teacher-management/ui/components/card";
import {
  IconAlertTriangle,
  IconEdit,
  IconTrash,
  IconUserCog,
  IconUserOff,
} from "@tabler/icons-react";

type Staff = typeof staffTable.$inferSelect;
type Class = typeof classTable.$inferSelect;

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

/**
 * How the homeroom block reads, which is three states and not two.
 *
 * `homeroomTeacherId` being set and the teacher *not resolving* out of the
 * staff list are different facts, and the card used to draw both as "Not
 * assigned". A class whose teacher left the College mid-year, or whose teacher
 * simply is not on the loaded page, was therefore reported as having nobody
 * in charge — a destructive-sounding claim about a class that is in fact
 * assigned, and one that invites a well-meaning overwrite. The three states are
 * named separately, and only the genuinely empty one is styled as work to do.
 */
type HomeroomState =
  | { kind: "assigned"; name: string; initials: string }
  | { kind: "unresolved" }
  | { kind: "unassigned" };

const resolveHomeroom = (
  cls: Class,
  teacher: Staff | undefined
): HomeroomState => {
  if (!cls.homeroomTeacherId) {
    return { kind: "unassigned" };
  }
  if (!teacher) {
    return { kind: "unresolved" };
  }
  return {
    kind: "assigned",
    name: teacher.name,
    initials: getInitials(teacher.name),
  };
};

const HomeroomBlock = ({ state }: { state: HomeroomState }) => {
  if (state.kind === "unassigned") {
    return (
      <p className="text-warning-ink flex items-center gap-1.5 text-sm font-semibold">
        <IconUserOff aria-hidden="true" className="size-4 shrink-0" />
        No homeroom teacher
      </p>
    );
  }

  if (state.kind === "unresolved") {
    return (
      <p className="text-warning-ink flex items-center gap-1.5 text-sm font-semibold">
        <IconAlertTriangle aria-hidden="true" className="size-4 shrink-0" />
        Assigned, but not on this year&rsquo;s staff list
      </p>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="bg-primary/10 text-primary flex size-7 flex-none items-center justify-center rounded-full text-[10px] font-bold"
      >
        {state.initials}
      </span>
      <span className="truncate text-sm font-semibold">{state.name}</span>
    </div>
  );
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
  const homeroom = resolveHomeroom(cls, teacher);
  const needsTeacher = homeroom.kind !== "assigned";
  const mediumLabel = MEDIUM_LABEL[cls.medium] ?? cls.medium;

  return (
    <Card className="gap-0">
      <CardHeader>
        <CardTitle>
          {/* h3 sits under the grade heading (h2) under the page h1. */}
          <h3 className="font-heading text-xl leading-tight font-semibold">
            {cls.name}
          </h3>
        </CardTitle>
        <p className="text-muted-foreground text-xs">Grade {cls.gradeLevel}</p>
        <CardAction>
          <Badge variant="secondary">{mediumLabel}</Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-2 py-3">
        <p className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
          Homeroom teacher
        </p>
        <HomeroomBlock state={homeroom} />
        {/*
          A class with nobody in charge is the one state on this card that is
          somebody's job, so it carries a badge and not just a coloured word.
          `warning` is the app's own amber chip: `--warning-ink` on
          `bg-accent/20`, which is the only pairing of those two that clears AA,
          and the words say the state rather than the colour carrying it.
        */}
        {needsTeacher && (
          <Badge variant="warning" className="gap-1">
            <IconUserOff aria-hidden="true" />
            {homeroom.kind === "unassigned" ? "Action needed" : "Check roster"}
          </Badge>
        )}
      </CardContent>

      <CardFooter className="gap-2">
        <Button
          variant={needsTeacher ? "default" : "outline"}
          className="min-w-0 flex-1"
          onClick={() => onAssignTeacherClick(cls)}
          aria-label={
            homeroom.kind === "unassigned"
              ? `Assign a homeroom teacher to class ${cls.name}`
              : `Reassign the homeroom teacher for class ${cls.name}`
          }
        >
          <IconUserCog aria-hidden="true" className="mr-2 size-4" />
          {homeroom.kind === "unassigned" ? "Assign teacher" : "Reassign"}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => onEditClick(cls)}
          aria-label={`Edit class ${cls.name}`}
        >
          <IconEdit aria-hidden="true" className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => onDeleteClick(cls)}
          aria-label={`Delete class ${cls.name}`}
        >
          <IconTrash aria-hidden="true" className="size-4" />
        </Button>
      </CardFooter>
    </Card>
  );
};
