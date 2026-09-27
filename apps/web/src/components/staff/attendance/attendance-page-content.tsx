"use client";

import type { SessionUser } from "@school-student-teacher-management/api/context";
import {
  isAdminRole,
  isLeadershipRole,
} from "@school-student-teacher-management/auth/roles";
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
  FieldError,
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
import {
  IconCalendar,
  IconRefresh,
  IconSearch,
  IconUsersPlus,
  IconX,
} from "@tabler/icons-react";
import { useRouteContext } from "@tanstack/react-router";
import { useState } from "react";

import { AttendanceGrid } from "@/components/staff/attendance/attendance-grid";
import type {
  AttendancePolicyValues,
  AttendancePageApi,
} from "@/components/staff/attendance/use-attendance-page";
import { useAttendancePage } from "@/components/staff/attendance/use-attendance-page";
import { PortTeachersDialog } from "@/components/staff/teacher-management/port-teachers-dialog";
import { PageHeader } from "@/components/ui-patterns/page-header";

const POLICY_FIELDS: {
  name: keyof AttendancePolicyValues;
  label: string;
  type: "time" | "number";
  min?: number;
  max?: number;
}[] = [
  {
    name: "arrivalCutoffTime",
    label: "Arrival cut-off",
    type: "time",
  },
  {
    name: "shortLeavesPerMonth",
    label: "Short leaves / month",
    type: "number",
    min: 0,
    max: 31,
  },
  {
    name: "primaryStartPeriodNumber",
    label: "Primary range starts",
    type: "number",
    min: 1,
    max: 8,
  },
  {
    name: "primaryEndPeriodNumber",
    label: "Primary range ends",
    type: "number",
    min: 1,
    max: 8,
  },
  {
    name: "secondaryStartPeriodNumber",
    label: "Secondary range starts",
    type: "number",
    min: 1,
    max: 8,
  },
  {
    name: "secondaryEndPeriodNumber",
    label: "Secondary range ends",
    type: "number",
    min: 1,
    max: 8,
  },
];

/** The four inputs the block rule is about, so the error lands on them. */
const PERIOD_RANGE_FIELDS = new Set<keyof AttendancePolicyValues>([
  "primaryStartPeriodNumber",
  "primaryEndPeriodNumber",
  "secondaryStartPeriodNumber",
  "secondaryEndPeriodNumber",
]);

const POLICY_ERROR_ID = "attendance-policy-error";

interface AttendancePolicyEditorProps {
  page: AttendancePageApi;
}

/**
 * The policy form, for the seat that may write it.
 *
 * A refused save keeps everything that was typed. The form is uncontrolled and
 * keyed on the policy's own `dataUpdatedAt`, so a failure — which changes
 * nothing on the server — cannot remount it and wipe the numbers someone has
 * just corrected.
 */
