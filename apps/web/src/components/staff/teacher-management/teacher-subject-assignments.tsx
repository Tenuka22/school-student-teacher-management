"use client";

import { subjectLabel as subjectWord } from "@school-student-teacher-management/db/constants/display";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@school-student-teacher-management/ui/components/card";
import { Checkbox } from "@school-student-teacher-management/ui/components/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@school-student-teacher-management/ui/components/field";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import { IconBook } from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { QueryErrorPanel } from "@/components/query-error-panel";
import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

interface CatalogSubject {
  subjectKey: string;
  gradeLevel: number;
}

interface AssignedSubject {
  subjectKey: string;
}

interface TeacherSubjectAssignmentsEditorProps {
  staffId: string;
  academicYearId: string;
  catalogSubjects: CatalogSubject[];
  assignedSubjectKeys: Set<string>;
  onSaved: () => Promise<void>;
}

interface TeacherSubjectAssignmentsProps {
  staffId: string;
  academicYearId?: string;
  editable?: boolean;
  /**
   * The heading level for this section's title — see the same prop on
   * `TeacherQualifications`. `CardTitle` is a `div`; this card is rendered both
   * on the teacher portal's page (under an `h1`) and inside the profile dialog
   * (under an `h2`), so the level is the caller's decision.
   */
  headingLevel?: 2 | 3;
}

/** A catalog entry as words: the subject's name, and the grade it belongs to. */
const subjectLabel = (subject: CatalogSubject): string => {
  if (subject.gradeLevel === 0) {
    return subjectWord(subject.subjectKey);
  }

  return `${subjectWord(subject.subjectKey)} · Grade ${subject.gradeLevel}`;
};

const SectionTitle = ({
  headingLevel,
  children,
}: {
  headingLevel: 2 | 3;
  children: ReactNode;
}) => {
  const className = "font-heading text-sm font-medium";
  if (headingLevel === 2) {
    return <h2 className={className}>{children}</h2>;
  }
  return <h3 className={className}>{children}</h3>;
};

/**
 * How many of the catalog the reader has ticked, said out loud.
 *
 * A twenty-four-checkbox grid gives no sense of scale: ticking four subjects and
 * ticking twenty-four look identical until the button is pressed. The count
 * lives inside the fieldset, next to the instruction it belongs to, and `output`
 * is the element that means a live region, so the semantics do not depend on a
 * role attribute somebody can delete.
 */
const SelectionCount = ({
  selected,
  total,
}: {
  selected: number;
  total: number;
}) => (
  <output className="text-muted-foreground block text-xs">
    {selected} of {total} subject{total === 1 ? "" : "s"} selected
  </output>
);

