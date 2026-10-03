import { Button } from "@school-student-teacher-management/ui/components/button";
import { Checkbox } from "@school-student-teacher-management/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import { IconCalendarTime } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { QueryErrorPanel } from "@/components/query-error-panel";
import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

interface PortTeachersDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  academicYearId: string | undefined;
}

const plural = (count: number) => (count === 1 ? "" : "s");

export const PortTeachersDialog = ({
  isOpen,
  onOpenChange,
  academicYearId,
}: PortTeachersDialogProps) => {
  const queryClient = useQueryClient();
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const previousTeachersQuery = useQuery({
    ...orpc.staff.listPreviousYearTeachers.queryOptions({
      input: { academicYearId: academicYearId ?? "" },
    }),
    enabled: isOpen && !!academicYearId,
  });

  const portMutation = useMutation(
    orpc.staff.portTeachersFromPreviousYear.mutationOptions()
  );

  const data = previousTeachersQuery.data as
    | {
        previousAcademicYearId: string | null;
        previousYear?: number;
        teachers: { id: string; name: string; positions: string[] }[];
      }
    | undefined;

  const teachers = useMemo(() => data?.teachers ?? [], [data]);

  const toggleExcluded = (staffId: string, checked: boolean) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.delete(staffId);
      } else {
        next.add(staffId);
      }
      return next;
    });
  };

  const selectedCount = teachers.length - excluded.size;

  /**
   * Port, and then say what actually happened.
   *
   * The toast used to be one unconditional success: "Ported 0 teacher(s) to this
   * year (7 already assigned)" is a green toast over a run that moved nothing,
   * and it is the *expected* outcome the second time an administrator opens this
   * dialog for a year they have already ported into. So a run that ported nobody
   * says so in its own words and names the reason; a run that ported some says
   * how many, and how many were skipped and why.
   */
  const handlePort = async () => {
    if (!academicYearId || selectedCount === 0) {
      return;
    }
    try {
      const result = (await portMutation.mutateAsync({
        toAcademicYearId: academicYearId,
        excludeStaffIds: [...excluded],
      } as never)) as {
        ported: number;
        skipped: number;
        skippedLeadership: number;
      };

      await queryClient.invalidateQueries();

      // The academic desk does not carry Deputy or Principal positions over;
      // say so rather than let them disappear silently.
      if (result.skippedLeadership > 0) {
        toast.info(
          `${result.skippedLeadership} leadership position${plural(result.skippedLeadership)} (Deputy, Assistant Principal or Principal) were not carried over. The Administrator or the Principal assigns those.`
        );
      }

      if (result.ported === 0) {
        toast.info(
          `Nothing was imported — all ${result.skipped} of the selected teacher${plural(result.skipped)} already hold a position in this year.`
        );
      } else {
        toast.success(
          `Imported ${result.ported} teacher${plural(result.ported)} into this year. ${result.skipped} already held a position here.`
        );
      }

      onOpenChange(false);
      setExcluded(new Set());
    } catch (error) {
      toast.error(formatApiErrorMessage(error, "Failed to port teachers"));
    }
  };

  const { isLoading, isError } = previousTeachersQuery;
  const hasPreviousYear = Boolean(data?.previousAcademicYearId);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Import teachers from the previous year</DialogTitle>
          <DialogDescription>
            {data?.previousYear
              ? `Every teacher below held a position in ${data.previousYear}. Uncheck anyone not returning this year, then import the rest.`
              : "Loads the teachers who held a position in the year immediately before this one."}
          </DialogDescription>
        </DialogHeader>

        {/*
          `aria-busy` on the body, and the two states that were missing.

          This dialog had exactly one branch for "no data": `data` is undefined
          while the request is in flight *and* when it has failed, and both fell
          into "No previous academic year" — a confident claim that the College
          has no earlier year, printed by a request that had learned nothing. A
          slow school LAN and a dropped connection both produced that sentence.
          There is now a loading shape, a named failure with a retry, and the
          empty state is reachable only from a request that succeeded and found
          no earlier year.
        */}
        <div className="flex-1 overflow-y-auto px-6 py-4" aria-busy={isLoading}>
          {isLoading ? (
            <>
              <span className="sr-only">
                Loading the previous year&rsquo;s teachers…
              </span>
              <div aria-hidden="true" className="flex flex-col gap-3">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            </>
          ) : null}

          {isError ? (
            <QueryErrorPanel
              message={formatApiErrorMessage(
                previousTeachersQuery.error,
                "The server did not return the previous year's teachers."
              )}
              onRetry={() => {
                void previousTeachersQuery.refetch();
              }}
              title="The previous year's teachers could not be loaded"
            />
          ) : null}

          {!isLoading && !isError && !hasPreviousYear ? (
            <Empty className="min-h-[30vh] border-none">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconCalendarTime aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No previous academic year</EmptyTitle>
                <EmptyDescription>
                  There&rsquo;s no earlier academic year to import teachers
                  from.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}

          {!isLoading &&
          !isError &&
          hasPreviousYear &&
          teachers.length === 0 ? (
            <Empty className="min-h-[30vh] border-none">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconCalendarTime aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No teachers found</EmptyTitle>
                <EmptyDescription>
                  No one held a position in {data?.previousYear}.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}

          {teachers.length > 0 ? (
            <Table>
              <TableCaption className="sr-only">
                Teachers who held a position in {data?.previousYear}, and
                whether they will be imported into this year
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="w-12">
                    Import
                  </TableHead>
                  <TableHead scope="col">Name</TableHead>
                  <TableHead scope="col">Positions held last year</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teachers.map((teacher) => (
                  <TableRow key={teacher.id}>
                    <TableCell>
                      <Checkbox
                        checked={!excluded.has(teacher.id)}
                        onCheckedChange={(checked) =>
                          toggleExcluded(teacher.id, checked === true)
                        }
                        aria-label={`Import ${teacher.name} into this year`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {teacher.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {teacher.positions.join(", ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={portMutation.isPending}
          >
            Cancel
          </Button>
          {/*
            Disabled on an empty selection, not merely on an empty list. Every
            box could be unchecked, which left a live "Import 0 Teacher(s)"
            button — a control whose only possible outcome was a toast saying
            nothing had been imported.
          */}
          <Button
            onClick={handlePort}
            disabled={portMutation.isPending || selectedCount === 0}
            className="min-w-48"
          >
            {portMutation.isPending
              ? "Importing…"
              : `Import ${teachers.length - excluded.size} Teacher(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