const AttendancePolicyEditor = ({ page }: AttendancePolicyEditorProps) => {
  const [error, setError] = useState<string | null>(null);
  const { policy, policyUsage, currentYear, isSavingPolicy } = page;

  if (!policy || !currentYear) {
    return null;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSavingPolicy) {
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    const values = Object.fromEntries(
      POLICY_FIELDS.map((field) => [
        field.name,
        field.type === "time"
          ? String(formData.get(field.name))
          : Number(formData.get(field.name)),
      ])
    ) as unknown as AttendancePolicyValues;
    setError(null);
    const saved = await page.savePolicy(values);
    if (!saved) {
      setError(
        page.lastPolicyError ??
          "The policy was not saved. Everything on this form is still yours — correct it and save again."
      );
    }
  };

  return (
    <Card className="w-full" size="sm">
      <form aria-busy={isSavingPolicy || undefined} onSubmit={handleSubmit}>
        <CardHeader className="border-b">
          <CardTitle>
            <h2 className="font-heading text-sm font-medium">
              Attendance policy
            </h2>
          </CardTitle>
          <CardDescription>
            Arrival, short leave, and half-day period rules for{" "}
            {currentYear.year}. School-wide: it decides what recording an
            arrival does.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="mb-3" id={POLICY_ERROR_ID} role="alert">
              <FieldError>{error}</FieldError>
            </div>
          ) : null}
          <FieldGroup className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {POLICY_FIELDS.map((field) => {
              const inputId = `attendance-policy-${field.name}`;
              const describedByPeriodRange =
                error && PERIOD_RANGE_FIELDS.has(field.name)
                  ? POLICY_ERROR_ID
                  : undefined;
              return (
                <Field key={field.name}>
                  <FieldLabel htmlFor={inputId}>{field.label}</FieldLabel>
                  <Input
                    aria-describedby={describedByPeriodRange}
                    defaultValue={policy[field.name]}
                    disabled={isSavingPolicy}
                    id={inputId}
                    max={field.max}
                    min={field.min}
                    name={field.name}
                    required
                    step="1"
                    type={field.type}
                  />
                </Field>
              );
            })}
          </FieldGroup>
          <FieldDescription className="mt-3">
            Half-days have no monthly allowance. Two half-days count as one full
            leave day; a third in the same month is recorded as a half day. The
            Primary block has to come before the Secondary block, and the two
            cannot overlap.
          </FieldDescription>
        </CardContent>
        <CardFooter className="flex-wrap justify-between gap-3">
          <div>
            <p className="font-medium">Your short leaves this month</p>
            <p className="text-muted-foreground">
              {policyUsage
                ? `${policyUsage.shortLeavesUsed} of ${policy.shortLeavesPerMonth} used on your own record`
                : "This policy is school-wide; the count here is your own usage, not the whole staff."}
            </p>
          </div>
          <Button
            className="min-w-32"
            disabled={isSavingPolicy}
            size="sm"
            type="submit"
          >
            {isSavingPolicy ? "Saving…" : "Save policy"}
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
const AttendancePolicySummary = ({ page }: AttendancePolicyEditorProps) => {
  const { currentYear, policy, policyUsage } = page;
  if (!policy || !currentYear) {
    return null;
  }
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
    <Card className="w-full" size="sm">
      <CardHeader className="border-b">
        <CardTitle>
          <h2 className="font-heading text-sm font-medium">
            Attendance policy
          </h2>
        </CardTitle>
        <CardDescription>
          Arrival, short leave, and half-day period rules for {currentYear.year}
          . Read-only — the administrator sets these.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
          {detailRows.map(([label, value]) => (
            <div
              className="flex justify-between gap-4 border-b pb-2"
              key={label}
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium tabular-nums">{value}</dd>
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
          {policyUsage
            ? `Your short leaves this month: ${policyUsage.shortLeavesUsed} of ${policy.shortLeavesPerMonth} used on your own record.`
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
  canEdit,
  page,
}: AttendancePolicyEditorProps & { canEdit: boolean }) => {
  const { currentYear } = page;

  if (!currentYear || page.isLoadingPolicy) {
    return (
      <Card size="sm">
        <CardHeader className="border-b">
          <CardTitle>
            <h2 className="font-heading text-sm font-medium">
              Attendance policy
            </h2>
          </CardTitle>
          <CardDescription>Loading this year&rsquo;s policy…</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {POLICY_FIELDS.map((field) => (
            <Skeleton
              className="h-8 motion-reduce:animate-none"
              key={field.name}
            />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (page.isErrorPolicy) {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle>
            <h2 className="font-heading text-sm font-medium">
              Attendance policy
            </h2>
          </CardTitle>
          <CardDescription>
            The policy for {currentYear.year} could not be read
            {page.errorPolicy ? `: ${page.errorPolicy.message}` : "."} Until it
            loads, recording an arrival cannot say what it will record.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => {
              page.refetchPolicy();
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <IconRefresh data-icon="inline-start" />
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!page.policy) {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle>
            <h2 className="font-heading text-sm font-medium">
              Attendance policy
            </h2>
          </CardTitle>
          <CardDescription>
            Arrival, short leave, and half-day period rules for{" "}
            {currentYear.year}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Empty className="min-h-32 border-none py-2">
            <EmptyTitle>Attendance policy not configured</EmptyTitle>
            <EmptyDescription>
              {canEdit
                ? "Configure the arrival cut-off, short-leave allowance, and Primary/Secondary period ranges for this academic year. The register cannot be read for any date until it exists."
                : "The arrival cut-off, short-leave allowance and Primary/Secondary period ranges are not set for this academic year, and the register cannot be read for any date until they are. The administrator sets them."}
            </EmptyDescription>
            {/* Seeding the row is the same `updatePolicy` write as the form
                below, so it is the administrator's button too. */}
            {canEdit ? (
              <EmptyContent>
                <Button
                  disabled={page.isSavingPolicy}
                  onClick={() => {
                    void page.configureDefaultPolicy();
                  }}
                  size="sm"
                  type="button"
                >
                  {page.isSavingPolicy
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
    <AttendancePolicyEditor key={currentYear.id} page={page} />
  ) : (
    <AttendancePolicySummary page={page} />
  );
};

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
 *   server refuses. The write tier is the admin set minus leadership, which is
 *   the same reading `academic-year-gate.tsx` makes for `setCurrentYear`.
 *
 * The gate is here, in the UI, only so that a Deputy is not invited to fill in
 * a school-wide form and be told no. `adminOnlyProcedure` stays as it is.
 */
const AttendancePolicySection = ({ page }: { page: AttendancePageApi }) => {
  const { session } = useRouteContext({ from: "/_auth" });
  const role = (session?.user as SessionUser | undefined)?.role;

  const canReadPolicy = isAdminRole(role);
  const canEditPolicy = isAdminRole(role) && !isLeadershipRole(role);

  if (!canReadPolicy) {
    return null;
  }

  return <AttendancePolicyCard canEdit={canEditPolicy} page={page} />;
};

export const AttendancePageContent = ({
  academicYear,
}: AttendancePageContentProps) => {
  const page = useAttendancePage(academicYear);
  const [filter, setFilter] = useState("");
  const [isPortDialogOpen, setIsPortDialogOpen] = useState(false);
  const showImportBanner =
    page.registerState === "ready" &&
    page.teachers.length === 0 &&
    page.hasPreviousYear;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Staff management"
        title="Attendance"
        description={
          <>
            Tick a period off to mark that teacher absent for it (with a reason)
            - saves immediately, no separate save step. A teacher absent for
            every scheduled period that day is treated as absent for the whole
            day.
          </>
        }
      />

      <AttendancePolicySection page={page} />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-wrap items-end gap-2">
            <Field className="w-24">
              <FieldLabel htmlFor="attendance-day">Day</FieldLabel>
              <Select
                onValueChange={(value: string | null) => {
                  if (value) {
                    page.setDay(Number(value));
                  }
                }}
                value={String(page.day)}
              >
                <SelectTrigger id="attendance-day">
                  <SelectValue placeholder="Day" />
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
                onValueChange={(value: string | null) => {
                  if (value) {
                    page.setMonth(Number(value));
                  }
                }}
                value={String(page.month)}
              >
                <SelectTrigger id="attendance-month">
                  <SelectValue placeholder="Month" />
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
                onValueChange={(value: string | null) => {
                  if (value) {
                    page.setYear(Number(value));
                  }
                }}
                value={String(page.year)}
              >
                <SelectTrigger id="attendance-year">
                  <SelectValue placeholder="Year" />
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
            <Button
              disabled={page.isToday}
              onClick={() => page.setDate(page.todayIso)}
              size="sm"
              type="button"
              variant="outline"
            >
              <IconCalendar data-icon="inline-start" />
              Today
            </Button>
          </div>

          <Field className="w-72 sm:ml-auto">
            <FieldLabel htmlFor="attendance-filter">Filter teachers</FieldLabel>
            <div className="flex items-end gap-2">
              <div className="relative flex-1">
                <IconSearch
                  aria-hidden="true"
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                />
                <Input
                  aria-describedby="attendance-filter-hint"
                  className="pl-8"
                  id="attendance-filter"
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Search by name…"
                  value={filter}
                />
              </div>
              {filter ? (
                <Button
                  aria-label="Clear the teacher search"
                  onClick={() => setFilter("")}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <IconX data-icon="inline-start" />
                  Clear
                </Button>
              ) : null}
            </div>
            <FieldDescription id="attendance-filter-hint">
              Searches the {page.summary.onRoll} teachers on this year&apos;s
              roll. The register&apos;s own row filter is above the grid.
            </FieldDescription>
          </Field>
        </div>

        <Field className="w-64 sm:ml-auto">
          <FieldLabel htmlFor="attendance-filter">Filter teachers</FieldLabel>
          <div className="relative">
            <IconSearch
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            />
            <Input
              id="attendance-filter"
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search by teacher name"
              className="pl-8"
            />
          </div>
        </Field>
      </div>

      {showImportBanner ? (
        <Empty className="min-h-[40vh] border-none">
          <EmptyTitle>No teachers for {page.currentYear?.year}</EmptyTitle>
          <EmptyDescription>
            This academic year has no teaching staff yet. Import them from the
            previous year to start marking attendance.
          </EmptyDescription>
          <EmptyContent>
            <Button onClick={() => setIsPortDialogOpen(true)}>
              <IconUsersPlus className="mr-2 size-4" />
              Import from previous year
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <AttendanceGrid
          filter={filter}
          onClearFilters={() => setFilter("")}
          page={page}
        />
      )}

      <PortTeachersDialog
        academicYearId={page.currentYear?.id}
        isOpen={isPortDialogOpen}
        onOpenChange={setIsPortDialogOpen}
      />
    </div>
  );
};
