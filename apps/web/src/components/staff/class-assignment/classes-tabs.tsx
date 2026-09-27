"use client";

import type { class_ as classTable } from "@school-student-teacher-management/db/schema/academics";
import type { staff as staffTable } from "@school-student-teacher-management/db/schema/staff";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import {
  Field,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@school-student-teacher-management/ui/components/input-group";
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
  IconX,
} from "@tabler/icons-react";
import { useId, useMemo, useState } from "react";

import { QueryErrorPanel } from "@/components/query-error-panel";
import { ClassCard } from "@/components/staff/class-assignment/class-card";
import {
  CATEGORY_EMPTY_COPY,
  CLASS_CATEGORIES,
  DEFAULT_CATEGORY_KEY,
  PLANNED_SEED_TOTAL,
  isFullySeeded,
} from "@/components/staff/class-assignment/class-categories";

type Staff = typeof staffTable.$inferSelect;
type Class = typeof classTable.$inferSelect;

interface GradeGroup {
  gradeLevel: number;
  gradeClasses: Class[];
  /** How many of them have a homeroom teacher on record. */
  assignedCount: number;
}

const classesByGrade = (categoryClasses: Class[]): GradeGroup[] => {
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
      assignedCount: gradeClasses.filter((cls) => cls.homeroomTeacherId).length,
    }));
};

/**
 * The one line that says whether a grade is finished.
 *
 * A grade is only finished when every class in it has somebody accountable,
 * and that is exactly the question the heading used to leave open: it said
 * "Grade 7" and the answer was scattered across six cards, with the unassigned
 * ones no different at a glance from the assigned ones.
 */
const gradeSummary = (group: GradeGroup) => {
  const total = group.gradeClasses.length;
  if (group.assignedCount === total) {
    return {
      text: `All ${total} ${total === 1 ? "class has" : "classes have"} a homeroom teacher`,
      complete: true,
    };
  }
  if (group.assignedCount === 0) {
    return {
      text: `No homeroom teacher on any of the ${total} classes`,
      complete: false,
    };
  }
  return {
    text: `${group.assignedCount} of ${total} classes have a homeroom teacher`,
    complete: false,
  };
};

interface SeedButtonProps {
  isSeeded: boolean;
  isPending: boolean;
  onClick: () => void;
}

/**
 * `aria-disabled` rather than `disabled`, because a disabled button is not
 * focusable and a tooltip on one can never be reached — so the reason the
 * action is unavailable would be announced to nobody.
 */
const SeedButton = ({ isSeeded, isPending, onClick }: SeedButtonProps) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button
          variant="outline"
          size="sm"
          aria-disabled={isSeeded || isPending}
          className={
            isSeeded || isPending ? "cursor-not-allowed opacity-50" : undefined
          }
          onClick={() => {
            if (!isSeeded && !isPending) {
              onClick();
            }
          }}
        />
      }
    >
      <IconSeedling aria-hidden="true" className="mr-2 size-4" />
      {isPending ? "Seeding…" : "Seed Classes"}
    </TooltipTrigger>
    {isSeeded && (
      <TooltipContent>
        All {PLANNED_SEED_TOTAL} Primary and Secondary sections already exist —
        seeding would create nothing
      </TooltipContent>
    )}
  </Tooltip>
);

/**
 * The loading state has to look like the page it stands in for.
 *
 * Five grey bars in a bordered box is not a skeleton of this screen, it is a
 * skeleton of some other screen: it reserves a tenth of the height, so every
 * grade heading and every card grid arrives as a jump, and someone who starts
 * typing into a search box that does not exist yet cannot tell whether the page
 * is broken or still on its way. These blocks are the real layout — grade bars
 * and a four-across card grid — at close to the real aspect ratios.
 */
const ClassesSkeleton = () => (
  <div aria-busy="true" aria-live="polite" className="space-y-6">
    <span className="sr-only">Loading classes…</span>
    {[0, 1].map((grade) => (
      <div key={grade} className="space-y-3">
        <Skeleton className="h-6 w-28" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((card) => (
            // biome-ignore lint: static skeleton grid, no stable id available
            <Skeleton key={card} className="h-[9.5rem] w-full" />
          ))}
        </div>
      </div>
    ))}
  </div>
);

interface ClassSearchFieldProps {
  value: string;
  onChange: (value: string) => void;
}

