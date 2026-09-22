"use client";

import {
  Field,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";

import { TeacherCombobox } from "@/components/staff/class-assignment/teacher-combobox";
import { TeacherTimetableDialogs } from "@/components/staff/period-management/teacher-timetable-dialogs";
import { TeacherTimetableGrid } from "@/components/staff/period-management/teacher-timetable-grid";
import { useTeacherTimetablePage } from "@/components/staff/period-management/use-teacher-timetable-page";

interface TeacherTimetablePageContentProps {
  /** When set, the teacher is fixed by the route and never asked for again. */
  staffId?: string;
}

export const TeacherTimetablePageContent = ({
  staffId: fixedStaffId,
}: TeacherTimetablePageContentProps) => {
  const page = useTeacherTimetablePage(fixedStaffId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold">Teacher Timetable</h1>
        <p className="text-muted-foreground mt-2">
          View and manage a single teacher&apos;s periods across every class
          they teach this academic year.
        </p>
      </div>

      {!fixedStaffId && (
        <Field className="max-w-sm">
          <FieldLabel htmlFor="teacher-timetable-select">Teacher</FieldLabel>
          <TeacherCombobox
            id="teacher-timetable-select"
            value={page.staffId}
            onValueChange={(next) => page.setStaffId(next)}
          />
        </Field>
      )}

      {page.staffId && page.currentYear?.id && (
        <>
          {page.currentStaff && (
            <div className="bg-primary text-primary-foreground flex flex-wrap items-center gap-5 p-5">
              <span className="bg-accent/20 text-accent flex size-12 flex-none items-center justify-center rounded-full text-base font-bold">
                {page.currentStaff.name
                  .split(/\s+/u)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0]?.toUpperCase())
                  .join("")}
              </span>
              <div className="min-w-0">
                <div className="font-heading text-2xl leading-tight font-semibold">
                  {page.currentStaff.name}
                </div>
                {page.currentStaff.email && (
                  <div className="text-primary-foreground/65 mt-1 text-xs">
                    {page.currentStaff.email}
                  </div>
                )}
              </div>
              <div className="ml-auto flex gap-6">
                <div>
                  <div className="font-heading text-accent text-2xl leading-none font-semibold">
                    {page.entries.length}
                  </div>
                  <div className="text-primary-foreground/65 mt-1 text-[10px] tracking-wider uppercase">
                    Periods / week
                  </div>
                </div>
                <div>
                  <div className="font-heading text-accent text-2xl leading-none font-semibold">
                    {Math.max(
                      page.periodConfig.length * 5 - page.entries.length,
                      0
                    )}
                  </div>
                  <div className="text-primary-foreground/65 mt-1 text-[10px] tracking-wider uppercase">
                    Free slots
                  </div>
                </div>
              </div>
            </div>
          )}

          <TeacherTimetableGrid
            entries={page.entries}
            periodConfig={page.periodConfig}
            onAssignClick={page.handleAssignClick}
            onEditClick={page.handleEditClick}
            onDeleteClick={page.handleDeleteClick}
          />

          <TeacherTimetableDialogs
            classes={page.classes}
            periodConfig={page.periodConfig}
            selectedEntry={page.selectedEntry}
            addSlot={page.addSlot}
            isAddOpen={page.isAddDialogOpen}
            onAddOpenChange={page.handleAddOpenChange}
            isAddPending={page.assignMutation.isPending}
            onAddSubmit={page.handleAddSubmit}
            isEditOpen={page.isEditDialogOpen}
            onEditOpenChange={(open) => page.setIsEditDialogOpen(open)}
            isEditPending={page.updateMutation.isPending}
            onEditSubmit={page.handleEditSubmit}
            isDeleteOpen={page.isDeleteDialogOpen}
            onDeleteOpenChange={(open) => page.setIsDeleteDialogOpen(open)}
            isDeletePending={page.deleteMutation.isPending}
            onConfirmDelete={page.handleConfirmDelete}
          />
        </>
      )}
    </div>
  );
};
