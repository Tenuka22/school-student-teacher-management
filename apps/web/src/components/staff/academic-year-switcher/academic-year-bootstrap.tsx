import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@school-student-teacher-management/ui/components/card";
import { IconCalendarPlus } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

import type { AcademicYearFormSubmitData } from "./academic-year-form";
import { AcademicYearForm } from "./academic-year-form";

/**
 * Full-page takeover shown when the school has never created an academic
 * year. Nothing in the app is scoped meaningfully without one — every
 * staff-management page filters by the current year — so this blocks
 * access to everything under `/dashboard` until the first year exists.
 */
export const AcademicYearBootstrap = () => {
  const queryClient = useQueryClient();
  const createMutation = useMutation(
    orpc.staff.createAcademicYear.mutationOptions()
  );

  const handleSubmit = async (data: AcademicYearFormSubmitData) => {
    await createMutation.mutateAsync(data as never);
    await queryClient.invalidateQueries();
    toast.success(`Academic year ${data.year} created and activated`);
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="bg-primary text-primary-foreground mb-2 flex size-10 items-center justify-center rounded-lg">
            <IconCalendarPlus className="size-5" />
          </div>
          <CardTitle>Create your first academic year</CardTitle>
          <CardDescription>
            Every part of staff management — classes, subjects, periods — is
            scoped to an academic year. Create one to get started; it will
            become the active year automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <AcademicYearForm
            formId="bootstrap-academic-year-form"
            existingYears={[]}
            referenceYear={new Date().getFullYear()}
            isLoading={createMutation.isPending}
            isBootstrap
            onSubmit={handleSubmit}
          />
          <Button
            type="submit"
            form="bootstrap-academic-year-form"
            className="w-full"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Creating..." : "Create Academic Year"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
