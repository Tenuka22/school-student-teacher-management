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
import { Link } from "@tanstack/react-router";

import { orpc } from "@/utils/orpc";

const APPOINTMENT_TYPE_LABELS: Record<string, string> = {
  permanent: "Permanent",
  probation: "Probation",
  temporary: "Temporary",
  substitute: "Substitute",
  visiting: "Visiting Lecturer",
};

export const TeacherDashboard = () => {
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
                to="/dashboard/my/leave"
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
              render={<Link to="/dashboard/my/profile" />}
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
              <Button render={<Link to="/dashboard/my/leave" />}>
                Manage My Leave
              </Button>
              <Button
                variant="outline"
                render={<Link to="/dashboard/staff/teacher-timetable" />}
              >
                Timetables
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
