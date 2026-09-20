"use client";

import type {
  SubjectAssignmentId,
  subjectAssignment as subjectAssignmentTable,
} from "@school-student-teacher-management/db/schema/academics";
import type { staff } from "@school-student-teacher-management/db/schema/staff";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import { Card } from "@school-student-teacher-management/ui/components/card";
import { Checkbox } from "@school-student-teacher-management/ui/components/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@school-student-teacher-management/ui/components/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import { Input } from "@school-student-teacher-management/ui/components/input";
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
  IconDotsVertical,
  IconFileExport,
  IconPlus,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";

type Staff = typeof staff.$inferSelect;

type SubjectAssignment = typeof subjectAssignmentTable.$inferSelect;

interface SubjectAssignmentsListProps {
  assignments: SubjectAssignment[];
  staff: Staff[];
  isLoading?: boolean;
  onCreateClick?: () => void;
  onEditClick: (assignment: SubjectAssignment) => void;
  onDeleteClick: (assignment: SubjectAssignment) => void;
  onExportClick: () => void;
}

export const SubjectAssignmentsList = ({
  assignments,
  staff,
  isLoading = false,
  onCreateClick,
  onEditClick,
  onDeleteClick,
  onExportClick,
}: SubjectAssignmentsListProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRows, setSelectedRows] = useState<Set<SubjectAssignmentId>>(
    new Set()
  );

  const staffMap = useMemo(() => {
    const map = new Map<string, Staff>();
    for (const s of staff) {
      map.set(s.id, s);
    }
    return map;
  }, [staff]);

  const filteredAssignments = useMemo(() => {
    if (!searchTerm) {
      return assignments;
    }

    const term = searchTerm.toLowerCase();
    return assignments.filter((assignment) => {
      const staffMember = staffMap.get(assignment.staffId);
      const name = staffMember?.name?.toLowerCase() || "";
      const subject = assignment.subjectKey?.toLowerCase() || "";
      return name.includes(term) || subject.includes(term);
    });
  }, [assignments, searchTerm, staffMap]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRows(
        new Set(filteredAssignments.map((a) => a.id as SubjectAssignmentId))
      );
    } else {
      setSelectedRows(new Set());
    }
  };

  const handleSelectRow = (id: SubjectAssignmentId, checked: boolean) => {
    const newSet = new Set(selectedRows);
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedRows(newSet);
  };

  if (isLoading) {
    return (
      <Card>
        <div className="space-y-3 p-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (assignments.length === 0) {
    return (
      <Empty className="min-h-[60vh] border-none">
        <EmptyTitle>No assignments yet</EmptyTitle>
        <EmptyDescription>
          {onCreateClick
            ? "Create your first subject assignment to get started"
            : "Subject assignments are created when a teacher is set up"}
        </EmptyDescription>
        {onCreateClick && (
          <EmptyContent>
            <Button onClick={onCreateClick} size="sm">
              <IconPlus className="mr-2 size-4" />
              New Assignment
            </Button>
          </EmptyContent>
        )}
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <IconSearch className="text-muted-foreground absolute top-3 left-3 size-4" />
          <Input
            placeholder="Search by teacher name or subject..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={onExportClick} size="sm">
          <IconFileExport className="mr-2 size-4" />
          Export
        </Button>
        {onCreateClick && (
          <Button onClick={onCreateClick} size="sm">
            <IconPlus className="mr-2 size-4" />
            New Assignment
          </Button>
        )}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={
                    selectedRows.size > 0 &&
                    selectedRows.size === filteredAssignments.length
                  }
                  onCheckedChange={(checked) =>
                    handleSelectAll(checked as boolean)
                  }
                />
              </TableHead>
              <TableHead>Teacher Name</TableHead>
              <TableHead>Subject(s)</TableHead>
              <TableHead>Grade(s)</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAssignments.map((assignment) => {
              const staffMember = staffMap.get(assignment.staffId);
              return (
                <TableRow key={assignment.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedRows.has(
                        assignment.id as SubjectAssignmentId
                      )}
                      onCheckedChange={(checked) =>
                        handleSelectRow(
                          assignment.id as SubjectAssignmentId,
                          checked as boolean
                        )
                      }
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {staffMember?.name || "Unknown"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{assignment.subjectKey}</Badge>
                  </TableCell>
                  <TableCell>Grade {assignment.gradeLevel}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon">
                            <IconDotsVertical className="size-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => onEditClick(assignment)}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onDeleteClick(assignment)}
                          className="text-destructive"
                        >
                          <IconTrash className="mr-2 size-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};
