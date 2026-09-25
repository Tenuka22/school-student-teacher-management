"use client";

import { subjectLabel } from "@school-student-teacher-management/db/constants/display";
import { leaveTypeLabel } from "@school-student-teacher-management/db/constants/leave-labels";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@school-student-teacher-management/ui/components/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@school-student-teacher-management/ui/components/tabs";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { format } from "date-fns";

import { orpc } from "@/utils/orpc";

interface HistoricalData {
  staff: {
    id: string;
    name: string;
    teacherServiceNo: string | null;
    positions: {
      id: string;
      position: string;
      sectionalScope: string | null;
    }[];
  }[];
  subjects: {
    id: string;
    staffId: string;
    staffName: string;
    subjectKey: string;
  }[];
  timetables: {
    id: string;
    classId: string;
    className: string;
    gradeLevel: number;
    staffId: string;
    staffName: string;
    dayOfWeek: number;
    periodNumber: number;
    subjectKey: string;
  }[];
  homeroomHistory: {
    id: string;
    className: string;
    gradeLevel: number;
    previousTeacherName: string | null;
    newTeacherName: string | null;
    changeType: string;
    reason: string | null;
    note: string | null;
    changedAt: string;
  }[];
  leaveDecisions: {
    id: string;
    staffId: string;
    staffName: string;
    type: string;
    startDate: string;
    endDate: string;
    dayPart: string;
    paymentStatus: string;
    reason: string | null;
    status: string;
    deputyStatus: string;
    deputyComment: string | null;
    finalStatus: string;
    principalComment: string | null;
    finalizedAt: string | null;
    createdAt: string;
  }[];
  attendanceExceptions: {
    id: string;
    staffId: string;
    staffName: string;
    date: string;
    status: string;
    reason: string | null;
    leaveRequestId: string | null;
    absentPeriods: { periodNumber: number; reason: string }[];
  }[];
}

const formatDate = (value: string) =>
  format(new Date(`${value}T00:00:00`), "d MMM yyyy");

const formatDateTime = (value: string) =>
  format(new Date(value), "d MMM yyyy, HH:mm");

const formatLeaveDescription = (
  type: string,
  dayPart: string,
  paymentStatus: string
) => {
  let duration = "Full day";
  if (dayPart === "morning") {
    duration = "First half (Primary)";
  } else if (dayPart === "afternoon") {
    duration = "Second half (Secondary)";
  }
  if (type !== "maternity" || paymentStatus === "notApplicable") {
    return duration;
  }
  const payment = paymentStatus === "paid" ? "Paid" : "Unpaid";
  return `${duration} Â· ${payment}`;
};

const StatusBadge = ({ status }: { status: string }) => {
  const normalized = status.toLowerCase();
  let variant: "default" | "destructive" | "secondary" | "outline" = "outline";

  if (normalized === "approved") {
    variant = "default";
  } else if (normalized === "rejected" || normalized === "absent") {
    variant = "destructive";
  } else if (normalized === "pending") {
    variant = "secondary";
  }

  return (
    <Badge variant={variant}>
      {status.replaceAll(/(?<upper>[A-Z])/gu, " $<upper>")}
    </Badge>
  );
};

const HistoryEmpty = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => (
  <Empty className="min-h-48 border border-dashed">
    <EmptyTitle>{title}</EmptyTitle>
    <EmptyDescription>{description}</EmptyDescription>
  </Empty>
);

const StaffHistory = ({ rows }: { rows: HistoricalData["staff"] }) => (
  <TabsContent value="staff" className="pt-4">
    {rows.length === 0 ? (
      <HistoryEmpty
        title="No staff records"
        description="No staff activity was recorded for this academic year."
      />
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Staff member</TableHead>
            <TableHead>Service number</TableHead>
            <TableHead>Positions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.name}</TableCell>
              <TableCell className="font-mono">
                {row.teacherServiceNo ?? "â€”"}
              </TableCell>
              <TableCell>
                {row.positions.length > 0
                  ? row.positions
                      .map((position) => position.position)
                      .join(", ")
                  : "No recorded position"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )}
  </TabsContent>
);

