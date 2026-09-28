import type {
  ResolvedAttendanceImportRow,
  attendanceImportRowSchema,
} from "@school-student-teacher-management/api/routers/staff/imports/attendance-import";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import { IconDownload, IconUpload } from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import type * as v from "valibot";

import type { AttendanceTeacher } from "@/components/staff/attendance/use-attendance-page";
import { downloadExportFile } from "@/lib/download-export";
import { XLSX_ACCEPT, readFileAsBase64 } from "@/lib/excel";
import { orpc } from "@/utils/orpc";

type ImportRow = v.InferOutput<typeof attendanceImportRowSchema>;

/**
 * The template's headings, which are also the keys a parsed row comes back
 * under. One list written twice — as the header row and as the lookup on the
 * way back — so a template cannot ship that its own importer cannot read.
 *
 * `reason` is deliberately *not* required: a sheet with no remarks column is a
 * sheet somebody built to answer one question, and the register has no remark
 * for them to contradict.
 */
const TEMPLATE_COLUMNS = ["nic", "present", "reason"] as const;
const REQUIRED_COLUMNS = ["nic", "present"] as const;

/** Which required headings the sheet does not carry, in template order. */
const missingColumns = (headers: string[]) => {
  const found = new Set(headers.map((header) => header.toLowerCase()));
  return REQUIRED_COLUMNS.filter((column) => !found.has(column));
};

const OUTCOME_LABELS: Record<ResolvedAttendanceImportRow["outcome"], string> = {
  ready: "Will be written",
  "no-nic": "No NIC on the row",
  "unknown-nic": "No teacher with that NIC",
  "duplicate-nic": "That NIC appears twice",
  "no-value": "No answer in the cell",
  "bad-value": "Not true or false",
  "blocked-by-leave": "Approved leave — left alone",
};

/** Skip is not failure: an approved leave is the file being overruled correctly. */
const OUTCOME_VARIANTS: Record<
  ResolvedAttendanceImportRow["outcome"],
  "secondary" | "outline" | "destructive"
> = {
  ready: "secondary",
  "blocked-by-leave": "outline",
  "no-nic": "destructive",
  "unknown-nic": "destructive",
  "duplicate-nic": "destructive",
  "no-value": "destructive",
  "bad-value": "destructive",
};

/** The register's own statuses, as words. */
const MARK_LABELS: Record<string, string> = {
  unmarked: "Not marked",
  present: "Present",
  absent: "Absent",
  partial: "Some periods",
  halfDay: "Half day",
  lateShortLeave: "Late / short leave",
};

const markLabel = (status: string): string => MARK_LABELS[status] ?? status;

/** The answer the file carries, or an em dash for a cell with nothing in it. */
const incomingMarkLabel = (row: ResolvedAttendanceImportRow): string => {
  if (row.present === null) {
    return "\u2014";
  }
  return row.present ? "Present" : "Absent";
};

/**
 * What the file would do, shown before anything is written.
 *
 * Two columns rather than one, because an import that only lists the incoming
 * marks hides the thing worth checking — that it is about to replace what is
 * already there.
 */
const ImportPreviewTable = ({
  rows,
}: {
  rows: ResolvedAttendanceImportRow[];
}) => (
  <div className="max-h-96 overflow-auto border">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-14">Row</TableHead>
          <TableHead>Teacher</TableHead>
          <TableHead>Now</TableHead>
          <TableHead>From the file</TableHead>
          <TableHead>Result</TableHead>
          <TableHead>Remark</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.rowNumber}>
            <TableCell className="text-muted-foreground">
              {row.rowNumber}
            </TableCell>
            <TableCell>
              <p>{row.name ?? "\u2014"}</p>
              <p className="text-muted-foreground font-mono text-xs">
                {row.nic}
              </p>
            </TableCell>
            <TableCell>{markLabel(row.current)}</TableCell>
            <TableCell>{incomingMarkLabel(row)}</TableCell>
            <TableCell>
              <Badge variant={OUTCOME_VARIANTS[row.outcome]}>
                {OUTCOME_LABELS[row.outcome]}
              </Badge>
            </TableCell>
            <TableCell className="max-w-48 whitespace-normal">
              {row.reason}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

interface AttendanceExcelImportProps {
  academicYearId: string | undefined;
  /** The day the register is showing — the date the file is about. */
  date: string;
  /** Called after a write lands, so the register on screen re-reads itself. */
  onImported: () => void;
  teachers: AttendanceTeacher[];
}

/**
 * Bring a day's register in from a spreadsheet.
 *
 * Three steps, and none of them writes until the third: read the file, show
 * what it would do, then apply. The preview and the write run the same
 * server-side resolution, so the table is not a simulation of the answer — it
 * is the answer.
 */
