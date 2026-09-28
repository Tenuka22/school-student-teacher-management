"use client";

import { subjectLabel } from "@school-student-teacher-management/db/constants/display";
import { CODE_DEFINED_PERIODS } from "@school-student-teacher-management/db/periods";
import type {
  classPeriodSubject,
  classPeriodTeacher,
} from "@school-student-teacher-management/db/schema/periods";
import type { staff as staffTable } from "@school-student-teacher-management/db/schema/staff";
import { Button } from "@school-student-teacher-management/ui/components/button";
import { Card } from "@school-student-teacher-management/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@school-student-teacher-management/ui/components/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import { IconDotsVertical, IconPlus, IconX } from "@tabler/icons-react";
import { useMemo, useState } from "react";

type Staff = typeof staffTable.$inferSelect;
type PeriodSubject = typeof classPeriodSubject.$inferSelect & {
  teachers: (typeof classPeriodTeacher.$inferSelect)[];
};

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/** Subject colours live in the design tokens (`--subject-1`
 /* --subject-8`). */
const SUBJECT_COLOR_COUNT = 8;

const getSubjectColor = (subjectKey: string) => {
  let hash = 0;
  for (let i = 0; i < subjectKey.length; i += 1) {
    hash = Math.abs(hash * 31 + (subjectKey.codePointAt(i) ?? 0));
  }
  return `var(--subject-${(hash % SUBJECT_COLOR_COUNT) + 1})`;
};

/** Monday-Friday -> 1-5; weekends open on Monday. */
const todayOrMonday = () => {
  const day = new Date().getDay();
  return day >= 1 && day <= 5 ? day : 1;
};

interface TimetableGridProps {
  subjects: PeriodSubject[];
  staff: Map<string, Staff>;
  conflictingTeacherIds: Set<string>;
  onAddSubjectClick: (dayOfWeek: number, periodNumber: number) => void;
  onAddTeacherClick: (subject: PeriodSubject) => void;
  onDeleteSubjectClick: (subject: PeriodSubject) => void;
  onDeleteTeacherClick: (
    teacher: typeof classPeriodTeacher.$inferSelect
  ) => void;
}

