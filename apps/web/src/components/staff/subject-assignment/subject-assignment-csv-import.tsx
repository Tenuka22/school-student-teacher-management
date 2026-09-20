import type { subjectAssignment as subjectAssignmentTable } from "@school-student-teacher-management/db/schema/academics";
import { subjectAssignmentInsertSchema } from "@school-student-teacher-management/db/schema/academics";
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

type SubjectAssignment = typeof subjectAssignmentTable.$inferSelect;

const TEMPLATE_COLUMNS = [
  "id",
  "staffId",
  "subjectKey",
  "gradeLevel",
  "classId",
] as const;

const NAMESPACE = "subject-assignments";

interface SubjectAssignmentCsvImportProps {
  academicYearId: string | undefined;
  assignments: SubjectAssignment[];
  onCreate: (data: Record<string, unknown>) => Promise<void>;
  onUpdate: (id: string, data: Record<string, unknown>) => Promise<void>;
}

const comparableColumns = TEMPLATE_COLUMNS.filter((column) => column !== "id");

const rowsDiffer = (
  current: Record<string, unknown>,
  incoming: Record<string, unknown>
) =>
  comparableColumns.some(
    (column) => (current[column] ?? "") !== (incoming[column] ?? "")
  );

export const SubjectAssignmentCsvImport = ({
  academicYearId,
  assignments,
  onCreate,
  onUpdate,
}: SubjectAssignmentCsvImportProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);
  const [conflicts, setConflicts] = useState<
    ImportConflict<SubjectAssignment>[]
  >(() => getImportConflicts<SubjectAssignment>(NAMESPACE));
  const [isImporting, setIsImporting] = useState(false);

  const handleDownloadTemplate = () => {
    const rows = assignments.map((assignment) => ({
      id: assignment.id,
      staffId: assignment.staffId,
      subjectKey: assignment.subjectKey,
      gradeLevel: String(assignment.gradeLevel),
      classId: assignment.classId ?? "",
    }));
    downloadCsv(
      "subject-assignments-template.csv",
      toCsv([...TEMPLATE_COLUMNS], rows)
    );
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const processRow = async (
    row: Record<string, string>,
    existingById: Map<string, SubjectAssignment>
  ): Promise<"created" | "unchanged" | "conflict" | "invalid"> => {
    if (!academicYearId) {
      return "invalid";
    }

    const incoming = {
      staffId: row.staffId,
      academicYearId,
      subjectKey: row.subjectKey,
      gradeLevel: Number(row.gradeLevel),
      classId: row.classId || null,
    };

    const existing = row.id ? existingById.get(row.id) : undefined;

    if (!existing) {
      const result = v.safeParse(
        v.pick(subjectAssignmentInsertSchema, [
          "staffId",
          "academicYearId",
          "subjectKey",
          "gradeLevel",
          "classId",
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
      staffId: existing.staffId,
      subjectKey: existing.subjectKey,
      gradeLevel: String(existing.gradeLevel),
      classId: existing.classId ?? "",
    };
    const incomingComparable = {
      staffId: row.staffId,
      subjectKey: row.subjectKey,
      gradeLevel: row.gradeLevel,
      classId: row.classId,
    };

    if (!rowsDiffer(currentComparable, incomingComparable)) {
      return "unchanged";
    }

    // Staged locally, never pushed automatically — resolved explicitly.
    addImportConflicts<SubjectAssignment>(NAMESPACE, [
      {
        conflictId: crypto.randomUUID(),
        recordId: existing.id,
        current: existing,
        incoming: { ...existing, ...incoming } as SubjectAssignment,
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
      const existingById = new Map(assignments.map((a) => [a.id, a]));

      const outcomes = await Promise.all(
        rows.map((row) => processRow(row, existingById))
      );
      for (const outcome of outcomes) {
        counts[outcome] += 1;
      }

      setConflicts(getImportConflicts<SubjectAssignment>(NAMESPACE));
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

  const handleApplyConflict = async (
    conflict: ImportConflict<SubjectAssignment>
  ) => {
    try {
      await onUpdate(conflict.recordId, {
        subjectKey: conflict.incoming.subjectKey,
        gradeLevel: conflict.incoming.gradeLevel,
        classId: conflict.incoming.classId,
      });
      removeImportConflict(NAMESPACE, conflict.conflictId);
      setConflicts(getImportConflicts<SubjectAssignment>(NAMESPACE));
      toast.success("Applied imported assignment");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to apply update"
      );
    }
  };

  const handleDiscardConflict = (conflictId: string) => {
    removeImportConflict(NAMESPACE, conflictId);
    setConflicts(getImportConflicts<SubjectAssignment>(NAMESPACE));
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
        <IconDownload className="mr-2 size-4" />
        Download Template
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
            data. Nothing was pushed — apply the imported version or discard it
            for each row.
          </AlertDialogDescription>
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {conflicts.map((conflict) => (
              <div
                key={conflict.conflictId}
                className="rounded-lg border p-3 text-sm"
              >
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Current</p>
                    <p>{conflict.current.subjectKey}</p>
                    <p>Grade {conflict.current.gradeLevel}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Imported</p>
                    <p>{conflict.incoming.subjectKey}</p>
                    <p>Grade {conflict.incoming.gradeLevel}</p>
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
