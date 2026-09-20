"use client";

import type {
  ClassId,
  class_ as classTable,
} from "@school-student-teacher-management/db/schema/academics";
import type { staff as staffTable } from "@school-student-teacher-management/db/schema/staff";
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

type Staff = typeof staffTable.$inferSelect;
type Class = typeof classTable.$inferSelect;

interface ClassesListProps {
  classes: Class[];
  staff: Staff[];
  isLoading?: boolean;
  onCreateClick: () => void;
  onEditClick: (cls: Class) => void;
  onAssignTeacherClick: (cls: Class) => void;
  onDeleteClick: (cls: Class) => void;
  onExportClick: () => void;
}

export const ClassesList = ({
  classes,
  staff,
  isLoading = false,
  onCreateClick,
  onEditClick,
  onAssignTeacherClick,
  onDeleteClick,
  onExportClick,
}: ClassesListProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRows, setSelectedRows] = useState<Set<ClassId>>(new Set());

  const staffMap = useMemo(() => {
    const map = new Map<string, Staff>();
    for (const s of staff) {
      map.set(s.id, s);
    }
    return map;
  }, [staff]);

  const filteredClasses = useMemo(() => {
    if (!searchTerm) {
      return classes;
    }

    const term = searchTerm.toLowerCase();
    return classes.filter((cls) => {
      const name = cls.name?.toLowerCase() || "";
      const teacher =
        (cls.homeroomTeacherId
          ? staffMap.get(cls.homeroomTeacherId)?.name?.toLowerCase()
          : null) || "";
      return name.includes(term) || teacher.includes(term);
    });
  }, [classes, searchTerm, staffMap]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRows(new Set(filteredClasses.map((c) => c.id as ClassId)));
    } else {
      setSelectedRows(new Set());
    }
  };

  const handleSelectRow = (id: ClassId, checked: boolean) => {
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

  if (classes.length === 0) {
    return (
      <Empty className="min-h-[60vh] border-none">
        <EmptyTitle>No classes yet</EmptyTitle>
        <EmptyDescription>
          Create your first class to get started
        </EmptyDescription>
        <EmptyContent>
          <Button onClick={onCreateClick} size="sm">
            <IconPlus className="mr-2 size-4" />
            Create Class
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <IconSearch className="text-muted-foreground absolute top-3 left-3 size-4" />
          <Input
            placeholder="Search by class name or teacher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={onExportClick} size="sm">
          <IconFileExport className="mr-2 size-4" />
          Export
        </Button>
        <Button onClick={onCreateClick} size="sm">
          <IconPlus className="mr-2 size-4" />
          Create Class
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={
                    selectedRows.size > 0 &&
                    selectedRows.size === filteredClasses.length
                  }
                  onCheckedChange={(checked) =>
                    handleSelectAll(checked as boolean)
                  }
                />
              </TableHead>
              <TableHead>Class Name</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead>Class Teacher</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredClasses.map((cls) => {
              const teacher = cls.homeroomTeacherId
                ? staffMap.get(cls.homeroomTeacherId)
                : undefined;
              const hasTeacher = !!cls.homeroomTeacherId;
              return (
                <TableRow key={cls.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedRows.has(cls.id as ClassId)}
                      onCheckedChange={(checked) =>
                        handleSelectRow(cls.id as ClassId, checked as boolean)
                      }
                    />
                  </TableCell>
                  <TableCell className="font-medium">{cls.name}</TableCell>
                  <TableCell>Grade {cls.gradeLevel}</TableCell>
                  <TableCell>{teacher?.name || "Unassigned"}</TableCell>
                  <TableCell>
                    {hasTeacher ? (
                      <Badge variant="outline">Active</Badge>
                    ) : (
                      <Badge variant="destructive">No Teacher</Badge>
                    )}
                  </TableCell>
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
                        <DropdownMenuItem onClick={() => onEditClick(cls)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onAssignTeacherClick(cls)}
                        >
                          Assign Teacher
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onDeleteClick(cls)}
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
