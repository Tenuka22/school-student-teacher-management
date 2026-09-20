import { Button } from "@school-student-teacher-management/ui/components/button";
import { Checkbox } from "@school-student-teacher-management/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

interface PortTeachersDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  academicYearId: string | undefined;
}

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

  const handlePort = async () => {
    if (!academicYearId) {
      return;
    }
    try {
      const result = (await portMutation.mutateAsync({
        toAcademicYearId: academicYearId,
        excludeStaffIds: [...excluded],
      } as never)) as { ported: number; skipped: number };
      await queryClient.invalidateQueries();
      toast.success(
        `Ported ${result.ported} teacher(s) to this year (${result.skipped} already assigned)`
      );
      onOpenChange(false);
      setExcluded(new Set());
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to port teachers"
      );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Import Teachers from Previous Year</DialogTitle>
          <DialogDescription>
            {data?.previousYear
              ? `Every teacher below held a position in ${data.previousYear}. Uncheck anyone not returning this year, then import the rest.`
              : "Loads the teachers who held a position in the year immediately before this one."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!data?.previousAcademicYearId &&
            !previousTeachersQuery.isLoading && (
              <Empty className="min-h-[30vh] border-none">
                <EmptyTitle>No previous academic year</EmptyTitle>
                <EmptyDescription>
                  There&apos;s no earlier academic year to import teachers from.
                </EmptyDescription>
              </Empty>
            )}

          {!!data?.previousAcademicYearId && teachers.length === 0 && (
            <Empty className="min-h-[30vh] border-none">
              <EmptyTitle>No teachers found</EmptyTitle>
              <EmptyDescription>
                No one held a position in {data.previousYear}.
              </EmptyDescription>
            </Empty>
          )}

          {teachers.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Import</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Positions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teachers.map((teacher) => (
                  <TableRow key={teacher.id}>
                    <TableCell>
                      <Checkbox
                        checked={!excluded.has(teacher.id)}
                        onCheckedChange={(checked) =>
                          toggleExcluded(teacher.id, checked as boolean)
                        }
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
          )}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={portMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handlePort}
            disabled={portMutation.isPending || teachers.length === 0}
          >
            {portMutation.isPending
              ? "Importing..."
              : `Import ${teachers.length - excluded.size} Teacher(s)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
