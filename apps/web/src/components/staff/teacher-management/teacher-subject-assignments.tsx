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
  CardTitle,
} from "@school-student-teacher-management/ui/components/card";
import { Checkbox } from "@school-student-teacher-management/ui/components/checkbox";
import {
  Empty,
  EmptyDescription,
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
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

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
}

/** A catalog entry as words: the subject's name, and the grade it belongs to. */
const subjectLabel = (subject: CatalogSubject): string => {
  if (subject.gradeLevel === 0) {
    return subjectWord(subject.subjectKey);
  }

  return `${subjectWord(subject.subjectKey)} · Grade ${subject.gradeLevel}`;
};

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
  const replaceMutation = useMutation(
    orpc.staff.replaceTeacherSubjects.mutationOptions({
      onSuccess: async () => {
        toast.success("Teacher subjects updated");
        await onSaved();
      },
      onError: (error) => {
        toast.error(error.message);
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
          Select every subject this teacher may be assigned to teach.
        </FieldDescription>
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
      <Empty className="min-h-32 border">
        <EmptyTitle>No subjects available</EmptyTitle>
        <EmptyDescription>
          The subject catalog is empty for this school.
        </EmptyDescription>
      </Empty>
    );

  return (
    <>
      <CardContent>{content}</CardContent>
      <CardFooter>
        <Button
          type="button"
          disabled={!hasChanges || replaceMutation.isPending}
          onClick={() =>
            replaceMutation.mutate({
              academicYearId,
              staffId,
              subjectKeys: [...selectedSubjectKeys],
            })
          }
        >
          {replaceMutation.isPending ? "Savingâ€¦" : "Save subjects"}
        </Button>
      </CardFooter>
    </>
  );
};

export const TeacherSubjectAssignments = ({
  staffId,
  academicYearId,
  editable = true,
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

  if (assignedQuery.isLoading || subjectCatalogQuery.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Teaching subjects</CardTitle>
          <CardDescription>Loading subject assignmentsâ€¦</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (assignedQuery.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Teaching subjects</CardTitle>
          <CardDescription>Unable to load subject assignments.</CardDescription>
        </CardHeader>
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
        <FieldGroup className="flex flex-row flex-wrap gap-2">
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
        <Empty className="min-h-32 border">
          <EmptyTitle>No subjects configured</EmptyTitle>
          <EmptyDescription>
            Ask the administration to configure this teacher&apos;s subjects
            before assigning timetable periods.
          </EmptyDescription>
        </Empty>
      </CardContent>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Teaching subjects</CardTitle>
        <CardDescription>
          Subjects this teacher is configured to teach for the selected year.
        </CardDescription>
      </CardHeader>
      {content}
    </Card>
  );
};
