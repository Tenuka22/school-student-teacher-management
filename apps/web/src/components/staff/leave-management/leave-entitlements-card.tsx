import { LEAVE_PAYMENT_LABELS } from "@school-student-teacher-management/db/constants/leave";
import type { LeavePaymentStatus } from "@school-student-teacher-management/db/constants/leave";
import type { LeaveType } from "@school-student-teacher-management/db/schema/leaves";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@school-student-teacher-management/ui/components/card";
import { Input } from "@school-student-teacher-management/ui/components/input";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

import { leaveTypeLabel } from "./leave-request-format";

/** Longest quota a single entitlement may carry: a year of days. */
const MAX_QUOTA_DAYS = 366;

interface Entitlement {
  leaveType: LeaveType;
  paymentStatus: LeavePaymentStatus;
  maxDays: number;
  minDays: number;
}

/**
 * One row of the quota table: its own draft value, so editing one quota does
 * not re-render or reset the others.
 */
const EntitlementRow = ({
  academicYearId,
  entitlement,
}: {
  academicYearId: string;
  entitlement: Entitlement;
}) => {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(String(entitlement.maxDays));
  const parsed = Number(draft);
  const valid =
    draft.trim() !== "" &&
    Number.isInteger(parsed) &&
    parsed >= 0 &&
    parsed <= MAX_QUOTA_DAYS;
  const changed = valid && parsed !== entitlement.maxDays;
  const label = `${leaveTypeLabel(entitlement.leaveType)}, ${LEAVE_PAYMENT_LABELS[entitlement.paymentStatus]}`;

  const save = useMutation(
    orpc.staff.leaves.upsertLeaveEntitlement.mutationOptions({
      onSuccess: async () => {
        toast.success(`${label}: quota set to ${parsed} days`);
        await queryClient.invalidateQueries({
          queryKey: orpc.staff.leaves.listLeaveEntitlements.key(),
        });
      },
      onError: (error) => {
        toast.error(
          formatApiErrorMessage(error, `Could not save the ${label} quota`)
        );
      },
    })
  );

  return (
    <TableRow>
      <TableCell>{leaveTypeLabel(entitlement.leaveType)}</TableCell>
      <TableCell>{LEAVE_PAYMENT_LABELS[entitlement.paymentStatus]}</TableCell>
      <TableCell>
        <Input
          aria-invalid={!valid}
          aria-label={`Quota in days for ${label}`}
          className="w-24"
          inputMode="numeric"
          max={MAX_QUOTA_DAYS}
          min={0}
          onChange={(event) => setDraft(event.target.value)}
          type="number"
          value={draft}
        />
      </TableCell>
      <TableCell className="text-right">
        <Button
          disabled={!changed || save.isPending}
          onClick={() =>
            save.mutate({
              academicYearId,
              leaveType: entitlement.leaveType,
              paymentStatus: entitlement.paymentStatus,
              maxDays: parsed,
              minDays: entitlement.minDays,
            })
          }
          size="sm"
          variant="outline"
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </TableCell>
    </TableRow>
  );
};

/**
 * The year's leave quotas, editable by the seats that own them (`admin`,
 * `leaveAdmin` — `leaveManagerProcedure`).
 *
 * The three entitlement procedures existed with no screen calling them, so
 * the Leave Administrator — a seat created to set quotas — could not set one
 * (forensic audit F-13). A lowered quota takes effect for new requests at
 * once, and `finalizeLeave` re-checks it at approval, so lowering it below
 * what is already pending is safe: those requests are refused when decided,
 * not silently approved.
 */
export const LeaveEntitlementsCard = ({ year }: { year: number }) => {
  const queryClient = useQueryClient();
  const yearsQuery = useQuery(orpc.staff.listAcademicYears.queryOptions());
  const academicYearId = yearsQuery.data?.find(
    (entry) => entry.year === year
  )?.id;

  const entitlementsQuery = useQuery({
    ...orpc.staff.leaves.listLeaveEntitlements.queryOptions({
      input: { academicYearId },
    }),
    enabled: Boolean(academicYearId),
  });

  const seed = useMutation(
    orpc.staff.leaves.seedLeaveEntitlements.mutationOptions({
      onSuccess: async () => {
        toast.success("Default quotas added");
        await queryClient.invalidateQueries({
          queryKey: orpc.staff.leaves.listLeaveEntitlements.key(),
        });
      },
      onError: (error) => {
        toast.error(
          formatApiErrorMessage(error, "Could not add the default quotas")
        );
      },
    })
  );

  const entitlements = (entitlementsQuery.data?.entitlements ??
    []) as Entitlement[];
  const loading = yearsQuery.isPending || entitlementsQuery.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Leave quotas for {year}</CardTitle>
        <CardDescription>
          Days each person may take per leave type this academic year. Pending
          and approved requests both count against a quota.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && academicYearId !== undefined ? (
          <Skeleton className="h-40 w-full" />
        ) : null}
        {!loading && entitlements.length === 0 && academicYearId ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-muted-foreground text-sm">
              No quotas are configured for {year}. Leave cannot be requested
              until they are.
            </p>
            <Button
              disabled={seed.isPending}
              onClick={() => seed.mutate({ academicYearId })}
              size="sm"
            >
              Add the College&apos;s default quotas
            </Button>
          </div>
        ) : null}
        {entitlements.length > 0 && academicYearId ? (
          <Table>
            <TableCaption>Leave quotas for {year}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Leave type</TableHead>
                <TableHead>Pay</TableHead>
                <TableHead>Days</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entitlements.map((entitlement) => (
                <EntitlementRow
                  academicYearId={academicYearId}
                  entitlement={entitlement}
                  key={`${entitlement.leaveType}:${entitlement.paymentStatus}:${entitlement.maxDays}`}
                />
              ))}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
    </Card>
  );
};