const ClassSearchField = ({ value, onChange }: ClassSearchFieldProps) => {
  const inputId = useId();
  return (
    <Field className="min-w-56 flex-1">
      <FieldLabel htmlFor={inputId} className="text-xs font-semibold">
        Find a class
      </FieldLabel>
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <IconSearch aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          id={inputId}
          type="search"
          autoComplete="off"
          placeholder="Class name or homeroom teacher"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {value.length > 0 && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              onClick={() => onChange("")}
              aria-label="Clear the class search"
            >
              <IconX aria-hidden="true" />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>
    </Field>
  );
};

interface GradeSectionProps {
  group: GradeGroup;
  staffMap: Map<string, Staff>;
  onEditClick: (cls: Class) => void;
  onAssignTeacherClick: (cls: Class) => void;
  onDeleteClick: (cls: Class) => void;
}

const GradeSection = ({
  group,
  staffMap,
  onEditClick,
  onAssignTeacherClick,
  onDeleteClick,
}: GradeSectionProps) => {
  const summary = gradeSummary(group);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b pb-2">
        {/* h2 sits directly under the page h1 — no skipped level. */}
        <h2 className="font-heading text-lg font-semibold">
          Grade {group.gradeLevel}
        </h2>
        <p
          className={
            summary.complete
              ? "text-muted-foreground text-xs"
              : "text-warning-ink text-xs font-semibold"
          }
        >
          {summary.text}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {group.gradeClasses.map((cls) => (
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
    </section>
  );
};

interface CategoryEmptyProps {
  label: string;
  term: string;
  isSearching: boolean;
  copy: { title: string; description: string; canSeed: boolean };
  isSeeded: boolean;
  isSeedPending: boolean;
  onSeedClick: () => void;
  onClearSearch: () => void;
}

/**
 * Two empty states that are not the same sentence.
 *
 * "No classes in this category" was printed whether the band was empty because
 * nobody had built it yet or because the search matched nothing in it, and the
 * second of those is a statement about the search, not about the College. Each
 * one names itself and offers the thing that changes it.
 */
const CategoryEmpty = ({
  label,
  term,
  isSearching,
  copy,
  isSeeded,
  isSeedPending,
  onSeedClick,
  onClearSearch,
}: CategoryEmptyProps) => (
  <Empty className="border-primary/22 min-h-[30vh] border border-dashed">
    <EmptyHeader>
      <EmptyTitle className="font-heading text-xl">
        {isSearching ? `Nothing in ${label} matches this search` : copy.title}
      </EmptyTitle>
      <EmptyDescription>
        {isSearching
          ? `“${term}” does not match any ${label.toLowerCase()} class name or homeroom teacher. The other stages may still have matches.`
          : copy.description}
      </EmptyDescription>
    </EmptyHeader>
    <EmptyContent>
      {isSearching ? (
        <Button variant="outline" size="sm" onClick={onClearSearch}>
          <IconX aria-hidden="true" className="mr-2 size-4" />
          Clear search
        </Button>
      ) : (
        copy.canSeed && (
          <SeedButton
            isSeeded={isSeeded}
            isPending={isSeedPending}
            onClick={onSeedClick}
          />
        )
      )}
    </EmptyContent>
  </Empty>
);

interface ClassesTabsProps {
  classes: Class[];
  staff: Staff[];
  isLoading?: boolean;
  /** The class-list request failed. Kept separate from `isLoading` on purpose. */
  isError: boolean;
  /** The server's own words about the failure. */
  errorMessage: string;
  /** Must genuinely re-request the class list. */
  onRetry: () => void;
  onCreateClick: () => void;
  onEditClick: (cls: Class) => void;
  onAssignTeacherClick: (cls: Class) => void;
  onDeleteClick: (cls: Class) => void;
  onExportClick: () => void;
  onSeedClick: () => void;
  isSeedPending?: boolean;
  /**
   * The workbook is built server-side and can take a couple of seconds, during
   * which the button used to look identical to an idle one. Optional so the
   * call site keeps working; the route that mounts this screen should pass
   * `useClassesPage().isExportPending`.
   */
  isExportPending?: boolean;
}

export const ClassesTabs = ({
  classes,
  staff,
  isLoading = false,
  isError,
  errorMessage,
  onRetry,
  onCreateClick,
  onEditClick,
  onAssignTeacherClick,
  onDeleteClick,
  onExportClick,
  onSeedClick,
  isSeedPending = false,
  isExportPending = false,
}: ClassesTabsProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const term = searchTerm.trim();
  const isSearching = term.length > 0;

  const isSeeded = useMemo(() => isFullySeeded(classes), [classes]);

  const staffMap = useMemo(() => {
    const map = new Map<string, Staff>();
    for (const s of staff) {
      map.set(s.id, s);
    }
    return map;
  }, [staff]);

  const filteredClasses = useMemo(() => {
    if (!isSearching) {
      return classes;
    }
    const needle = term.toLowerCase();
    return classes.filter((cls) => {
      const name = cls.name?.toLowerCase() || "";
      const teacher =
        (cls.homeroomTeacherId
          ? staffMap.get(cls.homeroomTeacherId)?.name?.toLowerCase()
          : null) || "";
      return name.includes(needle) || teacher.includes(needle);
    });
  }, [classes, isSearching, staffMap, term]);

  const classesByCategory = useMemo(() => {
    const grouped = new Map<string, Class[]>();
    for (const category of CLASS_CATEGORIES) {
      grouped.set(category.key, []);
    }
    for (const cls of filteredClasses) {
      const category = CLASS_CATEGORIES.find((c) =>
        (c.grades as readonly number[]).includes(cls.gradeLevel)
      );
      grouped.get(category?.key ?? DEFAULT_CATEGORY_KEY)?.push(cls);
    }
    return grouped;
  }, [filteredClasses]);

  /**
   * A failed read is not an empty year.
   *
   * `classes` is `[]` for every reason a request can come back without rows — a
   * 500, a dropped connection, a refused permission — so testing
   * `classes.length === 0` alone prints "No classes yet — seed the default
   * class structure" on a failure. That sentence asserts a fact about the
   * College, and a failed request knows nothing. The error is therefore checked
   * first, and the empty state is reachable only on a request that succeeded.
   */
  if (isError) {
    return (
      <QueryErrorPanel
        message={errorMessage}
        onRetry={onRetry}
        title="The class list could not be loaded"
      />
    );
  }

  const toolbar = (
    <div className="flex flex-wrap items-start gap-2">
      <ClassSearchField value={searchTerm} onChange={setSearchTerm} />
      <SeedButton
        isSeeded={isSeeded}
        isPending={isSeedPending}
        onClick={onSeedClick}
      />
      <Button
        variant="outline"
        onClick={onExportClick}
        size="sm"
        aria-disabled={isExportPending}
        className={
          isExportPending ? "cursor-not-allowed opacity-50" : undefined
        }
      >
        <IconFileExport aria-hidden="true" className="mr-2 size-4" />
        {isExportPending ? "Preparing…" : "Export"}
      </Button>
      <Button onClick={onCreateClick} size="sm">
        <IconPlus aria-hidden="true" className="mr-2 size-4" />
        Create Class
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {toolbar}
        <ClassesSkeleton />
      </div>
    );
  }

  if (classes.length === 0) {
    return (
      <Empty className="border-primary/22 min-h-[60vh] border border-dashed">
        <EmptyHeader>
          <EmptyTitle className="font-heading text-2xl">
            No classes yet
          </EmptyTitle>
          <EmptyDescription>
            Nothing has been created for this academic year. Seed the default
            structure for Primary and Secondary, or create a class by hand — A/L
            classes are never seeded, because stream sizes change each year.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex gap-2">
            <SeedButton
              isSeeded={isSeeded}
              isPending={isSeedPending}
              onClick={onSeedClick}
            />
            <Button onClick={onCreateClick} size="sm">
              <IconPlus aria-hidden="true" className="mr-2 size-4" />
              Create Class
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      {toolbar}

      {/*
        Announced, and visible. Filtering runs on every keystroke, so the count
        is the only thing standing between "the page is broken" and "the page is
        filtering" for anyone who typed something the school does not have.
      */}
      <p aria-live="polite" className="text-muted-foreground text-xs">
        {isSearching
          ? `${filteredClasses.length} of ${classes.length} ${classes.length === 1 ? "class" : "classes"} match “${term}”`
          : `${classes.length} ${classes.length === 1 ? "class" : "classes"} this year`}
      </p>

      <Tabs defaultValue={DEFAULT_CATEGORY_KEY}>
        {/*
          `activateOnFocus` makes an arrow key move *and* select, the WAI-ARIA
          default for tabs: the panels here are a card grid, cheap enough that
          deferring the switch until Enter would only add a step.
        */}
        <TabsList
          variant="line"
          aria-label="Class stage"
          activateOnFocus
          className="border-primary/18 h-auto w-full justify-start gap-0.5 rounded-none border-b p-0"
        >
          {CLASS_CATEGORIES.map((category) => (
            <TabsTrigger
              key={category.key}
              value={category.key}
              className="group data-active:border-primary/18 data-active:bg-card -mb-px gap-2 rounded-none border border-b-0 border-transparent px-4 py-2.5 font-semibold after:hidden"
            >
              {category.label}
              <span className="group-data-active:bg-primary group-data-active:text-accent bg-muted text-muted-foreground px-1.5 py-0.5 text-xs tabular-nums">
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
              // The panel repeats what its tab already says; the sentence that
              // matters is the empty state or the grade list inside it.
              aria-label={`${category.label} classes`}
            >
              {categoryClasses.length === 0 ? (
                <CategoryEmpty
                  label={category.label}
                  term={term}
                  isSearching={isSearching}
                  copy={CATEGORY_EMPTY_COPY[category.key]}
                  isSeeded={isSeeded}
                  isSeedPending={isSeedPending}
                  onSeedClick={onSeedClick}
                  onClearSearch={() => setSearchTerm("")}
                />
              ) : (
                classesByGrade(categoryClasses).map((group) => (
                  <GradeSection
                    key={group.gradeLevel}
                    group={group}
                    staffMap={staffMap}
                    onEditClick={onEditClick}
                    onAssignTeacherClick={onAssignTeacherClick}
                    onDeleteClick={onDeleteClick}
                  />
                ))
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
};