const SubjectHistory = ({ rows }: { rows: HistoricalData["subjects"] }) => (
  <TabsContent value="subjects" className="pt-4">
    {rows.length === 0 ? (
      <HistoryEmpty
        title="No teacher subjects"
        description="No teacher subject assignments were recorded for this academic year."
      />
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Teacher</TableHead>
            <TableHead>Subject</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.staffName}</TableCell>
              <TableCell>{subjectLabel(row.subjectKey)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )}
  </TabsContent>
);

const TimetableHistory = ({ rows }: { rows: HistoricalData["timetables"] }) => (
  <TabsContent value="timetables" className="pt-4">
    {rows.length === 0 ? (
      <HistoryEmpty
        title="No timetable assignments"
        description="No class or teacher timetable assignments were recorded for this academic year."
      />
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Class</TableHead>
            <TableHead>Grade</TableHead>
            <TableHead>Day</TableHead>
            <TableHead>Period</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Teacher</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.className}</TableCell>
              <TableCell>Grade {row.gradeLevel}</TableCell>
              <TableCell>
                {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"][
                  row.dayOfWeek - 1
                ] ?? `Day ${row.dayOfWeek}`}
              </TableCell>
              <TableCell>Period {row.periodNumber}</TableCell>
              <TableCell>{subjectLabel(row.subjectKey)}</TableCell>
              <TableCell>{row.staffName}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )}
  </TabsContent>
);

