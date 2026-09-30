"use client";

import type { SessionUser } from "@school-student-teacher-management/api/context";
import { isAdminRole } from "@school-student-teacher-management/auth/roles";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@school-student-teacher-management/ui/components/dialog";
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
  IconSettings,
  IconUsersPlus,
} from "@tabler/icons-react";
import { useRouteContext } from "@tanstack/react-router";
import { useState } from "react";

import { AttendanceExcelImport } from "@/components/staff/attendance/attendance-excel-import";
import { AttendanceRegisterTable } from "@/components/staff/attendance/attendance-register-table";
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

/**
 * The policy's four load-bearing numbers, in the order somebody asks for them.
 *
 * These used to be a six-input form in a full-width card above the register,
 * which is the wrong shape twice over: it is a *school-wide setting* that most
 * visits to this page do not change, and it pushed the actual job — the register —
 * below the fold. So the numbers stay on the page at reading size, and the form
 * moved behind a button.
 *
 * Four, not six: the two period *ranges* are what people read ("which periods
 * make a half day"), and the starts and ends are shown separately only because a
 * number input cannot hold a range.
 */
const policyReadouts = (
  policy: NonNullable<AttendancePageApi["policy"]>
): [string, string][] => [
  ["Cut-off", policy.arrivalCutoffTime],
  ["Short leaves", `${policy.shortLeavesPerMonth}/mo`],
  [
    "Primary half-day",
    `P${policy.primaryStartPeriodNumber}–${policy.primaryEndPeriodNumber}`,
  ],
  [
    "Secondary half-day",
    `P${policy.secondaryStartPeriodNumber}–${policy.secondaryEndPeriodNumber}`,
  ],
];

/**
 * The labels alone, for the loading skeleton.
 *
 * Duplicated as literals rather than derived from `policyReadouts` because there is
 * no policy to read yet — that is the whole condition being rendered. One source
 * of truth for the *labels* would mean threading a null policy through a function
 * whose job is to format one.
 */
const policyReadoutLabels = [
  "Cut-off",
  "Short leaves",
  "Primary half-day",
  "Secondary half-day",
];

interface AttendancePolicyEditorProps {
  page: AttendancePageApi;
}

/**
 * The policy form, in a dialog, for the seat that may write it.
 *
 * A refused save keeps everything that was typed. The form is uncontrolled and
 * keyed on the policy's own `dataUpdatedAt`, so a failure — which changes
 * nothing on the server — cannot remount it and wipe the numbers someone has
 * just corrected.
 */
const AttendancePolicyForm = ({ page }: AttendancePolicyEditorProps) => {
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
    <form aria-busy={isSavingPolicy || undefined} onSubmit={handleSubmit}>
      {error ? (
        <div className="mb-3" id={POLICY_ERROR_ID} role="alert">
          <FieldError>{error}</FieldError>
        </div>
      ) : null}
      <FieldGroup className="grid gap-3 sm:grid-cols-2">
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
        Arrival, short leave, and half-day period rules for {currentYear.year}.
        School-wide: it decides what recording an arrival does. Half-days have
        no monthly allowance — two half-days count as one full leave day, and a
        third in the same month is recorded as a half day. The Primary block has
        to come before the Secondary block, and the two cannot overlap.
      </FieldDescription>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {policyUsage
            ? `Your short leaves: ${policyUsage.shortLeavesUsed} of ${policy.shortLeavesPerMonth} used this month.`
            : "This policy is school-wide."}
        </p>
        <Button disabled={isSavingPolicy} type="submit">
          {isSavingPolicy ? "Saving…" : "Save policy"}
        </Button>
      </div>
    </form>
  );
};

/**
 * The policy strip: the four numbers, then the button that opens the form.
 *
 * **One component for both tiers.** This used to be two — an editor card and a
 * summary card — because a read-only seat cannot be shown inputs it may not
 * submit, and `updatePolicy` is `adminOrAcademicProcedure`, so a Principal and
 * a Deputy were being refused every save. That reasoning is right about the
 * *form* and wrong about the *numbers*: the read tier and the write tier
 * describe one policy, and a Principal marking a register has exactly as much
 * use for "cut-off 08:00" as an administrator does. So both seats get the
 * same four figures, and only the two seats the server accepts get the button.
 *
 * The numbers are placed to the **left** of the button, deliberately: the question
 * this strip answers is "what are today's rules", and that is a reading task, not
 * a settings task. The button is the last thing on the line so it cannot be
 * mistaken for the strip's primary action.
 */
