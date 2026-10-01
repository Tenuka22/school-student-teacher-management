import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import {
  Field,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";

import {
  DEPUTY_POSITION_LABELS,
  DEPUTY_POSITIONS,
} from "./deputy-position-labels";
import type { DeputyPosition } from "./deputy-position-labels";
import { StaffCombobox } from "./staff-combobox";

interface AssignDeputyDialogProps {
  academicYear: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffId: string;
  onStaffIdChange: (staffId: string) => void;
  position: DeputyPosition;
  onPositionChange: (position: DeputyPosition) => void;
  excludeStaffIds: readonly string[];
  isPending: boolean;
  onSubmit: () => void;
}

/** The form that assigns a real member of staff a Deputy seat for a year. */
export const AssignDeputyDialog = ({
  academicYear,
  open,
  onOpenChange,
  staffId,
  onStaffIdChange,
  position,
  onPositionChange,
  excludeStaffIds,
  isPending,
  onSubmit,
}: AssignDeputyDialogProps) => (
  <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Assign a deputy</DialogTitle>
        <DialogDescription>
          Gives a real member of staff leave-recommendation authority for{" "}
          {academicYear}. This does not change who finalises a request — that
          stays with the Principal.
        </DialogDescription>
      </DialogHeader>

      <Field>
        <FieldLabel htmlFor="deputy-staff">Staff member</FieldLabel>
        <StaffCombobox
          excludeIds={excludeStaffIds}
          id="deputy-staff"
          onValueChange={onStaffIdChange}
          value={staffId}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="deputy-position">Position</FieldLabel>
        <Select
          onValueChange={(value) => onPositionChange(value as DeputyPosition)}
          value={position}
        >
          <SelectTrigger id="deputy-position">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DEPUTY_POSITIONS.map((key) => (
              <SelectItem key={key} value={key}>
                {DEPUTY_POSITION_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <DialogFooter>
        <Button
          disabled={isPending}
          onClick={() => onOpenChange(false)}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
        <Button
          disabled={!staffId || isPending}
          onClick={onSubmit}
          type="button"
        >
          {isPending ? "Assigning…" : "Assign"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