const HomeroomHistory = ({
  rows,
}: {
  rows: HistoricalData["homeroomHistory"];
}) => (
  <TabsContent value="homerooms" className="pt-4">
    {rows.length === 0 ? (
      <HistoryEmpty
        title="No homeroom changes"
        description="No homeroom assignment changes were recorded for this academic year."
      />
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Class</TableHead>
            <TableHead>Change</TableHead>
            <TableHead>Previous teacher</TableHead>
            <TableHead>New teacher</TableHead>
            <TableHead>Changed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">
                {row.className} Â· Grade {row.gradeLevel}
              </TableCell>
              <TableCell>
                <StatusBadge status={row.changeType} />
              </TableCell>
              <TableCell>{row.previousTeacherName ?? "â€”"}</TableCell>
              <TableCell>{row.newTeacherName ?? "â€”"}</TableCell>
              <TableCell>{formatDateTime(row.changedAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )}
  </TabsContent>
);

const LeaveHistory = ({ rows }: { rows: HistoricalData["leaveDecisions"] }) => (
  <TabsContent value="leaves" className="pt-4">
    {rows.length === 0 ? (
      <HistoryEmpty
        title="No leave records"
        description="No leave requests were recorded for this academic year."
      />
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Staff member</TableHead>
            <TableHead>Leave</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead>Deputy</TableHead>
            <TableHead>Principal</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.staffName}</TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <span>{leaveTypeLabel(row.type)}</span>
                  <span className="text-muted-foreground text-xs">
                    {formatLeaveDescription(
                      row.type,
                      row.dayPart,
                      row.paymentStatus
                    )}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                {formatDate(row.startDate)} â€“ {formatDate(row.endDate)}
              </TableCell>
              <TableCell>
                <StatusBadge status={row.deputyStatus} />
              </TableCell>
              <TableCell>
                <StatusBadge status={row.finalStatus} />
                {row.finalStatus === "approved" && row.finalizedAt ? (
                  <span className="text-muted-foreground ml-2 text-xs">
                    {formatDateTime(row.finalizedAt)}
                  </span>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )}
  </TabsContent>
);

const AttendanceHistory = ({
  rows,
}: {
  rows: HistoricalData["attendanceExceptions"];
}) => (
  <TabsContent value="attendance" className="pt-4">
    {rows.length === 0 ? (
      <HistoryEmpty
        title="No attendance exceptions"
        description="No absence, partial-day or late-arrival exceptions were recorded for this academic year."
      />
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Staff member</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Periods</TableHead>
            <TableHead>Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.staffName}</TableCell>
              <TableCell>{formatDate(row.date)}</TableCell>
              <TableCell>
                <StatusBadge status={row.status} />
                {row.leaveRequestId ? (
                  <Badge variant="outline" className="ml-2">
                    Approved leave
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell>
                {row.absentPeriods.length > 0
                  ? row.absentPeriods
                      .map((period) => `P${period.periodNumber}`)
                      .join(", ")
                  : "All periods"}
              </TableCell>
              <TableCell className="max-w-80 whitespace-normal">
                {row.reason ?? "â€”"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )}
  </TabsContent>
);

const HistoryTabs = ({ data }: { data: HistoricalData }) => (
  <Tabs defaultValue="staff">
    <TabsList
      variant="line"
      className="border-primary/18 h-auto w-full flex-wrap justify-start gap-0.5 rounded-none border-b p-0"
    >
      <TabsTrigger value="staff">Staff &amp; positions</TabsTrigger>
      <TabsTrigger value="subjects">Teacher subjects</TabsTrigger>
      <TabsTrigger value="timetables">
        Class &amp; teacher timetables
      </TabsTrigger>
      <TabsTrigger value="homerooms">Homeroom history</TabsTrigger>
      <TabsTrigger value="leaves">Leave decisions</TabsTrigger>
      <TabsTrigger value="attendance">Attendance exceptions</TabsTrigger>
    </TabsList>
    <StaffHistory rows={data.staff} />
    <SubjectHistory rows={data.subjects} />
    <TimetableHistory rows={data.timetables} />
    <HomeroomHistory rows={data.homeroomHistory} />
    <LeaveHistory rows={data.leaveDecisions} />
    <AttendanceHistory rows={data.attendanceExceptions} />
  </Tabs>
);

const HistoricalDataPage = () => {
  const { year } = useParams({
    from: "/_auth/admin/$year/staff/historical-data",
  });
  const yearNumber = Number(year);
  const yearsQuery = useQuery(orpc.staff.listAcademicYears.queryOptions());
  const academicYear = yearsQuery.data?.find(
    (candidate) => candidate.year === yearNumber
  );
  const historyQuery = useQuery({
    ...orpc.staff.getHistoricalData.queryOptions({
      input: { academicYearId: academicYear?.id ?? "" },
    }),
    enabled: Boolean(academicYear?.id),
  });

  if (yearsQuery.isLoading || historyQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[40rem] w-full" />
      </div>
    );
  }

  if (!academicYear) {
    return (
      <Empty className="min-h-[50vh] border border-dashed">
        <EmptyTitle>Academic year not found</EmptyTitle>
        <EmptyDescription>
          Choose an academic year from the sidebar to view its history.
        </EmptyDescription>
      </Empty>
    );
  }

  if (historyQuery.isError || !historyQuery.data) {
    return (
      <Empty className="min-h-[50vh] border border-dashed">
        <EmptyTitle>Historical data could not be loaded</EmptyTitle>
        <EmptyDescription>
          The history service returned an error. Try loading this year again.
        </EmptyDescription>
        <EmptyContent>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => historyQuery.refetch()}
          >
            Try again
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const data: HistoricalData = historyQuery.data;
  const sectionCount = [
    data.staff.length,
    data.subjects.length,
    data.timetables.length,
    data.homeroomHistory.length,
    data.leaveDecisions.length,
    data.attendanceExceptions.length,
  ].reduce((total, count) => total + count, 0);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-3xl font-bold">Historical Data</h1>
        <p className="text-muted-foreground mt-2">
          Read-only staffing, timetable, leave and attendance records for the
          selected academic year.
        </p>
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle>Year {academicYear.year}</CardTitle>
            <Badge variant="secondary">{sectionCount} records</Badge>
            <Badge variant="outline">Read only</Badge>
          </div>
          <CardDescription>
            {academicYear.startDate && academicYear.endDate
              ? `${formatDate(academicYear.startDate)} to ${formatDate(academicYear.endDate)}`
              : "No date range has been recorded for this academic year."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HistoryTabs data={data} />
        </CardContent>
      </Card>
    </div>
  );
};

export default HistoricalDataPage;
