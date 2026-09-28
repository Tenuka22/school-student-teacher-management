import {
  staffInsertSchema,
  staffUpdateSchema,
} from "@school-student-teacher-management/db/schema/staff";
import type { staff } from "@school-student-teacher-management/db/schema/staff";
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

type Staff = typeof staff.$inferSelect;

/**
 * The headings of the template, which are also the keys the parsed row comes
 * back under.
 *
 * They are one list used twice: written as the header row by
 * `staff.exports.workbook`, and looked up on the rows that come back from
 * `staff.imports.parseExcel`. Two lists would be two chances to ship a template
 * that its own importer cannot read.
 */
const TEMPLATE_COLUMNS = [
  "id",
  "name",
  "email",
  "phone",
  "nic",
  "gender",
  "birthDate",
] as const;

const NAMESPACE = "teachers";

interface TeacherExcelImportProps {
  teachers: Staff[];
  onCreate: (data: Record<string, unknown>) => Promise<void>;
  onUpdate: (id: string, data: Record<string, unknown>) => Promise<void>;
}

const rowsDiffer = (
  current: Record<string, unknown>,
  incoming: Record<string, unknown>
) =>
  TEMPLATE_COLUMNS.some(
    (column) =>
      column !== "id" && (current[column] ?? "") !== (incoming[column] ?? "")
  );

/** Which template headings the sheet does not carry, in template order. */
const missingColumns = (headers: string[]) => {
  const found = new Set(headers.map((header) => header.toLowerCase()));
  return TEMPLATE_COLUMNS.filter((column) => !found.has(column.toLowerCase()));
};

/** What the conflict dialog shows for one staged teacher row. */
const describeConflict = (
  conflict: ImportConflict<Staff>
): ConflictComparison => ({
  title: conflict.current.name,
  current: (
    <>
      <p>{conflict.current.email}</p>
      <p>{conflict.current.phone}</p>
    </>
  ),
  incoming: (
    <>
      <p>{conflict.incoming.email}</p>
      <p>{conflict.incoming.phone}</p>
    </>
  ),
});

/**
 * One spreadsheet row against one server record.
 *
 * New means it gets created, changed means it is *staged* rather than written,
 * and matching means it is counted and dropped. The staging is the reason this
 * lives at module scope: deciding whether an update is an overwrite is the
 * whole policy of the import, and it belongs somewhere you can read it next to
 * the template's column list rather than inside the component that renders two
 * buttons.
 */
const processRow = async (
  row: Record<string, string>,
  existingById: Map<string, Staff>,
  onCreate: (data: Record<string, unknown>) => Promise<void>
): Promise<"created" | "updated" | "unchanged" | "conflict" | "invalid"> => {
  const incoming = {
    name: row.name,
    email: row.email || undefined,
    phone: row.phone || undefined,
    nic: row.nic || undefined,
    gender: (row.gender || undefined) as Staff["gender"] | undefined,
    birthDate: row.birthDate || undefined,
  };

  const existing = row.id ? existingById.get(row.id) : undefined;

  if (!existing) {
    const result = v.safeParse(
      v.pick(staffInsertSchema, [
        "name",
        "email",
        "phone",
        "nic",
        "gender",
        "birthDate",
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
    id: existing.id,
    name: existing.name,
    email: existing.email ?? "",
    phone: existing.phone ?? "",
    nic: existing.nic ?? "",
    gender: existing.gender ?? "",
    birthDate: existing.birthDate ?? "",
  };
  const incomingComparable = { id: row.id, ...row };

  if (rowsDiffer(currentComparable, incomingComparable)) {
    const result = v.safeParse(
      v.pick(staffUpdateSchema, [
        "name",
        "email",
        "phone",
        "nic",
        "gender",
        "birthDate",
      ]),
      incoming
    );
    if (!result.success) {
      return "invalid";
    }

    // A conflicting update is staged locally, never pushed automatically —
    // the admin resolves (applies or discards) each one explicitly.
    addImportConflicts<Staff>(NAMESPACE, [
      {
        conflictId: crypto.randomUUID(),
        recordId: existing.id,
        current: existing,
        incoming: { ...existing, ...result.output } as Staff,
        importedAt: new Date().toISOString(),
      },
    ]);
    return "conflict";
  }

  return "unchanged";
};

export const TeacherExcelImport = ({
  teachers,
  onCreate,
  onUpdate,
}: TeacherExcelImportProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);
  const [conflicts, setConflicts] = useState<ImportConflict<Staff>[]>(() =>
    getImportConflicts<Staff>(NAMESPACE)
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
        filename: "teachers-template",
        sheets: [
          {
            name: "Teachers",
            columns: TEMPLATE_COLUMNS.map((header) => ({
              header,
              key: header,
              width: header === "id" ? 38 : 22,
            })),
            rows: teachers.map((teacher) => ({
              id: teacher.id,
              name: teacher.name,
              email: teacher.email ?? "",
              phone: teacher.phone ?? "",
              nic: teacher.nic ?? "",
              gender: teacher.gender ?? "",
              birthDate: teacher.birthDate ?? "",
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

      const existingById = new Map(teachers.map((t) => [t.id, t]));
      const counts = {
        created: 0,
        updated: 0,
        unchanged: 0,
        conflict: 0,
        invalid: 0,
      };

      const outcomes = await Promise.all(
        rows.map((row) => processRow(row, existingById, onCreate))
      );
      for (const outcome of outcomes) {
        counts[outcome] += 1;
      }

      setConflicts(getImportConflicts<Staff>(NAMESPACE));

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

  const handleApplyConflict = async (conflict: ImportConflict<Staff>) => {
    try {
      await onUpdate(conflict.recordId, {
        name: conflict.incoming.name,
        email: conflict.incoming.email,
        phone: conflict.incoming.phone,
        nic: conflict.incoming.nic,
        gender: conflict.incoming.gender,
        birthDate: conflict.incoming.birthDate,
      });
      removeImportConflict(NAMESPACE, conflict.conflictId);
      setConflicts(getImportConflicts<Staff>(NAMESPACE));
      toast.success(`Applied update for ${conflict.incoming.name}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to apply update"
      );
    }
  };

  const handleDiscardConflict = (conflictId: string) => {
    removeImportConflict(NAMESPACE, conflictId);
    setConflicts(getImportConflicts<Staff>(NAMESPACE));
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
        disabled={isImporting}
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

      <ImportConflictsDialog<Staff>
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
