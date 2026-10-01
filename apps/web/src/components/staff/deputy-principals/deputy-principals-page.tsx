"use client";

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
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import { IconUserPlus } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { QueryErrorPanel } from "@/components/query-error-panel";
import { ConfirmDialog } from "@/components/ui-patterns/confirm-dialog";
import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

import { AssignDeputyDialog } from "./assign-deputy-dialog";
import {
  deputyPositionLabel,
  isDeputyPosition,
} from "./deputy-position-labels";
import type {
  DeputyAssignment,
  DeputyPosition,
  StaffLite,
} from "./deputy-position-labels";
import { DeputyTable } from "./deputy-table";

/** Loading or an unresolved year — the table has nothing to read from yet. */
const DeputyPrincipalsSkeleton = () => (
  <div className="flex flex-col gap-2">
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-full" />
  </div>
);

/**
 * Who currently holds the Deputy or Assistant Principal position, for one
 * academic year — and the only place either is assigned or removed.
 *
 * There is no seeded Deputy Principal login any more: a Deputy is a real
 * member of staff holding a current-year `vicePrincipal` or
 * `assistantPrincipal` `staffPosition` row (see `packages/auth/src/admin.ts`
 * and `resolveAuthority` in `leadership-review.ts`). Any number of staff may
 * hold either seat at once, and each is assigned here by the Administrator,
 * the Principal, or the Academic Administrator — the three roles
 * `positionManagerProcedure` admits. A Deputy **recommends** leave; only the
 * Principal **finalises** it (`recommendLeave` / `finalizeLeave`) — assigning
 * the position here does not change that split.
 */
export const DeputyPrincipalsPage = ({
  academicYear,
}: {
  academicYear: number;
}) => {
  const queryClient = useQueryClient();

  const yearsQuery = useQuery(orpc.staff.listAcademicYears.queryOptions());
  const year = useMemo(
    () => yearsQuery.data?.find((item) => item.year === academicYear),
    [yearsQuery.data, academicYear]
  );

  const positionsQuery = useQuery(
    orpc.staff.listPositions.queryOptions({
      input: { academicYearId: year?.id },
      enabled: Boolean(year?.id),
    })
  );

  const staffQuery = useQuery(orpc.staff.listStaff.queryOptions({ input: {} }));

  const staffById = useMemo(() => {
    const map = new Map<string, StaffLite>();
    for (const member of (staffQuery.data ?? []) as StaffLite[]) {
      map.set(member.id, member);
    }
    return map;
  }, [staffQuery.data]);

  const deputies = useMemo(() => {
    const assignments = (positionsQuery.data?.assignments ??
      []) as DeputyAssignment[];
    return assignments
      .filter((row) => isDeputyPosition(row.position))
      .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [positionsQuery.data]);

  const heldStaffIds = useMemo(
    () => deputies.map((row) => row.staffId),
    [deputies]
  );

  const [assignOpen, setAssignOpen] = useState(false);
  const [staffId, setStaffId] = useState("");
  const [position, setPosition] = useState<DeputyPosition>("vicePrincipal");
  const [removeTarget, setRemoveTarget] = useState<DeputyAssignment | null>(
    null
  );

  const positionsQueryKey = orpc.staff.listPositions.queryOptions({
    input: { academicYearId: year?.id ?? "" },
  }).queryKey;

  const assignMutation = useMutation(
    orpc.staff.assignPosition.mutationOptions()
  );
  const removeMutation = useMutation(
    orpc.staff.removePosition.mutationOptions()
  );

  const closeAssignDialog = (open: boolean) => {
    setAssignOpen(open);
    if (!open) {
      setStaffId("");
      setPosition("vicePrincipal");
    }
  };

  const handleAssign = async () => {
    if (!(year?.id && staffId)) {
      return;
    }
    try {
      await assignMutation.mutateAsync({
        staffId,
        academicYearId: year.id,
        position,
        sectionalScope: null,
      });
      toast.success(`${deputyPositionLabel(position)} assigned`);
      closeAssignDialog(false);
      await queryClient.invalidateQueries({ queryKey: positionsQueryKey });
    } catch (error) {
      toast.error(
        formatApiErrorMessage(error, "Could not assign the position")
      );
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) {
      return;
    }
    try {
      await removeMutation.mutateAsync({ id: removeTarget.id });
      toast.success(`${deputyPositionLabel(removeTarget.position)} removed`);
      setRemoveTarget(null);
      await queryClient.invalidateQueries({ queryKey: positionsQueryKey });
    } catch (error) {
      toast.error(
        formatApiErrorMessage(error, "Could not remove the position")
      );
    }
  };

  const isYearPending = yearsQuery.isPending;
  const isYearMissing = yearsQuery.isSuccess && !year;

  const body = () => {
    if (isYearPending) {
      return <DeputyPrincipalsSkeleton />;
    }
    if (isYearMissing) {
      return (
        <Empty className="border border-dashed">
          <EmptyTitle>Academic year not found</EmptyTitle>
          <EmptyDescription>
            {academicYear} does not match a recorded academic year.
          </EmptyDescription>
        </Empty>
      );
    }
    if (!year?.id) {
      return null;
    }
    if (positionsQuery.isPending) {
      return <DeputyPrincipalsSkeleton />;
    }
    if (positionsQuery.isError) {
      return (
        <QueryErrorPanel
          isRetrying={positionsQuery.isFetching}
          message={formatApiErrorMessage(
            positionsQuery.error,
            "Could not read the current assignments"
          )}
          onRetry={() => positionsQuery.refetch()}
          title="Could not read the current deputy assignments"
        />
      );
    }
    return (
      <DeputyTable
        academicYear={academicYear}
        deputies={deputies}
        onRemove={setRemoveTarget}
        staffById={staffById}
      />
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Deputy &amp; Assistant Principals</CardTitle>
            <CardDescription>
              Who holds leave-review authority for {academicYear}. A Deputy or
              Assistant Principal recommends a leave request; only the Principal
              finalises it. Any number of staff may hold either seat.
            </CardDescription>
          </div>
          <Button
            disabled={!year?.id}
            onClick={() => setAssignOpen(true)}
            type="button"
          >
            <IconUserPlus aria-hidden="true" />
            Assign deputy
          </Button>
        </CardHeader>
        <CardContent>{body()}</CardContent>
      </Card>

      <AssignDeputyDialog
        academicYear={academicYear}
        excludeStaffIds={heldStaffIds}
        isPending={assignMutation.isPending}
        onOpenChange={closeAssignDialog}
        onPositionChange={setPosition}
        onStaffIdChange={setStaffId}
        onSubmit={handleAssign}
        open={assignOpen}
        position={position}
        staffId={staffId}
      />

      <ConfirmDialog
        confirmLabel="Remove"
        description={
          removeTarget
            ? `${staffById.get(removeTarget.staffId)?.name ?? "This staff member"} will no longer hold the ${deputyPositionLabel(removeTarget.position)} position for ${academicYear}, and loses leave-recommendation authority immediately.`
            : ""
        }
        isPending={removeMutation.isPending}
        onConfirm={handleRemove}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveTarget(null);
          }
        }}
        open={Boolean(removeTarget)}
        pendingLabel="Removing…"
        title="Remove this position?"
        tone="destructive"
      />
    </div>
  );
};
