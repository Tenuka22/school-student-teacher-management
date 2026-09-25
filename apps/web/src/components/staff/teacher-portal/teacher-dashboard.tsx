"use client";

import {
  appointmentTypeLabel,
  employmentStatusLabel,
} from "@school-student-teacher-management/db/constants/display";
import {
  leavePaymentLabel,
  leaveTypeLabel,
} from "@school-student-teacher-management/db/constants/leave-labels";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Card,
  CardContent,
} from "@school-student-teacher-management/ui/components/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import { IconCalendarTime, IconId } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";

import { orpc } from "@/utils/orpc";

/**
 * A balance line, in words.
 *
 * Maternity is the only type with more than one payment status, so it is the
 * only one that needs the status in its name � and the status is read from the
 * shared label map so a request recorded as half pay says so, rather than
 * falling through to "Unpaid".
 */
const getLeaveBalanceLabel = (balance: {
  leaveType: string;
  paymentStatus: string;
}) => {
  const typeLabel = leaveTypeLabel(balance.leaveType);
  if (balance.leaveType !== "maternity") {
    return typeLabel;
  }

  if (balance.paymentStatus === "notApplicable") {
    return typeLabel;
  }

  return `${typeLabel} (${leavePaymentLabel(balance.paymentStatus)})`;
};

/** Leave balance card: entitlement (max) vs derived usage for the year. */
const LeaveBalanceCard = () => {
  const balanceQuery = useQuery(
    orpc.staff.leaves.getMyLeaveBalance.queryOptions({ input: {} })
  );
  const balances = balanceQuery.data?.balances ?? [];

  if (balances.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <IconCalendarTime className="text-muted-foreground size-5" />
          <h2 className="font-semibold">Leave Balance (this year)</h2>
        </div>
        <div className="space-y-3">
          {balances.map((balance) => {
            const label = getLeaveBalanceLabel(balance);
            const pct =
              balance.maxDays > 0
                ? Math.min(
                    100,
                    Math.round((balance.usedDays / balance.maxDays) * 100)
                  )
                : 0;
            const isLoan = balance.remainingDays < 0;
            const balanceLabel = isLoan
              ? `${Math.abs(balance.remainingDays)} days loan`
              : `${balance.remainingDays} days remaining`;
            return (
              <div key={`${balance.leaveType}:${balance.paymentStatus}`}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{label}</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {balance.usedDays} / {balance.maxDays} days Â·{" "}
                    {balanceLabel}
                  </span>
                </div>
                <div
                  className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${label} leave used`}
                >
                  <div
                    className={`h-full rounded-full ${pct >= 100 ? "bg-destructive" : "bg-primary"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export const TeacherDashboard = () => {
  const { year } = useParams({ from: "/_auth/teacher/$year" });
  const myStaffQuery = useQuery(orpc.staff.getMyStaff.queryOptions());
  const profile = myStaffQuery.data?.profile;
  const username = myStaffQuery.data?.username;

  if (myStaffQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!profile) {
    return (
      <Empty className="min-h-[50vh] border-dashed">
        <EmptyTitle>No staff profile linked</EmptyTitle>
        <EmptyDescription>
          Your login isn&apos;t connected to a staff record yet. Ask the
          administration to link your account, then this dashboard will show
          your profile, timetable and leave history.
        </EmptyDescription>
        <EmptyContent>
          <Button
            variant="outline"
            render={
              <Link
                to="/teacher/$year/leave"
                params={{ year }}
                className="mt-4 inline-flex items-center gap-2"
              >
                <IconCalendarTime className="size-4" />
                Apply for Leave
              </Link>
            }
          />
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-4xl font-semibold">
          Welcome, {profile.name}
        </h1>
        <p className="text-muted-foreground mt-2">
          Your teacher workspace â€” profile, leave and timetable in one place.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <IconId className="text-muted-foreground size-5" />
              <h2 className="font-semibold">My Profile</h2>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Badge number</dt>
                <dd className="font-mono font-medium">
                  {profile.teacherServiceNo ?? "â€”"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Login username</dt>
                <dd className="font-mono font-medium">{username ?? "â€”"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="truncate">{profile.email ?? "â€”"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Phone</dt>
                <dd>{profile.phone ?? "â€”"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Employment</dt>
                <dd className="flex items-center gap-2">
                  {profile.appointmentType && (
                    <Badge variant="outline">
                      {appointmentTypeLabel(profile.appointmentType)}
                    </Badge>
                  )}
                  {profile.employmentStatus && (
                    <Badge variant="secondary">
                      {employmentStatusLabel(profile.employmentStatus)}
                    </Badge>
                  )}
                </dd>
              </div>
            </dl>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              render={<Link to="/teacher/$year/profile" params={{ year }} />}
            >
              Edit phone number
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex h-full flex-col justify-between gap-4 p-6">
            <div className="flex items-center gap-2">
              <IconCalendarTime className="text-muted-foreground size-5" />
              <h2 className="font-semibold">Leave &amp; Timetable</h2>
            </div>
            <p className="text-muted-foreground text-sm">
              Applying for leave, tracking approvals and checking your weekly
              timetable all live here.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                render={<Link to="/teacher/$year/leave" params={{ year }} />}
              >
                Manage My Leave
              </Button>
              <Button
                variant="outline"
                render={
                  <Link to="/teacher/$year/timetable" params={{ year }} />
                }
              >
                Timetables
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="md:col-span-2">
          <LeaveBalanceCard />
        </div>
      </div>
    </div>
  );
};
