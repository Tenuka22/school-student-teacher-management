import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@school-student-teacher-management/ui/components/alert-dialog";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@school-student-teacher-management/ui/components/card";
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
} from "@school-student-teacher-management/ui/components/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

interface TeacherPositionsProps {
  staffId: string;
  academicYearId: string;
}

const getScopeLabel = (scope: string) =>
  scope
    .replaceAll("_", " ")
    .replaceAll(/\b\w/gu, (character) => character.toUpperCase());

export const TeacherPositions = ({
  staffId,
  academicYearId,
}: TeacherPositionsProps) => {
  const positionsQuery = useQuery(
    orpc.staff.listPositions.queryOptions({
      input: { academicYearId, staffId },
    })
  );
  const assignMutation = useMutation(
    orpc.staff.assignPosition.mutationOptions()
  );
  const removeMutation = useMutation(
    orpc.staff.removePosition.mutationOptions()
  );
  const [selectedPosition, setSelectedPosition] = useState("teacher");
  const [selectedScope, setSelectedScope] = useState("");
  const [removingAssignment, setRemovingAssignment] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const positionData = positionsQuery.data;
  const positions = positionData?.positions ?? [];
  const sectionalScopes = positionData?.sectionalScopes ?? [];
  const assignments = positionData?.assignments ?? [];
  const selectedPositionData = positions.find(
    (position) => position.key === selectedPosition
  );
  const needsSectionalScope = selectedPosition === "sectionalHead";

  const getPositionName = (key: string) =>
    positions.find((position) => position.key === key)?.name ?? key;

  const handleAssign = async () => {
    try {
      await assignMutation.mutateAsync({
        staffId,
        academicYearId,
        position: selectedPosition,
        sectionalScope: needsSectionalScope
          ? selectedScope || undefined
          : undefined,
      } as never);
      await positionsQuery.refetch();
      setSelectedScope("");
      toast.success("Position assigned");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to assign position"
      );
    }
  };

  const handleRemove = async () => {
    if (!removingAssignment) {
      return;
    }

    try {
      await removeMutation.mutateAsync({ id: removingAssignment.id } as never);
      await positionsQuery.refetch();
      setRemovingAssignment(null);
      toast.success("Position removed");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to remove position"
      );
    }
  };

  return (
    <>
      <Card size="sm">
        <CardHeader className="border-b">
          <CardTitle>Positions</CardTitle>
          <CardDescription>
            Position assignments apply only to the selected academic year.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {positionsQuery.isLoading && <Skeleton className="h-20 w-full" />}

          {!positionsQuery.isLoading && assignments.length === 0 && (
            <Empty className="min-h-28 border-none py-4">
              <EmptyTitle>No positions assigned</EmptyTitle>
              <EmptyDescription>
                Add a year-specific position below.
              </EmptyDescription>
            </Empty>
          )}

          {assignments.map((assignment) => {
            const label = [
              getPositionName(assignment.position),
              assignment.sectionalScope
                ? getScopeLabel(assignment.sectionalScope)
                : null,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <div
                key={assignment.id}
                className="flex items-center justify-between gap-3"
              >
                <div>
                  <p className="font-medium">{label}</p>
                  <p className="text-muted-foreground capitalize">
                    {assignment.position}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() =>
                    setRemovingAssignment({ id: assignment.id, label })
                  }
                  disabled={removeMutation.isPending}
                >
                  Remove
                </Button>
              </div>
            );
          })}

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="teacher-position">Position</FieldLabel>
              <Select
                value={selectedPosition}
                onValueChange={(value) => {
                  setSelectedPosition(value ?? "teacher");
                  setSelectedScope("");
                }}
              >
                <SelectTrigger id="teacher-position">
                  <SelectValue placeholder="Select position" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {positions.map((position) => (
                      <SelectItem key={position.key} value={position.key}>
                        {position.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            {needsSectionalScope && (
              <Field>
                <FieldLabel htmlFor="teacher-position-scope">
                  Sectional Scope
                </FieldLabel>
                <Select
                  value={selectedScope}
                  onValueChange={(value) => setSelectedScope(value ?? "")}
                >
                  <SelectTrigger id="teacher-position-scope">
                    <SelectValue placeholder="Select scope" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {sectionalScopes.map((scope) => (
                        <SelectItem key={scope} value={scope}>
                          {getScopeLabel(scope)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  The scope is required for a sectional head assignment.
                </FieldDescription>
              </Field>
            )}
          </FieldGroup>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleAssign}
              disabled={
                assignMutation.isPending ||
                !selectedPositionData ||
                (needsSectionalScope && !selectedScope)
              }
            >
              {assignMutation.isPending ? "Assigning..." : "Assign Position"}
            </Button>
            {selectedPositionData && (
              <Badge variant="outline" className="capitalize">
                {selectedPositionData.category}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={Boolean(removingAssignment)}
        onOpenChange={(open) => {
          if (!open) {
            setRemovingAssignment(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Remove Position</AlertDialogTitle>
          <AlertDialogDescription>
            Remove {removingAssignment?.label} from this academic year? The
            teacher&apos;s account role may be recalculated.
          </AlertDialogDescription>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
