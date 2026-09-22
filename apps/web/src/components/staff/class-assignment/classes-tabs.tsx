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

  if (classes.length === 0) {
    return (
      <Empty className="border-primary/22 min-h-[60vh] border border-dashed">
        <EmptyTitle className="font-heading text-2xl">
          No classes yet
        </EmptyTitle>
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
                Seed Classes
              </TooltipTrigger>
              {isSeeded && (
                <TooltipContent>
                  Already fully seeded — running it again would be ignored
                </TooltipContent>
              )}
            </Tooltip>
            <Button onClick={onCreateClick} size="sm">
              <IconPlus className="mr-2 size-4" />
              Create Class
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
          <IconSearch className="text-muted-foreground absolute top-3 left-3 size-4" />
          <Input
            placeholder="IconSearch by class name or teacher..."
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
          {isSeedPending ? "Seeding..." : "Seed Classes"}
        </Button>
        <Button variant="outline" onClick={onExportClick} size="sm">
          <IconFileExport className="mr-2 size-4" />
          Export
        </Button>
        <Button onClick={onCreateClick} size="sm">
          <IconPlus className="mr-2 size-4" />
          Create Class
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
              <span className="group-data-active:bg-primary group-data-active:text-accent bg-muted text-muted-foreground px-1.5 py-0.5 font-mono text-xs">
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
                  <EmptyTitle className="font-heading text-xl">
                    No classes in this category
                  </EmptyTitle>
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
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
