import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";

import type { AcademicYearFormSubmitData } from "./academic-year-form";
import { AcademicYearForm } from "./academic-year-form";

interface AddAcademicYearDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  existingYears: number[];
  referenceYear: number;
  isLoading: boolean;
  onSubmit: (data: AcademicYearFormSubmitData) => Promise<void>;
}

export const AddAcademicYearDialog = ({
  isOpen,
  onOpenChange,
  existingYears,
  referenceYear,
  isLoading,
  onSubmit,
}: AddAcademicYearDialogProps) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-md">
      <DialogHeader className="shrink-0 border-b px-6 py-4">
        <DialogTitle>Add Academic Year</DialogTitle>
        <DialogDescription>
          Create a new academic year in advance. It won&apos;t become the active
          year until you switch to it.
        </DialogDescription>
      </DialogHeader>
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <AcademicYearForm
          formId="add-academic-year-form"
          existingYears={existingYears}
          referenceYear={referenceYear}
          isLoading={isLoading}
          onSubmit={onSubmit}
        />
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          form="add-academic-year-form"
          disabled={isLoading}
        >
          {isLoading ? "Creating..." : "Create Year"}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);