const getInitialsCached = (name: string): string =>
  name
    .replace(/^(?<prefix>Mr\.|Mrs\.|Ms\.|Dr\.)\s*/iu, "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const SubjectCard = ({
  subject,
  staff,
  conflictingTeacherIds,
  onAddTeacherClick,
  onDeleteSubjectClick,
  onDeleteTeacherClick,
}: {
  subject: PeriodSubject;
  staff: Map<string, Staff>;
  conflictingTeacherIds: Set<string>;
  onAddTeacherClick: (subject: PeriodSubject) => void;
  onDeleteSubjectClick: (subject: PeriodSubject) => void;
  onDeleteTeacherClick: (
    teacher: typeof classPeriodTeacher.$inferSelect
  ) => void;
}) => {
  const hasConflict = subject.teachers.some((t) =>
    conflictingTeacherIds.has(t.id)
  );

  return (
    <div
      className="bg-card hover:bg-accent/8 focus-visible:ring-ring mb-2 border-l-[3px] p-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
      style={{
        borderLeftColor: hasConflict
          ? "var(--color-destructive)"
          : getSubjectColor(subject.subjectKey),
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">
            {subjectLabel(subject.subjectKey)}
          </div>
          <div className="mt-1.5 space-y-1">
            {subject.teachers.length === 0 ? (
              <div className="text-muted-foreground type-caption italic">
                No teachers assigned
              </div>
            ) : (
              subject.teachers.map((teacher) => {
                const teacherStaff = staff.get(teacher.staffId);
                const isConflict = conflictingTeacherIds.has(teacher.id);
                return (
                  <div key={teacher.id} className="flex items-center gap-1.5">
                    <span
                      className={`${
                        isConflict
                          ? "bg-destructive text-destructive-foreground"
                          : "bg-primary/10 text-primary"
                      } flex size-5 shrink-0 items-center justify-center text-xs font-semibold`}
                    >
                      {getInitialsCached(teacherStaff?.name ?? "?")}
                    </span>
                    <span className="text-muted-foreground type-caption flex-1 truncate">
                      {teacherStaff?.name ?? "Unknown"}
                    </span>
                    {isConflict && (
                      <span className="text-destructive text-xs font-semibold" />
                    )}
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => onDeleteTeacherClick(teacher)}
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={`Remove ${teacherStaff?.name}`}
                    >
                      <IconX className="size-3" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`More actions for ${subjectLabel(subject.subjectKey)}`}
                className="shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100"
              />
            }
          >
            <IconDotsVertical aria-hidden="true" className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs">
            <DropdownMenuItem onClick={() => onAddTeacherClick(subject)}>
              Add teacher
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDeleteSubjectClick(subject)}
              className="text-destructive"
            >
              Remove subject
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export const TimetableGrid = ({
  subjects,
  staff,
  conflictingTeacherIds,
  onAddSubjectClick,
  onAddTeacherClick,
  onDeleteSubjectClick,
  onDeleteTeacherClick,
}: TimetableGridProps) => {
  const [mobileDay, setMobileDay] = useState(todayOrMonday);

  // Group subjects by slot
  const subjectsBySlot = useMemo(() => {
    const map = new Map<string, PeriodSubject[]>();
    for (const subject of subjects) {
      const key = `${subject.dayOfWeek}-${subject.periodNumber}`;
      const group = map.get(key) ?? [];
      group.push(subject);
      map.set(key, group);
    }
    return map;
  }, [subjects]);

  const sortedConfig = useMemo(
    () =>
      CODE_DEFINED_PERIODS.toSorted((a, b) => a.periodNumber - b.periodNumber),
    []
  );

  const subjectKeysPresent = useMemo(
    () => [...new Set(subjects.map((s) => s.subjectKey))].toSorted(),
    [subjects]
  );

  const getSubjectsForSlot = (dayOfWeek: number, periodNumber: number) =>
    subjectsBySlot.get(`${dayOfWeek}-${periodNumber}`) ?? [];

  return (
    <div className="space-y-3">
      {/* Phones and small tablets: one day at a time. */}
      <div className="space-y-3 md:hidden">
        <fieldset className="m-0 grid min-w-0 grid-cols-5 gap-1 border-0 p-0">
          <legend className="sr-only">Day shown</legend>
          {DAYS_OF_WEEK.map((day, index) => (
            <Button
              key={day}
              type="button"
              size="sm"
              variant={mobileDay === index + 1 ? "default" : "outline"}
              aria-pressed={mobileDay === index + 1}
              aria-label={day}
              onClick={() => setMobileDay(index + 1)}
              className="px-0"
            >
              {day.slice(0, 3)}
            </Button>
          ))}
        </fieldset>
        <Card className="gap-0 p-0">
          <h3 className="bg-primary text-accent m-0 px-3 py-2.5 text-xs font-bold tracking-[0.08em] uppercase">
            {DAYS_OF_WEEK[mobileDay - 1]}
          </h3>
          <ul className="m-0 list-none p-0">
            {sortedConfig.map((period) => {
              const slotSubjects = getSubjectsForSlot(
                mobileDay,
                period.periodNumber
              );
              return (
                <li
                  key={period.periodNumber}
                  className="border-border border-b p-2 last:border-b-0"
                >
                  <div className="mb-2">
                    <div className="text-sm font-semibold">
                      {`Period ${period.periodNumber}`}
                    </div>
                    {/*
                      The separator is not decoration. Without it the two times
                      are one token — "07:5008:25" — which is a time nobody can
                      read and a value nobody can check a bell schedule against.
                    */}
                    <div className="text-muted-foreground type-caption">
                      {period.startTime}–{period.endTime}
                    </div>
                  </div>
                  <div className="group space-y-1">
                    {slotSubjects.length === 0 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-primary w-full"
                        aria-label={`Add subject to period ${period.periodNumber}`}
                        onClick={() =>
                          onAddSubjectClick(mobileDay, period.periodNumber)
                        }
                      >
                        <IconPlus aria-hidden="true" className="mr-1 size-3" />
                        Add subject
                      </Button>
                    ) : (
                      <>
                        {slotSubjects.map((subject) => (
                          <SubjectCard
                            key={subject.id}
                            subject={subject}
                            staff={staff}
                            conflictingTeacherIds={conflictingTeacherIds}
                            onAddTeacherClick={onAddTeacherClick}
                            onDeleteSubjectClick={onDeleteSubjectClick}
                            onDeleteTeacherClick={onDeleteTeacherClick}
                          />
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-primary w-full"
                          aria-label={`Add another subject to period ${period.periodNumber}`}
                          onClick={() =>
                            onAddSubjectClick(mobileDay, period.periodNumber)
                          }
                        >
                          <IconPlus
                            aria-hidden="true"
                            className="mr-1 size-3"
                          />
                          Add another
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      {/* md and up: the full week. */}
      <Card className="hidden overflow-x-auto p-0 md:block">
        <Table className="min-w-184">
          <TableHeader>
            <TableRow className="bg-primary hover:bg-primary border-none">
              <TableHead className="text-accent h-11 w-32 text-xs font-bold tracking-[0.08em]">
                Period
              </TableHead>
              {DAYS_OF_WEEK.map((day) => (
                <TableHead
                  key={day}
                  className="text-accent h-11 text-center text-xs font-bold tracking-[0.08em]"
                >
                  {day}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedConfig.map((period) => (
              <TableRow key={period.periodNumber}>
                <TableHead
                  scope="row"
                  className="border-primary/12 text-foreground h-auto border-r tracking-normal normal-case"
                >
                  <div className="text-sm font-semibold">
                    {`Period ${period.periodNumber}`}
                  </div>
                  <div className="text-muted-foreground type-caption font-normal">
                    {period.startTime}–{period.endTime}
                  </div>
                </TableHead>
                {DAYS_OF_WEEK.map((day, dayIndex: number) => {
                  const slotSubjects = getSubjectsForSlot(
                    dayIndex + 1,
                    period.periodNumber
                  );
                  return (
                    <TableCell
                      key={day}
                      className="relative min-h-16.5 p-1 text-center"
                    >
                      <div className="group">
                        {slotSubjects.length === 0 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-primary w-full"
                            aria-label={`Add subject to ${day}, period ${period.periodNumber}`}
                            onClick={() =>
                              onAddSubjectClick(
                                dayIndex + 1,
                                period.periodNumber
                              )
                            }
                          >
                            <IconPlus
                              aria-hidden="true"
                              className="mr-1 size-3"
                            />
                            Add
                          </Button>
                        ) : (
                          <div className="space-y-1 text-left">
                            {slotSubjects.map((subject) => (
                              <SubjectCard
                                key={subject.id}
                                subject={subject}
                                staff={staff}
                                conflictingTeacherIds={conflictingTeacherIds}
                                onAddTeacherClick={onAddTeacherClick}
                                onDeleteSubjectClick={onDeleteSubjectClick}
                                onDeleteTeacherClick={onDeleteTeacherClick}
                              />
                            ))}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground hover:text-primary w-full"
                              aria-label={`Add subject to ${day}, period ${period.periodNumber}`}
                              onClick={() =>
                                onAddSubjectClick(
                                  dayIndex + 1,
                                  period.periodNumber
                                )
                              }
                            >
                              <IconPlus
                                aria-hidden="true"
                                className="mr-1 size-3"
                              />
                              Add
                            </Button>
                          </div>
                        )}
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {subjectKeysPresent.length > 0 && (
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {/*
            "Subjects", not "Subject key". A storage key is not a heading: the
            legend exists so a colour can be read back to a subject, and the
            reader is looking for a subject's name, which is what the swatch
            beside it is coloured by.
          */}
          <span className="type-eyebrow">Subjects</span>
          {subjectKeysPresent.map((subjectKey) => (
            <span key={subjectKey} className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-3"
                style={{ background: getSubjectColor(subjectKey) }}
              />
              {subjectLabel(subjectKey)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
