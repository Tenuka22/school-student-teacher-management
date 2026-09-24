"use client";

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

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: "Annual",
  casual: "Casual",
  medical: "Medical",
  maternity: "Maternity",
  duty: "Official Duty",
  other: "Other",
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
          {balances.map((b) => {
            const pct =
              b.maxDays > 0
                ? Math.min(100, Math.round((b.usedDays / b.maxDays) * 100))
                : 0;
            return (
              <div key={b.leaveType}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">
                    {LEAVE_TYPE_LABELS[b.leaveType] ?? b.leaveType}
                  </span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {b.usedDays} / {b.maxDays} days
                  </span>
                </div>
                <div
                  className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${LEAVE_TYPE_LABELS[b.leaveType] ?? b.leaveType} leave used`}
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

const APPOINTMENT_TYPE_LABELS: Record<string, string> = {
  permanent: "Permanent",
  probation: "Probation",
  temporary: "Temporary",
  substitute: "Substitute",
  visiting: "Visiting Lecturer",
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
          Your teacher workspace — profile, leave and timetable in one place.
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
                  {profile.teacherServiceNo ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Login username</dt>
                <dd className="font-mono font-medium">{username ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="truncate">{profile.email ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Phone</dt>
                <dd>{profile.phone ?? "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Employment</dt>
                <dd className="flex items-center gap-2">
                  {profile.appointmentType && (
                    <Badge variant="outline">
                      {APPOINTMENT_TYPE_LABELS[profile.appointmentType] ??
                        profile.appointmentType}
                    </Badge>
                  )}
                  {profile.employmentStatus && (
                    <Badge variant="secondary">
                      {profile.employmentStatus}
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
              Edit contact details
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
                  <Link
                    to="/admin/$year/staff/teacher-timetable"
                    params={{ year }}
                  />
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
