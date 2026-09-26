"use client";

import type { SessionUser } from "@school-student-teacher-management/api/context";
import {
  isAdminRole,
  isLeadershipRole,
} from "@school-student-teacher-management/auth/roles";
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import { Input } from "@school-student-teacher-management/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import { IconSearch, IconUsersPlus } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { format } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";

import { AttendanceGrid } from "@/components/staff/attendance/attendance-grid";
import type { AcademicYear } from "@/components/staff/attendance/use-attendance-page";
import { useAttendancePage } from "@/components/staff/attendance/use-attendance-page";
import { PortTeachersDialog } from "@/components/staff/teacher-management/port-teachers-dialog";
import { orpc } from "@/utils/orpc";

interface AttendancePolicyValues {
  arrivalCutoffTime: string;
  shortLeavesPerMonth: number;
  primaryStartPeriodNumber: number;
  primaryEndPeriodNumber: number;
  secondaryStartPeriodNumber: number;
  secondaryEndPeriodNumber: number;
}

interface AttendancePolicyUsage {
  yearMonth: string;
  shortLeavesUsed: number;
}

interface AttendancePolicyEditorProps {
  academicYear: AcademicYear;
  policy: AttendancePolicyValues;
  usage: AttendancePolicyUsage | null;
  isSaving: boolean;
  onSave: (values: AttendancePolicyValues) => Promise<void>;
}

