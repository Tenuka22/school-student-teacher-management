import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@school-student-teacher-management/ui/components/alert-dialog";
import { Button } from "@school-student-teacher-management/ui/components/button";
import type { ReactNode } from "react";

import type { ImportConflict } from "@/lib/import-conflicts";

/** One staged row shown as two columns: what the server has, and what the file says. */
export interface ConflictComparison {
  title: string;
  current: ReactNode;
  incoming: ReactNode;
}

/**
 * The dialog where an imported row that disagrees with the server is applied or
 * discarded, one at a time.
 *
 * Shared by the teachers and classes importers, which staged conflicts in
 * exactly the same shape and had copied this dialog into both files — two
 * copies of the only place a user decides whether a spreadsheet overwrites the
 * database. The comparison itself stays with the importer: which columns are
 * worth showing side by side is that importer's business, so the caller hands
 * over a `describe`.
 *
 * `describe` is passed as a stable, module-scope function rather than an arrow
 * written inside the JSX — a function declared during render is a component the
 * compiler cannot memoise, and each importer would have declared one.
 *
 * Nothing here pushes data. A staged conflict sits in `localStorage` until
 * somebody presses one of the two buttons, which is the whole point of the
 * flow: reading a file must not write to the school's records by itself.
 */
export const ImportConflictsDialog = <T,>({
  conflicts,
  describe,
  onApply,
  onDiscard,
  onOpenChange,
  open,
}: {
  conflicts: ImportConflict<T>[];
  describe: (conflict: ImportConflict<T>) => ConflictComparison;
  onApply: (conflict: ImportConflict<T>) => void;
  onDiscard: (conflictId: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) => (
  <AlertDialog onOpenChange={onOpenChange} open={open}>
    <AlertDialogContent className="max-w-2xl">
      <AlertDialogTitle>Resolve import conflicts</AlertDialogTitle>
      <AlertDialogDescription>
        These rows from your last import differ from the current server data.
        Nothing was pushed — apply the imported version or discard it for each
        row.
      </AlertDialogDescription>
      <div className="max-h-96 space-y-3 overflow-y-auto">
        {conflicts.map((conflict) => {
          const comparison = describe(conflict);
          return (
            <div key={conflict.conflictId} className="border p-3 text-sm">
              <p className="mb-2 font-medium">{comparison.title}</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-muted-foreground">Current</p>
                  {comparison.current}
                </div>
                <div>
                  <p className="text-muted-foreground">Imported</p>
                  {comparison.incoming}
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onDiscard(conflict.conflictId);
                  }}
                >
                  Discard
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    onApply(conflict);
                  }}
                >
                  Apply imported version
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end">
        <AlertDialogCancel>Close</AlertDialogCancel>
      </div>
    </AlertDialogContent>
  </AlertDialog>
);
