"use client";

import type { class_ as classTable } from "@school-student-teacher-management/db/schema/academics";
import type { staff as staffTable } from "@school-student-teacher-management/db/schema/staff";
import { Button } from "@school-student-teacher-management/ui/components/button";
import { Card } from "@school-student-teacher-management/ui/components/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import { Input } from "@school-student-teacher-management/ui/components/input";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@school-student-teacher-management/ui/components/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@school-student-teacher-management/ui/components/tooltip";
import {
  IconFileExport,
  IconPlus,
  IconSearch,
  IconSeedling,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { ClassCard } from "@/components/staff/class-assignment/class-card";
import {
  CLASS_CATEGORIES,
  isFullySeeded,
} from "@/components/staff/class-assignment/class-categories";

type Staff = typeof staffTable.$inferSelect;
type Class = typeof classTable.$inferSelect;

const classesByGrade = (categoryClasses: Class[]) => {
  const grades = new Map<number, Class[]>();
  for (const cls of categoryClasses) {
    const list = grades.get(cls.gradeLevel) ?? [];
    list.push(cls);
    grades.set(cls.gradeLevel, list);
  }
  return [...grades.entries()]
    .toSorted(([a], [b]) => a - b)
    .map(([gradeLevel, gradeClasses]) => ({
      gradeLevel,
      gradeClasses: gradeClasses.toSorted((a, b) =>
        a.name.localeCompare(b.name)
      ),
    }));
};

interface ClassesTabsProps {
  classes: Class[];
  staff: Staff[];
  isLoading?: boolean;
  /**
   * The list read failed — including the year lookup behind it, which the
   * page folds into the same flag. `classes` defaults to `[]` for every
   * reason a request can come back without rows, so without this the failure
   * and an empty year render as the same "No classes yet" screen, with the
   * seed button offered against a year the client cannot even read.
   */
  isError?: boolean;
  /** What to say about that failure; the page formats the server's message. */
  errorMessage?: string;
  /** Re-ask the server rather than re-rendering the cached failure. */
  onRetry?: () => void;
  onCreateClick: () => void;
  onEditClick: (cls: Class) => void;
  onAssignTeacherClick: (cls: Class) => void;
  onDeleteClick: (cls: Class) => void;
  onExportClick: () => void;
  onSeedClick: () => void;
  isSeedPending?: boolean;
}

export const ClassesTabs = ({
  classes,
  staff,
  isLoading = false,
  isError = false,
  errorMessage,
  onRetry,
  onCreateClick,
  onEditClick,
  onAssignTeacherClick,
  onDeleteClick,
  onExportClick,
  onSeedClick,
  isSeedPending = false,
}: ClassesTabsProps) => {
  const [searchTerm, setSearchTerm] = useState("");

  const isSeeded = useMemo(() => isFullySeeded(classes), [classes]);

  const staffMap = useMemo(() => {
    const map = new Map<string, Staff>();
    for (const s of staff) {
      map.set(s.id, s);
    }
    return map;
  }, [staff]);

  const filteredClasses = useMemo(() => {
    if (!searchTerm) {
      return classes;
    }
    const term = searchTerm.toLowerCase();
    return classes.filter((cls) => {
      const name = cls.name?.toLowerCase() || "";
      const teacher =
        (cls.homeroomTeacherId
          ? staffMap.get(cls.homeroomTeacherId)?.name?.toLowerCase()
          : null) || "";
      return name.includes(term) || teacher.includes(term);
    });
  }, [classes, searchTerm, staffMap]);

  const classesByCategory = useMemo(() => {
    const grouped = new Map<string, Class[]>();
    for (const category of CLASS_CATEGORIES) {
      grouped.set(category.key, []);
    }
    for (const cls of filteredClasses) {
      const category = CLASS_CATEGORIES.find((c) =>
        (c.grades as readonly number[]).includes(cls.gradeLevel)
      );
      const key = category?.key ?? CLASS_CATEGORIES.at(-1)?.key ?? "";
      grouped.get(key)?.push(cls);
    }
    return grouped;
  }, [filteredClasses]);

  if (isLoading) {
    return (
      <Card>
        <div className="space-y-3 p-6">
          {Array.from({ length: 5 }).map((_, i) => (
            // biome-ignore lint: static skeleton list, no stable id available
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  // Before the empty state, deliberately: a failed read also hands back no
  // rows, and "No classes yet" would offer to seed a year the client could
  // not confirm exists. Checked after `isLoading` so the retry above shows
  // the skeleton rather than the failure it is already fixing.
  if (isError) {
    return (
      <Card>
        <div className="border-destructive/30 px-[22px] py-4">
          <p className="text-destructive text-sm font-bold">
            The class list could not be loaded
          </p>
          <p className="text-primary/65 mt-1 text-[13px]">
            {errorMessage ?? "The server did not return the class list."}{" "}
            Nothing has been changed.
          </p>
          {onRetry ? (
            <Button
              className="mt-3"
              variant="outline"
              size="sm"
              onClick={onRetry}
            >
              Try again
            </Button>
          ) : null}
        </div>
      </Card>
    );
  }

  if (classes.length === 0) {
    return (
      <Empty className="border-primary/22 min-h-[60vh] border border-dashed">
        <EmptyTitle className="text-lg">No classes yet</EmptyTitle>
        <EmptyDescription>
          Seed the default class structure or create your first class manually
          to get started
        </EmptyDescription>
        <EmptyContent>
          <div className="flex gap-2">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    aria-disabled={isSeeded}
                    className={
                      isSeeded ? "cursor-not-allowed opacity-50" : undefined
                    }
                    onClick={() => {
                      if (!isSeeded) {
                        onSeedClick();
                      }
                    }}
                  />
                }
              >
                <IconSeedling className="mr-2 size-4" />
                Seed default classes
              </TooltipTrigger>
              {isSeeded && (
                <TooltipContent>
                  Already fully seeded — running it again would be ignored
                </TooltipContent>
              )}
            </Tooltip>
            <Button onClick={onCreateClick} size="sm">
              <IconPlus className="mr-2 size-4" />
              Add class
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 basis-64">
          <IconSearch
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            type="search"
            aria-label="Search classes"
            placeholder="Search by class name or teacher"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          variant="outline"
          onClick={onSeedClick}
          size="sm"
          disabled={isSeedPending}
        >
          <IconSeedling className="mr-2 size-4" />
          {isSeedPending ? "Seeding…" : "Seed default classes"}
        </Button>
        <Button variant="outline" onClick={onExportClick} size="sm">
          <IconFileExport className="mr-2 size-4" />
          Export
        </Button>
        <Button onClick={onCreateClick} size="sm">
          <IconPlus className="mr-2 size-4" />
          Add class
        </Button>
      </div>

      <Tabs defaultValue={CLASS_CATEGORIES[0].key}>
        <TabsList
          variant="line"
          className="border-primary/18 h-auto w-full justify-start gap-0.5 rounded-none border-b p-0"
        >
          {CLASS_CATEGORIES.map((category) => (
            <TabsTrigger
              key={category.key}
              value={category.key}
              className="group data-active:border-primary/18 data-active:bg-card -mb-px gap-2 rounded-none border border-b-0 border-transparent px-4 py-2.5 font-semibold after:hidden"
            >
              {category.label}
              <span className="group-data-active:bg-primary group-data-active:text-accent bg-muted text-muted-foreground px-1.5 py-0.5 text-xs font-semibold tabular-nums">
                {classesByCategory.get(category.key)?.length ?? 0}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {CLASS_CATEGORIES.map((category) => {
          const categoryClasses = classesByCategory.get(category.key) ?? [];
          return (
            <TabsContent
              key={category.key}
              value={category.key}
              className="space-y-6 pt-4"
            >
              {categoryClasses.length === 0 ? (
                <Empty className="border-primary/22 min-h-[30vh] border border-dashed">
                  <EmptyTitle>No classes in this category</EmptyTitle>
                  <EmptyDescription>
                    {category.key === "collegiate"
                      ? "A/L class counts vary by year and are always created manually"
                      : "Seed Classes to generate the standard sections for these grades"}
                  </EmptyDescription>
                </Empty>
              ) : (
                classesByGrade(categoryClasses).map(
                  ({ gradeLevel, gradeClasses }) => (
                    <div key={gradeLevel} className="space-y-3">
                      <h3 className="text-muted-foreground text-sm font-semibold">
                        Grade {gradeLevel}
                      </h3>
                      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] gap-3">
                        {gradeClasses.map((cls) => (
                          <ClassCard
                            key={cls.id}
                            cls={cls}
                            teacher={
                              cls.homeroomTeacherId
                                ? staffMap.get(cls.homeroomTeacherId)
                                : undefined
                            }
                            onEditClick={onEditClick}
                            onAssignTeacherClick={onAssignTeacherClick}
                            onDeleteClick={onDeleteClick}
                          />
                        ))}
                      </div>
                    </div>
                  )
                )
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
};
