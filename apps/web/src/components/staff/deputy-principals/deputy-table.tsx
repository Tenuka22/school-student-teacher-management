import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import { IconX } from "@tabler/icons-react";

import { deputyPositionLabel } from "./deputy-position-labels";
import type { DeputyAssignment, StaffLite } from "./deputy-position-labels";

interface DeputyTableProps {
  academicYear: number;
  deputies: DeputyAssignment[];
  staffById: Map<string, StaffLite>;
  onRemove: (assignment: DeputyAssignment) => void;
}

/** The current-year holders of the Deputy/Assistant Principal seats. */
export const DeputyTable = ({
  academicYear,
  deputies,
  staffById,
  onRemove,
}: DeputyTableProps) => {
  if (deputies.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyTitle>No deputy or assistant principal yet</EmptyTitle>
        <EmptyDescription>
          Nobody holds a leave-review seat for {academicYear}. Assign one to
          start the recommend/finalise chain.
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Staff member</TableHead>
          <TableHead scope="col">Position</TableHead>
          <TableHead className="text-right" scope="col">
            Actions
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {deputies.map((row) => {
          const member = staffById.get(row.staffId);
          const label = deputyPositionLabel(row.position);
          return (
            <TableRow key={row.id}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">
                    {member?.name ?? "Unknown staff member"}
                  </span>
                  {member?.email ? (
                    <span className="text-muted-foreground text-xs">
                      {member.email}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{label}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  aria-label={`Remove ${member?.name ?? "this staff member"} as ${label}`}
                  onClick={() => onRemove(row)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <IconX aria-hidden="true" />
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};