const AttendancePolicyEditor = ({
  academicYear,
  policy,
  usage,
  isSaving,
  onSave,
}: AttendancePolicyEditorProps) => {
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await onSave({
      arrivalCutoffTime: String(formData.get("arrivalCutoffTime")),
      shortLeavesPerMonth: Number(formData.get("shortLeavesPerMonth")),
      primaryStartPeriodNumber: Number(
        formData.get("primaryStartPeriodNumber")
      ),
      primaryEndPeriodNumber: Number(formData.get("primaryEndPeriodNumber")),
      secondaryStartPeriodNumber: Number(
        formData.get("secondaryStartPeriodNumber")
      ),
      secondaryEndPeriodNumber: Number(
        formData.get("secondaryEndPeriodNumber")
      ),
    });
  };

  return (
    <Card size="sm" className="w-full">
      <form onSubmit={handleSubmit}>
        <CardHeader className="border-b">
          <CardTitle>Attendance policy</CardTitle>
          <CardDescription>
            Arrival, short leave, and half-day period rules for{" "}
            {academicYear.year}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="attendance-policy-cutoff">
                Arrival cut-off
              </FieldLabel>
              <Input
                id="attendance-policy-cutoff"
                name="arrivalCutoffTime"
                type="time"
                defaultValue={policy.arrivalCutoffTime}
                required
                disabled={isSaving}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="attendance-policy-short-leaves">
                Short leaves / month
              </FieldLabel>
              <Input
                id="attendance-policy-short-leaves"
                name="shortLeavesPerMonth"
                type="number"
                min="0"
                max="31"
                step="1"
                defaultValue={policy.shortLeavesPerMonth}
                required
                disabled={isSaving}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="attendance-policy-primary-start">
                Primary range starts
              </FieldLabel>
              <Input
                id="attendance-policy-primary-start"
                name="primaryStartPeriodNumber"
                type="number"
                min="1"
                max="8"
                step="1"
                defaultValue={policy.primaryStartPeriodNumber}
                required
                disabled={isSaving}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="attendance-policy-primary-end">
                Primary range ends
              </FieldLabel>
              <Input
                id="attendance-policy-primary-end"
                name="primaryEndPeriodNumber"
                type="number"
                min="1"
                max="8"
                step="1"
                defaultValue={policy.primaryEndPeriodNumber}
                required
                disabled={isSaving}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="attendance-policy-secondary-start">
                Secondary range starts
              </FieldLabel>
              <Input
                id="attendance-policy-secondary-start"
                name="secondaryStartPeriodNumber"
                type="number"
                min="1"
                max="8"
                step="1"
                defaultValue={policy.secondaryStartPeriodNumber}
                required
                disabled={isSaving}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="attendance-policy-secondary-end">
                Secondary range ends
              </FieldLabel>
              <Input
                id="attendance-policy-secondary-end"
                name="secondaryEndPeriodNumber"
                type="number"
                min="1"
                max="8"
                step="1"
                defaultValue={policy.secondaryEndPeriodNumber}
                required
                disabled={isSaving}
              />
              <FieldDescription>
                Half-days have no monthly allowance. Two half-days count as one
                full leave day; a third in the same month is recorded as a half
                day.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="flex-wrap justify-between gap-3">
          <div>
            <p className="font-medium">Your short leaves this month</p>
            <p className="text-muted-foreground">
              {usage
                ? `${usage.shortLeavesUsed} of ${policy.shortLeavesPerMonth} used on your own record`
                : "This policy is school-wide; the count here is your own usage, not the whole staff."}
            </p>
          </div>
          <Button type="submit" size="sm" disabled={isSaving}>
            {isSaving ? "Saving…" : "Save policy"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
};

/**
 * The policy as leadership reads it.
 *
 * `attendance.getPolicy` is a `protectedProcedure` and the register around this
 * card is `adminProcedure`, so a Principal or a Deputy is entitled to the
 * numbers — and is not entitled to move them, which is what
 * `adminOnlyProcedure` on `updatePolicy` says. So the same six numbers render
 * here as text instead of as inputs: the read tier and the write tier describe
 * one policy, and only one of them belongs to the seats outside leadership.
 */
const AttendancePolicySummary = ({
  academicYear,
  policy,
  usage,
}: {
  academicYear: AcademicYear;
  policy: AttendancePolicyValues;
  usage: AttendancePolicyUsage | null;
}) => {
  const detailRows: [string, string][] = [
    ["Arrival cut-off", policy.arrivalCutoffTime],
    ["Short leaves / month", String(policy.shortLeavesPerMonth)],
    [
      "Primary range",
      `Periods ${policy.primaryStartPeriodNumber}–${policy.primaryEndPeriodNumber}`,
    ],
    [
      "Secondary range",
      `Periods ${policy.secondaryStartPeriodNumber}–${policy.secondaryEndPeriodNumber}`,
    ],
  ];

  return (
    <Card size="sm" className="w-full">
      <CardHeader className="border-b">
        <CardTitle>Attendance policy</CardTitle>
        <CardDescription>
          Arrival, short leave, and half-day period rules for{" "}
          {academicYear.year}. Read-only — the administrator sets these.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
          {detailRows.map(([label, value]) => (
            <div
              key={label}
              className="flex justify-between gap-4 border-b pb-2"
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-muted-foreground mt-3 text-xs">
          Half-days have no monthly allowance. Two half-days count as one full
          leave day; a third in the same month is recorded as a half day.
        </p>
      </CardContent>
      <CardFooter>
        <p className="text-muted-foreground text-xs">
          {usage
            ? `Your short leaves this month: ${usage.shortLeavesUsed} of ${policy.shortLeavesPerMonth} used on your own record.`
            : "This policy applies school-wide."}
        </p>
      </CardFooter>
    </Card>
  );
};

/**
 * `canEdit` is the server's own division, not a UI preference.
 *
 * `updatePolicy` is `adminOnlyProcedure` — `requireRole("admin")`, one seat —
 * while this card is mounted by all three admin-workspace routes, so the Deputy
 * and the Principal were being handed the form and the Save button that
 * `adminOnlyProcedure` refuses every time. The server is right and stays right;
 * the gate lives here so that nobody is invited to fail.
 */
const AttendancePolicyCard = ({
  academicYear,
  canEdit,
}: {
  academicYear: AcademicYear | undefined;
  canEdit: boolean;
}) => {
  const queryClient = useQueryClient();
  const updateMutation = useMutation(
    orpc.staff.attendance.updatePolicy.mutationOptions({
      onSuccess: async () => {
        toast.success("Attendance policy updated");
        if (academicYear) {
          await queryClient.invalidateQueries({
            queryKey: orpc.staff.attendance.getPolicy.queryOptions({
              input: { academicYearId: academicYear.id },
            }).queryKey,
          });
        }
      },
      onError: (error) => {
        toast.error(error.message);
      },
    })
  );
  const policyQuery = useQuery({
    ...orpc.staff.attendance.getPolicy.queryOptions({
      input: { academicYearId: academicYear?.id ?? "" },
    }),
    enabled: Boolean(academicYear?.id),
  });

  if (!academicYear || policyQuery.isLoading) {
    return (
      <Card size="sm">
        <CardHeader className="border-b">
          <CardTitle>Attendance policy</CardTitle>
          <CardDescription>Loading year policy…</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-8" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (policyQuery.isError || !policyQuery.data) {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle>Attendance policy</CardTitle>
          <CardDescription>
            The policy for {academicYear.year} could not be loaded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              await policyQuery.refetch();
            }}
          >
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!policyQuery.data.policy) {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle>Attendance policy</CardTitle>
          <CardDescription>
            Arrival, short leave, and half-day period rules for{" "}
            {academicYear.year}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Empty className="min-h-32 border-none py-2">
            <EmptyTitle>Attendance policy not configured</EmptyTitle>
            <EmptyDescription>
              {canEdit
                ? "Configure the arrival cut-off, short-leave allowance, and Primary/Secondary period ranges for this academic year."
                : "The arrival cut-off, short-leave allowance and Primary/Secondary period ranges are not set for this academic year. The administrator sets them."}
            </EmptyDescription>
            {/* Seeding the row is the same `updatePolicy` write as the form
                below, so it is the administrator's button too. */}
            {canEdit ? (
              <EmptyContent>
                <Button
                  type="button"
                  size="sm"
                  disabled={updateMutation.isPending}
                  onClick={() =>
                    updateMutation.mutate({ academicYearId: academicYear.id })
                  }
                >
                  {updateMutation.isPending
                    ? "Configuring…"
                    : "Configure default policy"}
                </Button>
              </EmptyContent>
            ) : null}
          </Empty>
        </CardContent>
      </Card>
    );
  }

  return canEdit ? (
    <AttendancePolicyEditor
      key={`${academicYear.id}:${policyQuery.dataUpdatedAt}`}
      academicYear={academicYear}
      policy={policyQuery.data.policy}
      usage={policyQuery.data.usage}
      isSaving={updateMutation.isPending}
      onSave={async (values) => {
        await updateMutation.mutateAsync({
          academicYearId: academicYear.id,
          ...values,
        });
      }}
    />
  ) : (
    <AttendancePolicySummary
      academicYear={academicYear}
      policy={policyQuery.data.policy}
      usage={policyQuery.data.usage}
    />
  );
};

const formatDateRange = (startDate: string, endDate: string) =>
  `${format(new Date(`${startDate}T00:00:00`), "d MMM yyyy")} – ${format(
    new Date(`${endDate}T00:00:00`),
    "d MMM yyyy"
  )}`;

interface AttendancePageContentProps {
  academicYear: number;
}

/**
 * The policy section, gated on the role the authed shell already resolved.
 *
 * Two tiers meet here, and they are not the same set.
 *
 * - **Read** — the card is the admin workspace's: `getPolicy` is a
 *   `protectedProcedure` and the register around it is `adminProcedure`, so
 *   `admin`, `principal` and `vicePrincipal` all see it. That is what
 *   `isAdminRole` answers, and it is also the set of roles the three routes
 *   mounting `AttendancePageContent` are guarded to.
 * - **Write** — one seat above that. `updatePolicy` is `adminOnlyProcedure`,
 *   i.e. `requireRole("admin")`, and `isAdminRole` on its own is the *wrong*
 *   gate: it would hand the form to exactly the two leadership seats the
 *   server refuses. The write tier is the admin set minus leadership, which
 *   is the same reading `academic-year-gate.tsx` makes for `setCurrentYear`.
 *
 * The gate is here, in the UI, only so that a Deputy is not invited to fill in
 * a school-wide form and be told no. `adminOnlyProcedure` stays as it is.
 */
const AttendancePolicySection = ({
  academicYear,
}: {
  academicYear: AcademicYear | undefined;
}) => {
  const { session } = useRouteContext({ from: "/_auth" });
  const role = (session?.user as SessionUser | undefined)?.role;

  const canReadPolicy = isAdminRole(role);
  const canEditPolicy = isAdminRole(role) && !isLeadershipRole(role);

  if (!canReadPolicy) {
    return null;
  }

  return (
    <AttendancePolicyCard academicYear={academicYear} canEdit={canEditPolicy} />
  );
};

export const AttendancePageContent = ({
  academicYear,
}: AttendancePageContentProps) => {
  const page = useAttendancePage(academicYear);
  const [filter, setFilter] = useState("");
  const [isPortDialogOpen, setIsPortDialogOpen] = useState(false);
  const showImportBanner =
    !page.isLoadingTeachers &&
    !page.isErrorTeachers &&
    page.teachers.length === 0 &&
    page.hasPreviousYear;

  const hasDateRange = Boolean(
    page.currentYear?.startDate && page.currentYear.endDate
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-3xl font-bold">Attendance</h1>
        <p className="text-muted-foreground mt-2">
          Each tick is saved as soon as you make it — there is no separate save
          step. Empty a period to record an absence for it, and add a reason to
          help the Principal decide on leave. A teacher absent for all{" "}
          {page.periods.length} periods is recorded as absent for the whole day.
        </p>
      </div>

      <AttendancePolicySection academicYear={page.currentYear} />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-wrap items-end gap-2">
            <Field className="w-24">
              <FieldLabel htmlFor="attendance-day">Day</FieldLabel>
              <Select
                value={String(page.day)}
                onValueChange={(value: string | null) => {
                  if (value) {
                    page.setDay(Number(value));
                  }
                }}
              >
                <SelectTrigger id="attendance-day">
                  <SelectValue placeholder="Day">
                    {(value: string | null) => value ?? "Day"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {page.dayOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={String(option.value)}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field className="w-40">
              <FieldLabel htmlFor="attendance-month">Month</FieldLabel>
              <Select
                value={String(page.month)}
                onValueChange={(value: string | null) => {
                  if (value) {
                    page.setMonth(Number(value));
                  }
                }}
              >
                <SelectTrigger id="attendance-month">
                  <SelectValue placeholder="Month">
                    {(value: string | null) =>
                      page.monthOptions.find(
                        (option) => String(option.value) === value
                      )?.label ?? "Month"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {page.monthOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={String(option.value)}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field className="w-28">
              <FieldLabel htmlFor="attendance-year">Calendar year</FieldLabel>
              <Select
                value={String(page.year)}
                onValueChange={(value: string | null) => {
                  if (value) {
                    page.setYear(Number(value));
                  }
                }}
              >
                <SelectTrigger id="attendance-year">
                  <SelectValue placeholder="Year">
                    {(value: string | null) => value ?? "Year"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {page.yearOptions.map((yearOption) => (
                      <SelectItem key={yearOption} value={String(yearOption)}>
                        {yearOption}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field className="w-64 sm:ml-auto">
            <FieldLabel htmlFor="attendance-filter">Filter teachers</FieldLabel>
            <div className="relative">
              <IconSearch className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                id="attendance-filter"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Search by name..."
                className="pl-8"
              />
            </div>
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={hasDateRange ? "outline" : "destructive"}>
            Academic year {page.currentYear?.year ?? "—"}
          </Badge>
          <p className="text-muted-foreground text-xs">
            {hasDateRange
              ? `Attendance dates are limited to ${formatDateRange(
                  page.currentYear?.startDate ?? "",
                  page.currentYear?.endDate ?? ""
                )}.`
              : "This year has no date range. Add its start and end dates to enforce attendance limits."}
          </p>
        </div>
      </div>

      {showImportBanner ? (
        <Empty className="min-h-[40vh] border-none">
          <EmptyTitle>No teachers for {page.currentYear?.year}</EmptyTitle>
          <EmptyDescription>
            This academic year has no teachers yet. Import them from the
            previous year to start marking attendance.
          </EmptyDescription>
          <EmptyContent>
            <Button onClick={() => setIsPortDialogOpen(true)}>
              <IconUsersPlus data-icon="inline-start" />
              Import from Previous Year
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <AttendanceGrid page={page} filter={filter} />
      )}

      <PortTeachersDialog
        isOpen={isPortDialogOpen}
        onOpenChange={setIsPortDialogOpen}
        academicYearId={page.currentYear?.id}
      />
    </div>
  );
};