const AttendancePolicyStrip = ({
  canEdit,
  page,
}: AttendancePolicyEditorProps & { canEdit: boolean }) => {
  const { currentYear, policy } = page;
  const [isOpen, setIsOpen] = useState(false);

  if (!policy || !currentYear) {
    return null;
  }

  return (
    <div className="bg-card flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border px-4 py-2.5">
      <h2 className="font-heading text-sm font-medium">Policy</h2>
      <dl className="flex flex-wrap items-center gap-x-6 gap-y-1">
        {policyReadouts(policy).map(([label, value]) => (
          <div className="flex items-baseline gap-1.5" key={label}>
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="text-sm font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {canEdit ? (
        <Dialog onOpenChange={setIsOpen} open={isOpen}>
          <DialogTrigger
            render={
              <Button className="ml-auto" size="sm" variant="outline">
                <IconSettings data-icon="inline-start" />
                Settings
              </Button>
            }
          />
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Attendance policy</DialogTitle>
              <DialogDescription>
                Arrival, short leave, and half-day period rules for{" "}
                {currentYear.year}. School-wide, and it decides what recording
                an arrival does.
              </DialogDescription>
            </DialogHeader>
            {/* Keyed on the year, so switching years cannot leave the previous
                year's numbers in a form that saves to the new one. */}
            <AttendancePolicyForm key={currentYear.id} page={page} />
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
};

/**
 * `canEdit` is the server's own division, not a UI preference.
 *
 * `updatePolicy` is `adminOrAcademicProcedure` - `admin` plus `academicAdmin`,
 * two seats - while this card is mounted by every route that shows the
 * register (both admin workspaces and leadership's own attendance pages), so
 * the Deputy and the Principal were being handed the form and the Save button
 * that procedure refuses every time. The server is right and stays right; the
 * gate lives here so that nobody is invited to fail.
 */
const AttendancePolicyCard = ({
  canEdit,
  page,
}: AttendancePolicyEditorProps & { canEdit: boolean }) => {
  const { currentYear } = page;

  if (!currentYear || page.isLoadingPolicy) {
    // Four bars, not six inputs' worth of a card: the strip is a line of text, so
    // its loading state is a line of text too. A skeleton shaped like the old form
    // would make the page jump when the real strip arrives.
    return (
      <div
        aria-busy="true"
        className="flex flex-wrap items-center gap-6 rounded-lg border px-4 py-2.5"
      >
        <Skeleton className="h-4 w-14 motion-reduce:animate-none" />
        {policyReadoutLabels.map((label) => (
          <Skeleton
            className="h-4 w-24 motion-reduce:animate-none"
            key={label}
          />
        ))}
      </div>
    );
  }

  if (page.isErrorPolicy) {
    return (
      <div className="border-destructive/40 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5">
        <p className="text-sm">
          The policy for {currentYear.year} could not be read
          {page.errorPolicy ? `: ${page.errorPolicy.message}` : "."} Until it
          loads, recording an arrival cannot say what it will record.
        </p>
        <Button
          className="ml-auto"
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
      </div>
    );
  }

  if (!page.policy) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-4 py-2.5">
        <p className="text-sm">
          <span className="font-medium">Policy not set</span> for{" "}
          {currentYear.year}. The register cannot be read for any date until the
          arrival cut-off and the half-day ranges exist.
          {canEdit ? null : " The administrator sets them."}
        </p>
        {/* Seeding the row is the same `updatePolicy` write as the form in the
            dialog, so it is the administrator's button too. */}
        {canEdit ? (
          <Button
            className="ml-auto"
            disabled={page.isSavingPolicy}
            onClick={() => {
              void page.configureDefaultPolicy();
            }}
            size="sm"
            type="button"
          >
            {page.isSavingPolicy ? "Configuring…" : "Set default policy"}
          </Button>
        ) : null}
      </div>
    );
  }

  return <AttendancePolicyStrip canEdit={canEdit} page={page} />;
};

interface AttendancePageContentProps {
  academicYear: number;
}

/**
 * The policy section, gated on the role the authed shell already resolved.
 *
 * Two tiers meet here, and they are not the same set.
 *
 * - **Read** — `isAdminRole` (`admin`, `principal`, `vicePrincipal`) **plus**
 *   `academicAdmin`. The policy lives behind `academicProcedure`
 *   (`packages/api/src/index.ts`: `ADMIN_ROLES` plus the Academic
 *   Administrator), which is also the tier the three routes mounting
 *   `AttendancePageContent` are guarded to — so this is exactly the set that
 *   can load the page at all, and `isAdminRole` alone would hide the card
 *   from the Academic Administrator standing in front of it.
 * - **Write** — the same two roles `adminOrAcademicProcedure` admits: `admin`
 *   and `academicAdmin`. Leadership reads the policy and never edits it,
 *   which is why `isAdminRole` on its own is the *wrong* gate: it would hand
 *   the form to exactly the two seats the server refuses.
 *
 * The gate is here, in the UI, only so that a Deputy is not invited to fill in
 * a school-wide form and be told no. `adminOrAcademicProcedure` stays as it is.
 */
const AttendancePolicySection = ({ page }: { page: AttendancePageApi }) => {
  const { session } = useRouteContext({ from: "/_auth" });
  const role = (session?.user as SessionUser | undefined)?.role;

  const canReadPolicy = isAdminRole(role) || role === "academicAdmin";
  const canEditPolicy = role === "admin" || role === "academicAdmin";

  if (!canReadPolicy) {
    return null;
  }

  return <AttendancePolicyCard canEdit={canEditPolicy} page={page} />;
};

export const AttendancePageContent = ({
  academicYear,
}: AttendancePageContentProps) => {
  const page = useAttendancePage(academicYear);

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
            One row per teacher, grouped by highest qualification. Mark a whole
            day from the row menu, record a remark, or re-mark a day that was
            already written down. Changes save immediately — no separate save
            step. A teacher absent for every scheduled period that day is
            treated as absent for the whole day.
          </>
        }
      />

      <AttendancePolicySection page={page} />

      <div className="bg-card flex flex-wrap items-end gap-4 rounded-lg border px-4 py-3">
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
                    <SelectItem key={option.value} value={String(option.value)}>
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
                    <SelectItem key={option.value} value={String(option.value)}>
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
        <div className="ml-auto flex flex-wrap items-end gap-2">
          <AttendanceExcelImport
            academicYearId={page.currentYear?.id}
            date={page.date}
            onImported={() => {
              void page.refetchAttendance();
            }}
            teachers={page.teachers}
          />
        </div>
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
        <AttendanceRegisterTable page={page} />
      )}

      <PortTeachersDialog
        academicYearId={page.currentYear?.id}
        isOpen={isPortDialogOpen}
        onOpenChange={setIsPortDialogOpen}
      />
    </div>
  );
};