export const AttendanceExcelImport = ({
  academicYearId,
  date,
  onImported,
  teachers,
}: AttendanceExcelImportProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [pending, setPending] = useState<{
    rows: ImportRow[];
    preview: ResolvedAttendanceImportRow[];
  } | null>(null);

  const templateMutation = useMutation(
    orpc.staff.exports.workbook.mutationOptions()
  );
  const parseMutation = useMutation(
    orpc.staff.imports.parseExcel.mutationOptions()
  );
  const previewMutation = useMutation(
    orpc.staff.imports.previewAttendanceImport.mutationOptions()
  );
  const applyMutation = useMutation(
    orpc.staff.imports.applyAttendanceImport.mutationOptions()
  );

  const handleDownloadTemplate = async () => {
    try {
      const file = await templateMutation.mutateAsync({
        filename: `attendance-${date}`,
        sheets: [
          {
            name: "Attendance",
            columns: TEMPLATE_COLUMNS.map((heading) => ({
              header: heading,
              key: heading,
              width: heading === "reason" ? 46 : 22,
            })),
            // Only the teachers who *can* be imported get a line: a teacher
            // with no NIC has no way to be matched, so a blank row for them
            // would come back as "no NIC" every time.
            rows: teachers.flatMap((teacher) =>
              teacher.nic === null
                ? []
                : [{ nic: teacher.nic, present: "", reason: "" }]
            ),
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

  /**
   * Reads one file through to a preview.
   *
   * Returns its errors rather than throwing them, and the caller clears the
   * busy state after it — a `throw` here would need a `try`/`finally` in the
   * component, and React Compiler does not lower either.
   */
  const importFile = async (
    file: File
  ): Promise<
    | { ok: true; rows: ImportRow[]; preview: ResolvedAttendanceImportRow[] }
    | { ok: false; message: string }
  > => {
    if (!academicYearId) {
      return { ok: false, message: "Pick an academic year first" };
    }

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

      const importRows: ImportRow[] = rows.map((row) => ({
        nic: row.nic ?? "",
        present: row.present ?? "",
        reason: row.reason ?? "",
      }));
      const result = await previewMutation.mutateAsync({
        academicYearId,
        date,
        rows: importRows,
      });

      return { ok: true, rows: importRows, preview: result.rows };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error ? error.message : "Failed to read that file",
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
      setPending({ rows: result.rows, preview: result.preview });
    } else {
      toast.error(result.message);
    }
  };

  const handleApply = async () => {
    if (!academicYearId || !pending) {
      return;
    }

    setIsApplying(true);
    try {
      const result = await applyMutation.mutateAsync({
        academicYearId,
        date,
        rows: pending.rows,
      });
      setIsApplying(false);

      const written = result.marked;
      const leftAlone = pending.rows.length - written;
      setPending(null);
      onImported();
      toast.success(`Imported ${written} ${written === 1 ? "mark" : "marks"}`);
      if (leftAlone > 0) {
        toast.warning(
          `${leftAlone} ${leftAlone === 1 ? "row was" : "rows were"} left alone — approved leave, no answer, or no teacher with that NIC`
        );
      }
    } catch (error) {
      setIsApplying(false);
      toast.error(
        error instanceof Error ? error.message : "Could not import the file"
      );
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          void handleDownloadTemplate();
        }}
        disabled={templateMutation.isPending || !academicYearId}
      >
        <IconDownload data-icon="inline-start" />
        {templateMutation.isPending ? "Building…" : "Download Template"}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          fileInputRef.current?.click();
        }}
        disabled={isImporting || !academicYearId}
      >
        <IconUpload data-icon="inline-start" />
        {isImporting ? "Reading…" : "Import Excel"}
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept={XLSX_ACCEPT}
        className="hidden"
        onChange={(event) => {
          void handleFileChange(event);
        }}
      />

      <Dialog
        onOpenChange={(open) => {
          if (!open && !isApplying) {
            setPending(null);
          }
        }}
        open={pending !== null}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Import attendance for {date}</DialogTitle>
            <DialogDescription>
              The file is the authority: every row below replaces what the
              register says for that teacher on this date. Approved leave is not
              overwritten, and a blank remark keeps the one already there.
            </DialogDescription>
          </DialogHeader>

          <ImportPreviewTable rows={pending?.preview ?? []} />

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isApplying}
              onClick={() => {
                setPending(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isApplying || pending === null}
              onClick={() => {
                void handleApply();
              }}
            >
              {isApplying ? "Importing…" : "Apply these marks"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