const TeacherSubjectAssignmentsEditor = ({
  staffId,
  academicYearId,
  catalogSubjects,
  assignedSubjectKeys,
  onSaved,
}: TeacherSubjectAssignmentsEditorProps) => {
  const [selectedSubjectKeys, setSelectedSubjectKeys] = useState<Set<string>>(
    () => new Set(assignedSubjectKeys)
  );
  /**
   * The save's own error, inside the form.
   *
   * `replaceTeacherSubjects` writes the whole set in one statement, so a
   * refusal — a period is already assigned to this teacher for this year, most
   * likely — means the previous selection is still in force. Saying so beside
   * the ticks is the difference between "your save failed, try again" and "the
   * save failed and here is what is still true".
   */
  const [saveError, setSaveError] = useState<string | null>(null);
  const replaceMutation = useMutation(
    orpc.staff.replaceTeacherSubjects.mutationOptions({
      onSuccess: async () => {
        setSaveError(null);
        toast.success("Teacher subjects updated");
        await onSaved();
      },
      onError: (error) => {
        setSaveError(
          formatApiErrorMessage(error, "Failed to save this teacher's subjects")
        );
      },
    })
  );

  const hasChanges = useMemo(() => {
    if (selectedSubjectKeys.size !== assignedSubjectKeys.size) {
      return true;
    }
    for (const subjectKey of selectedSubjectKeys) {
      if (!assignedSubjectKeys.has(subjectKey)) {
        return true;
      }
    }
    return false;
  }, [assignedSubjectKeys, selectedSubjectKeys]);

  const handleSubjectChange = (subjectKey: string, checked: boolean) => {
    setSaveError(null);
    setSelectedSubjectKeys((current) =>
      checked
        ? new Set([...current, subjectKey])
        : new Set([...current].filter((key) => key !== subjectKey))
    );
  };

  const content: ReactNode =
    catalogSubjects.length > 0 ? (
      <FieldSet>
        <FieldLegend>Subjects</FieldLegend>
        <FieldDescription>
          Select every subject this teacher may be assigned to teach. Subjects
          only become assignable to periods once they are ticked here.
        </FieldDescription>
        <SelectionCount
          selected={selectedSubjectKeys.size}
          total={catalogSubjects.length}
        />
        <FieldGroup className="grid gap-2 md:grid-cols-2">
          {catalogSubjects.map((subject) => (
            <Field
              key={subject.subjectKey}
              orientation="horizontal"
              data-disabled={replaceMutation.isPending || undefined}
            >
              <Checkbox
                id={`teacher-subject-${subject.subjectKey}`}
                checked={selectedSubjectKeys.has(subject.subjectKey)}
                onCheckedChange={(checked) =>
                  handleSubjectChange(subject.subjectKey, checked === true)
                }
                disabled={replaceMutation.isPending}
              />
              <FieldLabel
                htmlFor={`teacher-subject-${subject.subjectKey}`}
                className="font-normal"
              >
                {subjectLabel(subject)}
              </FieldLabel>
            </Field>
          ))}
        </FieldGroup>
      </FieldSet>
    ) : (
      <Empty className="min-h-32 border-none">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconBook aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No subjects available</EmptyTitle>
          <EmptyDescription>
            The subject catalog is empty for this school, so there is nothing to
            tick. Subjects are configured once for the College, not per teacher.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  return (
    <>
      <CardContent aria-busy={replaceMutation.isPending}>{content}</CardContent>
      <CardFooter className="justify-between gap-3">
        {saveError ? (
          <p
            role="alert"
            className="border-destructive/30 bg-destructive/5 text-destructive min-w-0 flex-1 border px-3 py-2 text-xs"
          >
            {saveError} The subjects ticked below are unchanged.
          </p>
        ) : (
          <p className="text-muted-foreground min-w-0 flex-1 text-xs">
            {hasChanges ? "Unsaved changes." : "Saved. Nothing to change."}
          </p>
        )}
        <Button
          type="button"
          disabled={!hasChanges || replaceMutation.isPending}
          onClick={() => {
            setSaveError(null);
            replaceMutation.mutate({
              academicYearId,
              staffId,
              subjectKeys: [...selectedSubjectKeys],
            });
          }}
          className="min-w-32"
        >
          {replaceMutation.isPending ? "Saving…" : "Save subjects"}
        </Button>
      </CardFooter>
    </>
  );
};

export const TeacherSubjectAssignments = ({
  staffId,
  academicYearId,
  editable = true,
  headingLevel = 2,
}: TeacherSubjectAssignmentsProps) => {
  const subjectCatalogQuery = useQuery({
    ...orpc.staff.listSubjects.queryOptions({
      input: { academicYearId: academicYearId ?? "" },
    }),
    enabled: Boolean(academicYearId),
  });
  const assignedQueryOptions = orpc.staff.listTeacherSubjects.queryOptions({
    input: {
      academicYearId: academicYearId ?? "",
      staffId,
    },
  });
  const assignedQuery = useQuery({
    ...assignedQueryOptions,
    enabled: Boolean(academicYearId && staffId),
  });
  const assignedSubjects = useMemo(
    () => (assignedQuery.data ?? []) as AssignedSubject[],
    [assignedQuery.data]
  );
  const assignedSubjectKeys = useMemo(
    () => new Set(assignedSubjects.map((subject) => subject.subjectKey)),
    [assignedSubjects]
  );
  const catalogSubjects = useMemo(() => {
    const subjects = new Map<string, CatalogSubject>();
    for (const subject of (subjectCatalogQuery.data ??
      []) as CatalogSubject[]) {
      if (!subjects.has(subject.subjectKey)) {
        subjects.set(subject.subjectKey, subject);
      }
    }
    for (const subjectKey of assignedSubjectKeys) {
      if (!subjects.has(subjectKey)) {
        subjects.set(subjectKey, { subjectKey, gradeLevel: 0 });
      }
    }
    return [...subjects.values()].toSorted((a, b) =>
      a.subjectKey.localeCompare(b.subjectKey)
    );
  }, [assignedSubjectKeys, subjectCatalogQuery.data]);

  if (!academicYearId) {
    return null;
  }

  const isLoading = assignedQuery.isLoading || subjectCatalogQuery.isLoading;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <SectionTitle headingLevel={headingLevel}>
            Teaching subjects
          </SectionTitle>
          <CardDescription>Loading subject assignments…</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3" aria-busy="true">
          <span className="sr-only">Loading subject assignments…</span>
          <div aria-hidden="true" className="flex flex-col gap-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  /**
   * Two reads, two failures, one answer.
   *
   * The assignments list and the subject catalog are separate requests, and
   * either can fail on its own. The state this used to render — a card header
   * and the sentence "Unable to load subject assignments" — named neither the
   * request that failed nor offered anything to do about it, and a catalog
   * failure fell through to the editor, which then said "No subjects available"
   * about a catalog it had never read. Both are named, both say what the server
   * said, and both retry the request that actually failed.
   */
  if (assignedQuery.isError || subjectCatalogQuery.isError) {
    const failedCatalog = subjectCatalogQuery.isError;
    return (
      <Card>
        <CardHeader>
          <SectionTitle headingLevel={headingLevel}>
            Teaching subjects
          </SectionTitle>
        </CardHeader>
        <CardContent>
          <QueryErrorPanel
            message={formatApiErrorMessage(
              failedCatalog ? subjectCatalogQuery.error : assignedQuery.error,
              failedCatalog
                ? "The server did not return the subject catalog."
                : "The server did not return this teacher's subject assignments."
            )}
            onRetry={() => {
              if (failedCatalog) {
                void subjectCatalogQuery.refetch();
                return;
              }
              void assignedQuery.refetch();
            }}
            title={
              failedCatalog
                ? "The subject catalog could not be loaded"
                : "This teacher's subject assignments could not be loaded"
            }
          />
        </CardContent>
      </Card>
    );
  }

  let content: ReactNode;
  if (editable) {
    content = (
      <TeacherSubjectAssignmentsEditor
        key={`${staffId}:${academicYearId}:${assignedQuery.dataUpdatedAt}`}
        staffId={staffId}
        academicYearId={academicYearId}
        catalogSubjects={catalogSubjects}
        assignedSubjectKeys={assignedSubjectKeys}
        onSaved={async () => {
          await assignedQuery.refetch();
        }}
      />
    );
  } else if (assignedSubjects.length > 0) {
    content = (
      <CardContent>
        <FieldGroup className="flex-row flex-wrap gap-2">
          {assignedSubjects.map((subject) => (
            <Badge key={subject.subjectKey} variant="secondary">
              {subjectWord(subject.subjectKey)}
            </Badge>
          ))}
        </FieldGroup>
      </CardContent>
    );
  } else {
    content = (
      <CardContent>
        <Empty className="min-h-32 border-none">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconBook aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No subjects configured</EmptyTitle>
            <EmptyDescription>
              Ask the administration to configure this teacher&apos;s subjects
              before assigning timetable periods.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </CardContent>
    );
  }

  return (
    <Card>
      <CardHeader>
        <SectionTitle headingLevel={headingLevel}>
          Teaching subjects
        </SectionTitle>
        <CardDescription>
          Subjects this teacher is configured to teach for the selected year.
        </CardDescription>
      </CardHeader>
      {content}
    </Card>
  );
};
