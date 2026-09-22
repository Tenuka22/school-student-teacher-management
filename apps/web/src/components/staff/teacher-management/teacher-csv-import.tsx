import {
  staffInsertSchema,
  staffUpdateSchema,
} from "@school-student-teacher-management/db/schema/staff";
import type { staff } from "@school-student-teacher-management/db/schema/staff";
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

type Staff = typeof staff.$inferSelect;

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

interface TeacherCsvImportProps {
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

export const TeacherCsvImport = ({
  teachers,
  onCreate,
  onUpdate,
}: TeacherCsvImportProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);
  const [conflicts, setConflicts] = useState<ImportConflict<Staff>[]>(() =>
    getImportConflicts<Staff>(NAMESPACE)
  );
  const [isImporting, setIsImporting] = useState(false);

  const handleDownloadTemplate = () => {
    const rows = teachers.map((teacher) => ({
      id: teacher.id,
      name: teacher.name,
      email: teacher.email ?? "",
      phone: teacher.phone ?? "",
      nic: teacher.nic ?? "",
      gender: teacher.gender ?? "",
      birthDate: teacher.birthDate ?? "",
    }));
    downloadCsv("teachers-template.csv", toCsv([...TEMPLATE_COLUMNS], rows));
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const processRow = async (
    row: Record<string, string>,
    existingById: Map<string, Staff>
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

    if (!rowsDiffer(currentComparable, incomingComparable)) {
      return "unchanged";
    }

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
    const counts = {
      created: 0,
      updated: 0,
      unchanged: 0,
      conflict: 0,
      invalid: 0,
    };
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const existingById = new Map(teachers.map((t) => [t.id, t]));

      const outcomes = await Promise.all(
        rows.map((row) => processRow(row, existingById))
      );
      for (const outcome of outcomes) {
        counts[outcome] += 1;
      }

      setConflicts(getImportConflicts<Staff>(NAMESPACE));

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
      <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
        <IconDownload className="mr-2 size-4" />
        IconDownload Template
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleImportClick}
        disabled={isImporting}
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
                <p className="mb-2 font-medium">{conflict.current.name}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Current</p>
                    <p>{conflict.current.email}</p>
                    <p>{conflict.current.phone}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Imported</p>
                    <p>{conflict.incoming.email}</p>
                    <p>{conflict.incoming.phone}</p>
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
