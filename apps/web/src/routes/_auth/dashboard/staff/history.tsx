import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Card,
  CardContent,
} from "@school-student-teacher-management/ui/components/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { downloadExportFile } from "@/lib/download-export";
import { orpc } from "@/utils/orpc";

interface AcademicYear {
  id: string;
  year: number;
  isCurrent: boolean;
}
interface StaffPosition {
  id: string;
  staffId: string;
  position: string;
}
const RouteComponent = () => {
  const yearsQuery = useQuery(orpc.staff.listAcademicYears.queryOptions());
  const [selectedYear, setSelectedYear] = useState<string>("");

  const years = useMemo(() => {
    const data = yearsQuery.data as unknown[] | undefined;
    if (!data) {
      return [];
    }
    return [...(data || [])].toSorted(
      (a: unknown, b: unknown) =>
        ((b as Record<string, unknown>).year as number) -
        ((a as Record<string, unknown>).year as number)
    ) as AcademicYear[];
  }, [yearsQuery.data]);

  const staffPositionsQuery = useQuery(
    orpc.staff.listStaffPositions.queryOptions({
      input: { academicYearId: selectedYear ?? "", staffId: undefined },
      enabled: !!selectedYear,
    })
  );

  const staffQuery = useQuery(orpc.staff.listStaff.queryOptions());

  const exportStaffPositionsMutation = useMutation(
    orpc.staff.exports.staffPositionsExcel.mutationOptions()
  );

  const handleExportStaffPositions = async () => {
    if (!selectedYear) {
      return;
    }
    try {
      const file = await exportStaffPositionsMutation.mutateAsync({
        academicYearId: selectedYear,
      } as never);
      downloadExportFile(file);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to export positions"
      );
    }
  };

  const staffMap = useMemo(() => {
    const map = new Map<string, { name: string; id: string }>();
    const staff = staffQuery.data as unknown[] | undefined;
    if (staff) {
      for (const s of staff) {
        const member = s as Record<string, unknown>;
        map.set(member.id as string, {
          name: member.name as string,
          id: member.id as string,
        });
      }
    }
    return map;
  }, [staffQuery.data]);

  const staffPositionsData = useMemo(() => {
    const data = staffPositionsQuery.data as unknown[] | undefined;
    return (data || []) as StaffPosition[];
  }, [staffPositionsQuery.data]);

  const renderStaffPositionsContent = () => {
    if (staffPositionsQuery.isLoading) {
      return (
        <div className="text-muted-foreground text-center">Loading...</div>
      );
    }
    if (staffPositionsData.length === 0) {
      return <div className="text-muted-foreground text-center">No data</div>;
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Staff Name</TableHead>
            <TableHead>Position</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {staffPositionsData.map((position) => (
            <TableRow key={position.id}>
              <TableCell>
                {staffMap.get(position.staffId)?.name || "Unknown"}
              </TableCell>
              <TableCell>{position.position}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Historical Data</h1>
          <p className="text-muted-foreground">
            View historical records for selected year
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="w-40">
          <Select
            value={selectedYear}
            onValueChange={(value: string | null) =>
              setSelectedYear(value ?? "")
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select year" />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year.id} value={year.id}>
                  {year.year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Staff Positions</h2>
            <Button
              onClick={handleExportStaffPositions}
              disabled={!selectedYear || exportStaffPositionsMutation.isPending}
              variant="outline"
              size="sm"
            >
              Export
            </Button>
          </div>
          {renderStaffPositionsContent()}
        </CardContent>
      </Card>
    </div>
  );
};

export const Route = createFileRoute("/_auth/dashboard/staff/history")({
  component: RouteComponent,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        orpc.staff.listAcademicYears.queryOptions()
      ),
      context.queryClient.ensureQueryData(orpc.staff.listStaff.queryOptions()),
    ]);
  },
});
