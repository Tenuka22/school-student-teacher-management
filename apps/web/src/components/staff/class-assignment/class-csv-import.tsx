import type { class_ as classTable } from "@school-student-teacher-management/db/schema/academics";
import { classInsertSchema } from "@school-student-teacher-management/db/schema/academics";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@school-student-teacher-management/ui/components/alert-dialog";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import { IconDownload, IconUpload } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { downloadCsv, parseCsv, toCsv } from "@/lib/csv";
import {
  addImportConflicts,
  getImportConflicts,
  removeImportConflict,
} from "@/lib/import-conflicts";
import type { ImportConflict } from "@/lib/import-conflicts";

type Class = typeof classTable.$inferSelect;

const TEMPLATE_COLUMNS = [
  "id",
  "name",
  "gradeLevel",
  "medium",
  "homeroomTeacherId",
] as const;

const NAMESPACE = "classes";

/** A blank template with one example row — see the teacher importer. */
const downloadBlankTemplate = () => {
  const exampleRow = Object.fromEntries(
    TEMPLATE_COLUMNS.map((column) => [
      column,
      column === "name" ? "Grade 8 - B" : "",
    ])
  );

  downloadCsv(
    "classes-template.csv",
    toCsv([...TEMPLATE_COLUMNS], [exampleRow])
  );
};
const comparableColumns = TEMPLATE_COLUMNS.filter((column) => column !== "id");

const rowsDiffer = (
  current: Record<string, unknown>,
  incoming: Record<string, unknown>
) =>
  comparableColumns.some(
    (column) => (current[column] ?? "") !== (incoming[column] ?? "")
  );

interface ClassCsvImportProps {
  academicYearId: string | undefined;
  classes: Class[];
  onCreate: (data: Record<string, unknown>) => Promise<void>;
  onUpdate: (id: string, data: Record<string, unknown>) => Promise<void>;
}

export const ClassCsvImport = ({
  academicYearId,
  classes,
  onCreate,
  onUpdate,
}: ClassCsvImportProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);
  const [conflicts, setConflicts] = useState<ImportConflict<Class>[]>(() =>
    getImportConflicts<Class>(NAMESPACE)
  );
  const [isImporting, setIsImporting] = useState(false);

  /** A blank template with one example row — see the teacher importer. */
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const processRow = async (
    row: Record<string, string>,
    existingById: Map<string, Class>
  ): Promise<"created" | "unchanged" | "conflict" | "invalid"> => {
    if (!academicYearId) {
      return "invalid";
    }

    const incoming = {
      academicYearId,
      name: row.name,
      gradeLevel: Number(row.gradeLevel),
      medium: row.medium,
      homeroomTeacherId: row.homeroomTeacherId || null,
    };

    const existing = row.id ? existingById.get(row.id) : undefined;

    if (!existing) {
      const result = v.safeParse(
        v.pick(classInsertSchema, [
          "academicYearId",
          "name",
          "gradeLevel",
          "medium",
        ]),
        incoming
      );
      if (!result.success) {
        return "invalid";
      }
      await onCreate(result.output);
      return "created";
    }

    const currentComparable = {
      name: existing.name,
      gradeLevel: String(existing.gradeLevel),
      medium: existing.medium,
      homeroomTeacherId: existing.homeroomTeacherId ?? "",
    };
    const incomingComparable = {
      name: row.name,
      gradeLevel: row.gradeLevel,
      medium: row.medium,
      homeroomTeacherId: row.homeroomTeacherId,
    };

    if (!rowsDiffer(currentComparable, incomingComparable)) {
      return "unchanged";
    }

    addImportConflicts<Class>(NAMESPACE, [
      {
        conflictId: crypto.randomUUID(),
        recordId: existing.id,
        current: existing,
        incoming: { ...existing, ...incoming } as Class,
        importedAt: new Date().toISOString(),
      },
    ]);
    return "conflict";
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setIsImporting(true);
    const counts = { created: 0, unchanged: 0, conflict: 0, invalid: 0 };
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const existingById = new Map(classes.map((c) => [c.id, c]));

      const outcomes = await Promise.all(
        rows.map((row) => processRow(row, existingById))
      );
      for (const outcome of outcomes) {
        counts[outcome] += 1;
      }

      setConflicts(getImportConflicts<Class>(NAMESPACE));
      toast.success(
        `Import complete: ${counts.created} created, ${counts.unchanged} unchanged, ${counts.conflict} staged as conflicts${counts.invalid ? `, ${counts.invalid} skipped (invalid data)` : ""}`
      );
      setIsImporting(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to import CSV"
      );
      setIsImporting(false);
    }
  };

  /**
   * Writes the imported version of a conflicted class.
   *
   * The dialog showed the grade and homeroom differences side by side, and this
   * used to apply only the name and medium — so "Apply Imported Version"
   * silently dropped two of the three differences it had just displayed. Grade
   * and homeroom are applied too now; homeroom only when the file actually
   * carries one, so a blank column cannot unassign a teacher.
   */
  const handleApplyConflict = async (conflict: ImportConflict<Class>) => {
    try {
      const homeroomProvided =
        conflict.incoming.homeroomTeacherId !== null &&
        conflict.incoming.homeroomTeacherId !== undefined;

      await onUpdate(conflict.recordId, {
        name: conflict.incoming.name,
        gradeLevel: conflict.incoming.gradeLevel,
        medium: conflict.incoming.medium,
        ...(homeroomProvided
          ? { homeroomTeacherId: conflict.incoming.homeroomTeacherId }
          : {}),
      });
      removeImportConflict(NAMESPACE, conflict.conflictId);
      setConflicts(getImportConflicts<Class>(NAMESPACE));
      toast.success(`Applied update for ${conflict.incoming.name}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to apply update"
      );
    }
  };

  const handleDiscardConflict = (conflictId: string) => {
    removeImportConflict(NAMESPACE, conflictId);
    setConflicts(getImportConflicts<Class>(NAMESPACE));
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={downloadBlankTemplate}>
        <IconDownload className="mr-2 size-4" />
        Blank template
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleImportClick}
        disabled={isImporting || !academicYearId}
      >
        <IconUpload className="mr-2 size-4" />
        {isImporting ? "Importing..." : "Import CSV"}
      </Button>
      {conflicts.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsConflictDialogOpen(true)}
        >
          <Badge variant="destructive" className="mr-2">
            {conflicts.length}
          </Badge>
          Resolve Import Conflicts
        </Button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileChange}
      />

      <AlertDialog
        open={isConflictDialogOpen}
        onOpenChange={setIsConflictDialogOpen}
      >
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogTitle>Resolve Import Conflicts</AlertDialogTitle>
          <AlertDialogDescription>
            These rows from your last import differ from the current server
            data. Applying a row writes its name, grade, medium and — where the
            file names one — its homeroom teacher. Discarding leaves the class
            as it is.
          </AlertDialogDescription>
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {conflicts.map((conflict) => (
              <div
                key={conflict.conflictId}
                className="rounded-lg border p-3 text-sm"
              >
                <p className="mb-2 font-medium">{conflict.current.name}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Current</p>
                    <p>Grade {conflict.current.gradeLevel}</p>
                    <p>{conflict.current.medium}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Imported</p>
                    <p>Grade {conflict.incoming.gradeLevel}</p>
                    <p>{conflict.incoming.medium}</p>
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDiscardConflict(conflict.conflictId)}
                  >
                    Discard
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleApplyConflict(conflict)}
                  >
                    Apply Imported Version
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <AlertDialogCancel>Close</AlertDialogCancel>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
