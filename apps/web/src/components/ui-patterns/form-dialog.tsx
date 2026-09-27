import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import { IconLoader2 } from "@tabler/icons-react";
import type { ReactNode } from "react";

const WIDTH = {
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
  "2xl": "sm:max-w-2xl",
} as const;

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /**
   * `id` of the `<form>` rendered in `children`. The footer's submit button
   * targets it with the `form` attribute, so the form keeps its own submit
   * handler, field names and payload.
   */
  formId: string;
  submitLabel: string;
  /** Shown on the submit button while `isPending`, e.g. "Saving…". */
  pendingLabel?: string;
  cancelLabel?: string;
  isPending?: boolean;
  size?: keyof typeof WIDTH;
  children: ReactNode;
}

/**
 * Create/edit dialog layout: fixed header, scrolling body, fixed footer.
 * The dialog never exceeds the viewport (the primitive caps its height), so
 * the Cancel/Save buttons stay reachable on a landscape phone.
 */
export const FormDialog = ({
  open,
  onOpenChange,
  title,
  description,
  formId,
  submitLabel,
  pendingLabel = "Saving…",
  cancelLabel = "Cancel",
  isPending = false,
  size = "lg",
  children,
}: FormDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent
      className={`flex flex-col overflow-hidden p-0 ${WIDTH[size]}`}
    >
      <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
        <DialogTitle>{title}</DialogTitle>
        {description ? (
          <DialogDescription>{description}</DialogDescription>
        ) : null}
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
        {children}
      </div>
      <div className="flex shrink-0 flex-col-reverse gap-2 border-t px-6 py-4 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isPending}
        >
          {cancelLabel}
        </Button>
        <Button
          type="submit"
          form={formId}
          disabled={isPending}
          aria-busy={isPending || undefined}
        >
          {isPending ? (
            <IconLoader2 aria-hidden="true" className="animate-spin" />
          ) : null}
          {isPending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);
