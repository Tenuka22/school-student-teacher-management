"use client";

import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Card,
  CardContent,
} from "@school-student-teacher-management/ui/components/card";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import { Input } from "@school-student-teacher-management/ui/components/input";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { QueryErrorPanel } from "@/components/query-error-panel";
import { TeacherSubjectAssignments } from "@/components/staff/teacher-management/teacher-subject-assignments";
import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

/**
 * Teacher self-service profile: read-only admin-verified fields plus a
 * phone number the teacher can update themselves (matches the
 * `updateProfile` procedure's scope).
 */
export const MyProfileContent = () => {
  const queryClient = useQueryClient();
  const { year } = useParams({ from: "/_auth/teacher/$year" });
  const myStaffQuery = useQuery(orpc.staff.getMyStaff.queryOptions());
  const academicYearsQuery = useQuery(
    orpc.staff.listAcademicYears.queryOptions()
  );
  const academicYearId = useMemo(() => {
    const years = academicYearsQuery.data as
      | { id: string; year: number }[]
      | undefined;
    return years?.find((academicYear) => academicYear.year === Number(year))
      ?.id;
  }, [academicYearsQuery.data, year]);
  const profile = myStaffQuery.data?.profile;

  const [phone, setPhone] = useState("");
  const [syncedProfileId, setSyncedProfileId] = useState<string | null>(null);

  // Seed the form once the profile query resolves (per loaded profile id) —
  // derived state during render would reset edits on every refetch.
  if (profile && profile.id !== syncedProfileId) {
    setSyncedProfileId(profile.id);
    setPhone(profile.phone ?? "");
  }

  const updateMutation = useMutation(
    orpc.staff.updateProfile.mutationOptions({
      onSuccess: async () => {
        toast.success("Profile updated");
        await queryClient.invalidateQueries({
          queryKey: orpc.staff.getMyStaff.queryOptions().queryKey,
        });
      },
      onError: (error) => {
        toast.error(error.message);
      },
    })
  );

  if (myStaffQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  /**
   * "No staff profile is linked to your account" is a fact about the account,
   * and a failed request knows nothing about it. The old `!profile` branch
   * printed that sentence on a 500 or a refused permission, telling a teacher
   * their account was not linked when the truth was that nobody had answered.
   * Pending and failed both return above, so what is left here is a request
   * that succeeded — and only a successful request may say the profile is
   * missing.
   */
  if (myStaffQuery.isError) {
    return (
      <QueryErrorPanel
        message={formatApiErrorMessage(
          myStaffQuery.error,
          "The server did not return your staff record."
        )}
        onRetry={() => {
          void myStaffQuery.refetch();
        }}
        title="Your profile could not be loaded"
      />
    );
  }

  if (!profile) {
    return (
      <div className="text-muted-foreground py-16 text-center text-sm">
        No staff profile is linked to your account. Ask the administration to
        link it.
      </div>
    );
  }

  const detailRows: [string, string][] = [
    ["Name", profile.name],
    ["Badge number", profile.teacherServiceNo ?? "—"],
    ["Email", profile.email ?? "—"],
    ["NIC", profile.nic ?? "—"],
    [
      "Employment status",
      profile.employmentStatus
        ? profile.employmentStatus.charAt(0).toUpperCase() +
          profile.employmentStatus.slice(1)
        : "—",
    ],
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-4xl font-semibold">My Profile</h1>
        <p className="text-muted-foreground mt-2">
          Your staff record as verified by the administration. Contact the
          office to correct name, email or employment details.
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <dl className="grid gap-x-8 gap-y-3 text-sm md:grid-cols-2">
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
        </CardContent>
      </Card>

      {academicYearId && (
        <TeacherSubjectAssignments
          staffId={profile.id}
          academicYearId={academicYearId}
          editable={false}
        />
      )}

      <Card>
        <CardContent className="p-6">
          <h2 className="mb-1 font-semibold">Contact details</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            You can keep your phone number up to date yourself.
          </p>
          <Field className="max-w-sm">
            <FieldLabel htmlFor="my-phone">Phone</FieldLabel>
            <Input
              id="my-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+947XXXXXXXX"
            />
            <FieldDescription>
              Sri Lankan mobile number, normalized to +94 format
            </FieldDescription>
          </Field>
          <Button
            className="mt-4"
            disabled={
              updateMutation.isPending || phone === (profile.phone ?? "")
            }
            onClick={() =>
              updateMutation.mutate({
                phone: phone.trim() || undefined,
                portraitFileId: undefined,
              })
            }
          >
            {updateMutation.isPending ? "Saving..." : "Save Phone Number"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
