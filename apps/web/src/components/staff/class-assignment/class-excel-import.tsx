import type { class_ as classTable } from "@school-student-teacher-management/db/schema/academics";
import { classInsertSchema } from "@school-student-teacher-management/db/schema/academics";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import { IconDownload, IconUpload } from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { ImportConflictsDialog } from "@/components/ui-patterns/import-conflicts-dialog";
import type { ConflictComparison } from "@/components/ui-patterns/import-conflicts-dialog";
import { downloadExportFile } from "@/lib/download-export";
import { XLSX_ACCEPT, readFileAsBase64 } from "@/lib/excel";
import {
  addImportConflicts,
  getImportConflicts,
  removeImportConflict,
} from "@/lib/import-conflicts";
import type { ImportConflict } from "@/lib/import-conflicts";
import { orpc } from "@/utils/orpc";

type Class = typeof classTable.$inferSelect;

/**
 * The headings of the template and the keys the parsed row comes back under —
 * one list, written as the header row by `staff.exports.workbook` and looked up
 * on the rows `staff.imports.parseExcel` returns. Two lists would be two
 * chances to ship a template its own importer cannot read.
 */
const TEMPLATE_COLUMNS = [
  "id",
  "name",
  "gradeLevel",
  "medium",
  "homeroomTeacherId",
] as const;

const NAMESPACE = "classes";
const comparableColumns = TEMPLATE_COLUMNS.filter((column) => column !== "id");

const rowsDiffer = (
  current: Record<string, unknown>,
  incoming: Record<string, unknown>
) =>
  comparableColumns.some(
    (column) => (current[column] ?? "") !== (incoming[column] ?? "")
  );

/** Which template headings the sheet does not carry, in template order. */
const missingColumns = (headers: string[]) => {
  const found = new Set(headers.map((header) => header.toLowerCase()));
  return TEMPLATE_COLUMNS.filter((column) => !found.has(column.toLowerCase()));
};

/** What the conflict dialog shows for one staged class row. */
const describeConflict = (
  conflict: ImportConflict<Class>
): ConflictComparison => ({
  title: conflict.current.name,
  current: (
    <>
      <p>Grade {conflict.current.gradeLevel}</p>
      <p>{conflict.current.medium}</p>
    </>
  ),
  incoming: (
    <>
      <p>Grade {conflict.incoming.gradeLevel}</p>
      <p>{conflict.incoming.medium}</p>
    </>
  ),
});

interface ClassExcelImportProps {
  academicYearId: string | undefined;
  classes: Class[];
  onCreate: (data: Record<string, unknown>) => Promise<void>;
  onUpdate: (id: string, data: Record<string, unknown>) => Promise<void>;
}

export const ClassExcelImport = ({
  academicYearId,
  classes,
  onCreate,
  onUpdate,
}: ClassExcelImportProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);
  const [conflicts, setConflicts] = useState<ImportConflict<Class>[]>(() =>
    getImportConflicts<Class>(NAMESPACE)
  );
  const [isImporting, setIsImporting] = useState(false);

  const templateMutation = useMutation(
    orpc.staff.exports.workbook.mutationOptions()
  );
  const parseMutation = useMutation(
    orpc.staff.imports.parseExcel.mutationOptions()
  );

  const handleDownloadTemplate = async () => {
    try {
      const file = await templateMutation.mutateAsync({
        filename: "classes-template",
        sheets: [
          {
            name: "Classes",
            columns: TEMPLATE_COLUMNS.map((header) => ({
              header,
              key: header,
              width: header === "id" ? 38 : 22,
            })),
            rows: classes.map((cls) => ({
              id: cls.id,
              name: cls.name,
              gradeLevel: String(cls.gradeLevel),
              medium: cls.medium,
              homeroomTeacherId: cls.homeroomTeacherId ?? "",
            })),
          },
        ],
      });
      downloadExportFile(file);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not build the template"
      );
    }
  };

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

    // A conflicting update is staged locally, never pushed automatically —
    // the admin resolves (applies or discards) each one explicitly.
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

  /**
   * Reads, validates and stages one file, and answers with either the summary
   * the toast should show or the reason it did not work.
   *
   * Returns its errors rather than throwing them, and the caller clears the
   * busy state after it — a `throw` in here would have to be caught by a
   * `try`/`finally` in the component, and both of those are statements React
   * Compiler does not yet lower. The shape has the same effect without them.
   */
  const importFile = async (
    file: File
  ): Promise<
    { ok: true; summary: string } | { ok: false; message: string }
  > => {
    try {
      const base64 = await readFileAsBase64(file);
      const { headers, rows } = await parseMutation.mutateAsync({ base64 });

      const missing = missingColumns(headers);
      if (missing.length > 0) {
        return {
          ok: false,
          message: `That sheet is missing ${missing.length === 1 ? "the column" : "the columns"} ${missing.join(", ")} — download the template and fill it in`,
        };
      }

      const existingById = new Map(classes.map((c) => [c.id, c]));
      const counts = { created: 0, unchanged: 0, conflict: 0, invalid: 0 };

      const outcomes = await Promise.all(
        rows.map((row) => processRow(row, existingById))
      );
      for (const outcome of outcomes) {
        counts[outcome] += 1;
      }

      setConflicts(getImportConflicts<Class>(NAMESPACE));

      return {
        ok: true,
        summary: `Import complete: ${counts.created} created, ${counts.unchanged} unchanged, ${counts.conflict} staged as conflicts${counts.invalid ? `, ${counts.invalid} skipped (invalid data)` : ""}`,
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error ? error.message : "Failed to import the file",
      };
    }
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
    const result = await importFile(file);
    setIsImporting(false);

    if (result.ok) {
      toast.success(result.summary);
    } else {
      toast.error(result.message);
    }
  };

  const handleApplyConflict = async (conflict: ImportConflict<Class>) => {
    try {
      await onUpdate(conflict.recordId, {
        name: conflict.incoming.name,
        gradeLevel: conflict.incoming.gradeLevel,
        medium: conflict.incoming.medium,
        homeroomTeacherId: conflict.incoming.homeroomTeacherId,
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
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          void handleDownloadTemplate();
        }}
        disabled={templateMutation.isPending}
      >
        <IconDownload className="mr-2 size-4" />
        {templateMutation.isPending ? "Building…" : "Download Template"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleImportClick}
        disabled={isImporting || !academicYearId}
      >
        <IconUpload className="mr-2 size-4" />
        {isImporting ? "Importing…" : "Import Excel"}
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
          Resolve import conflicts
        </Button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={XLSX_ACCEPT}
        className="hidden"
        onChange={(event) => {
          void handleFileChange(event);
        }}
      />

      <ImportConflictsDialog<Class>
        conflicts={conflicts}
        describe={describeConflict}
        onApply={(conflict) => {
          void handleApplyConflict(conflict);
        }}
        onDiscard={handleDiscardConflict}
        onOpenChange={setIsConflictDialogOpen}
        open={isConflictDialogOpen}
      />
    </>
  );
};
