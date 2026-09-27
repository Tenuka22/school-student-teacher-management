import type { StaffListItem } from "@school-student-teacher-management/api/routers/staff/list-staff";
import {
  staffInsertSchema,
  staffUpdateSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import {
  IconAlertTriangle,
  IconCircleX,
  IconDownload,
  IconInfoCircle,
  IconUpload,
} from "@tabler/icons-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { QueryErrorPanel } from "@/components/query-error-panel";
import {
  formatApiErrorMessage,
  friendlyValidationMessage,
} from "@/lib/api-error";
import { downloadCsv, parseCsv, toCsv } from "@/lib/csv";
import {
  addImportConflicts,
  getImportConflicts,
  removeImportConflict,
} from "@/lib/import-conflicts";
import type { ImportConflict } from "@/lib/import-conflicts";

type Staff = StaffListItem;

const TEMPLATE_COLUMNS = [
  "id",
  "name",
  "email",
  "phone",
  "nic",
  "gender",
  "birthDate",
] as const;

/** The fields a row carries, and the words to name them by in a problem list. */
const IMPORT_FIELDS = [
  "name",
  "email",
  "phone",
  "nic",
  "gender",
  "birthDate",
] as const;

const FIELD_LABEL: Record<(typeof IMPORT_FIELDS)[number], string> = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  nic: "NIC",
  gender: "Gender",
  birthDate: "Birth date",
};

const NAMESPACE = "teachers";

const plural = (count: number) => (count === 1 ? "" : "s");

/**
 * A blank template, with one example row.
 *
 * This used to write every teacher's name, email, phone, NIC, gender and date of
 * birth into a file labelled "Template" — a full personal-data export behind a
 * button that promised an empty form. A template is now genuinely empty; real
 * data leaves through the Teachers page's own "Export as Excel", which says what
 * it contains.
 */
const downloadBlankTemplate = () => {
  const exampleRow = Object.fromEntries(
    TEMPLATE_COLUMNS.map((column) => [
      column,
      column === "name" ? "Nimal Perera" : "",
    ])
  );

  downloadCsv(
    "teachers-template.csv",
    toCsv([...TEMPLATE_COLUMNS], [exampleRow])
  );
};

interface TeacherCsvImportProps {
  teachers: Staff[];
  onCreate: (data: Record<string, unknown>) => Promise<void>;
  onUpdate: (id: string, data: Record<string, unknown>) => Promise<void>;
}

type RowKind = "create" | "conflict" | "unchanged" | "invalid";

/**
 * One thing wrong with one row, said in a way a person can act on.
 *
 * `severity` is a real distinction and it decides the write: an **error** means
 * the row is not written at all, a **warning** means it is written and the
 * reader should know why. An import that cannot tell those apart either refuses
 * a file it could have half-applied, or applies something the reader did not
 * expect.
 */
interface RowProblem {
  severity: "error" | "warning";
  field: string;
  message: string;
}

interface PlannedRow {
  /** 1-based line in the file. The header is line 1, so data starts at 2. */
  line: number;
  raw: Record<string, string>;
  kind: RowKind;
  /** Who the row is about — a name, or the id when there is no name. */
  subject: string;
  problems: RowProblem[];
  /** The validated values, for a row that will be written. */
  payload: Record<string, unknown> | null;
  existing: Staff | null;
}

interface RowFailure {
  line: number;
  subject: string;
  message: string;
}

interface ImportTotals {
  created: number;
  staged: number;
  unchanged: number;
}

interface ImportPlan {
  fileName: string;
  rows: PlannedRow[];
  /**
   * Set when the file cannot be imported at all, as opposed to containing rows
   * that cannot be imported. Nothing is written in this state, and there is no
   * confirm button to write it with.
   */
  fatal: string | null;
}

/**
 * The window's own states.
 *
 * A fourth — "done, and nothing needed doing" — is deliberately not separate: a
 * run that creates nothing because every row already matched is a finished run
 * whose summary says so, which is a fact about the file rather than a different
 * kind of run.
 */
type ImportPhase = "idle" | "review" | "writing" | "done";

/**
 * The row schemas the import actually writes through.
 *
 * These are **not** the plain `staffInsertSchema` / `staffUpdateSchema` picks
 * the importer used to validate with, and the difference is the whole point of
 * having a preview. `staff.nic` is `optionalNullable` on the table — a staff
 * record may have no NIC — but `createStaff`'s own input narrows it to
 * `nicLoginSchema`, because the NIC *is* the login username. Validating a CSV
 * against the table therefore passed rows the server would refuse, so the
 * preview said "will be created" and then every one of those rows came back as a
 * failure. `name` has the same problem in the other direction: `text().notNull()`
 * accepts `""`, so a row with a blank name passed validation and would have
 * created a teacher called nothing.
 *
 * The create schema below is the server's rule, stated on this side. The update
 * schema is the table's, because `updateStaff` genuinely does leave an absent
 * field alone.
 */
const NIC_FORMAT_MESSAGE =
  "Enter a valid Sri Lankan NIC: 9 digits followed by V, or 12 digits";

const isValidNicFormat = (value: string): boolean =>
  /^\d{9}[vV]$/u.test(value) || /^\d{12}$/u.test(value);

const ISO_DATE_SHAPE_RE = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * `YYYY-MM-DD` and a real day.
 *
 * `isoDateSchema` is a shape check, and `staff.birthDate` is a `text` column, so
 * `2026-13-45` passes the schema, passes the insert, and is then unparseable by
 * every date formatter in the app — including the one on this feature's own
 * profile dialog. A spreadsheet is exactly where that value comes from.
 */
const isRealIsoDate = (value: string): boolean => {
  if (!ISO_DATE_SHAPE_RE.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};

const importDateSchema = v.pipe(
  v.string(),
  v.check(
    isRealIsoDate,
    "Date must be a real calendar date written as YYYY-MM-DD"
  )
);

const importCreateSchema = v.object({
  ...v.pick(staffInsertSchema, ["email", "phone", "gender"]).entries,
  name: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "A teacher cannot be created without a name")
  ),
  nic: v.pipe(
    v.string(),
    v.minLength(1, "NIC is required — it becomes the login username"),
    v.check(isValidNicFormat, NIC_FORMAT_MESSAGE)
  ),
  birthDate: v.optional(importDateSchema),
});

const importUpdateSchema = v.object({
  ...v.pick(staffUpdateSchema, [
    "name",
    "email",
    "phone",
    "gender",
    "birthDate",
  ]).entries,
  birthDate: v.optional(importDateSchema),
});

const cell = (row: Record<string, string>, field: string) =>
  (row[field] ?? "").trim();

/** The fields this row actually says something about. */
const suppliedFields = (row: Record<string, string>) =>
  IMPORT_FIELDS.filter((field) => cell(row, field) !== "");

/**
 * A blank cell means "leave the field on the record alone", and the preview
 * says so.
 *
 * The alternative — treating a blank cell as "clear this field" — cannot be
 * honoured. `updateStaff` cannot null `gender` at all (`staffColumnRefinements`
 * types it `v.optional(v.picklist(GENDERS))`, not nullable), and an absent key
 * means "do not change" everywhere else. So a row that looked like it was
 * clearing a teacher's phone number would have been staged as a conflict, the
 * diff would have shown "In your file: —", and applying it would have changed
 * nothing. Reading a blank as silence makes the diff and the write agree.
 *
 * Clearing a field is a deliberate act and belongs in the Edit dialog, where the
 * form sends an explicit `null`.
 */
const toUpdatePayload = (row: Record<string, string>) => ({
  name: cell(row, "name") || undefined,
  email: cell(row, "email") || undefined,
  phone: cell(row, "phone") || undefined,
  nic: cell(row, "nic") || undefined,
  gender: (cell(row, "gender") || undefined) as Staff["gender"] | undefined,
  birthDate: cell(row, "birthDate") || undefined,
});

/**
 * A new record. `name` and `nic` are passed through even when blank, because
 * `importCreateSchema` is what turns "blank" into "A teacher cannot be created
 * without a name" — dropping the key instead would produce valibot's own
 * "Invalid value: expected string", which names no field and no remedy.
 */
const toCreatePayload = (row: Record<string, string>) => ({
  name: cell(row, "name"),
  nic: cell(row, "nic"),
  email: cell(row, "email") || undefined,
  phone: cell(row, "phone") || undefined,
  gender: (cell(row, "gender") || undefined) as Staff["gender"] | undefined,
  birthDate: cell(row, "birthDate") || undefined,
});

interface RawIssue {
  message?: string;
  type?: string;
  path?: readonly { key?: unknown }[];
}

/** Every valibot issue in a failed parse, as a per-field problem a human can read. */
const collectValidationProblems = (
  issues: readonly RawIssue[]
): RowProblem[] => {
  const problems: RowProblem[] = [];
  for (const issue of issues) {
    const key = issue.path?.[0]?.key;
    const field = IMPORT_FIELDS.find((candidate) => candidate === key);
    problems.push({
      severity: "error",
      field: field ? FIELD_LABEL[field] : "Row",
      message: field
        ? friendlyValidationMessage(issue.message, issue.type)
        : (issue.message ?? "This row could not be read."),
    });
  }
  return problems;
};

/**
 * Does this row actually say something different about this record?
 *
 * Only the fields the row supplies count, for the reason on `toUpdatePayload`: a
 * blank cell is silence, so comparing it against a stored value would stage a
 * conflict for a difference the admin did not ask for.
 */
const rowsDiffer = (
  current: Record<string, unknown>,
  row: Record<string, string>
) =>
  suppliedFields(row).some(
    (field) => (current[field] ?? "") !== cell(row, field)
  );

const planOneRow = (
  raw: Record<string, string>,
  line: number,
  existingById: Map<string, Staff>
): PlannedRow => {
  const subject =
    cell(raw, "name") ||
    (cell(raw, "id") ? `id ${cell(raw, "id")}` : "unnamed row");
  const existing = cell(raw, "id")
    ? existingById.get(cell(raw, "id"))
    : undefined;

  if (!existing) {
    const result = v.safeParse(importCreateSchema, toCreatePayload(raw));
    if (!result.success) {
      return {
        line,
        raw,
        kind: "invalid",
        subject,
        problems: collectValidationProblems(result.issues),
        payload: null,
        existing: null,
      };
    }

    /*
     * A row carrying an `id` that is not on this year's roster.
     *
     * The importer has always read an unmatched id as "a new teacher", because
     * `id` is only meaningful as "the row I exported earlier" and the roster is
     * the only place that can answer it. That is a reasonable default and also a
     * quiet one: a spreadsheet carried over from a different year, or with a
     * mistyped id, silently creates a duplicate teacher instead of updating the
     * one the admin was looking at. So it still creates — the admin may well
     * mean it — but the preview says so in words, per row, before anything is
     * written.
     */
    const problems: RowProblem[] = cell(raw, "id")
      ? [
          {
            severity: "warning",
            field: "id",
            message:
              "No record with this id is on this year's roster, so this row will create a new teacher rather than update one. Remove the id column if that is not what you meant.",
          },
        ]
      : [];

    return {
      line,
      raw,
      kind: "create",
      subject,
      problems,
      payload: result.output as Record<string, unknown>,
      existing: null,
    };
  }

  const currentComparable = {
    name: existing.name,
    email: existing.email ?? "",
    phone: existing.phone ?? "",
    nic: existing.nic ?? "",
    gender: existing.gender ?? "",
    birthDate: existing.birthDate ?? "",
  };

  if (!rowsDiffer(currentComparable, raw)) {
    return {
      line,
      raw,
      kind: "unchanged",
      subject,
      problems: [],
      payload: null,
      existing,
    };
  }

  const result = v.safeParse(importUpdateSchema, toUpdatePayload(raw));
  if (!result.success) {
    return {
      line,
      raw,
      kind: "invalid",
      subject,
      problems: collectValidationProblems(result.issues),
      payload: null,
      existing,
    };
  }

  return {
    line,
    raw,
    kind: "conflict",
    subject,
    problems: [],
    payload: result.output as Record<string, unknown>,
    existing,
  };
};

/**
 * Read the file and decide what would happen — without writing anything.
 *
 * **This is the step that did not exist.** The file used to be read, classified
 * and written in one pass: `Promise.all` over `rows.map(processRow)`, where
 `processRow` called `onCreate` before the next row had even been looked at. So
 * the first refusal arrived after records had already been created, an invalid
 * row vanished with nothing but a count in a toast, and the only way to find out
 * which row had failed was to remember which line of the CSV it had come from.
 * Deciding first and writing second means every row's fate — and every row's
 * reason — is on screen before anything is touched.
 */
const buildPlan = (
  fileName: string,
  text: string,
  existingById: Map<string, Staff>
): ImportPlan => {
  let rows: Record<string, string>[];
  try {
    rows = parseCsv(text);
  } catch (error) {
    return {
      fileName,
      rows: [],
      fatal: `The file could not be read as CSV. ${
        error instanceof Error ? error.message : ""
      }`.trim(),
    };
  }

  const headers = Object.keys(rows[0] ?? {});
  const recognised = headers.filter((header) =>
    (TEMPLATE_COLUMNS as readonly string[]).includes(header)
  );

  if (recognised.length === 0) {
    return {
      fileName,
      rows: [],
      fatal: `This file does not look like a teacher import. Its header row has none of the columns the template uses (${TEMPLATE_COLUMNS.join(", ")}), and it has columns such as ${headers.join(", ") || "none"}. Download the blank template and paste the rows into it.`,
    };
  }

  if (rows.length === 0) {
    return {
      fileName,
      rows: [],
      fatal:
        "The file has a header row and no data rows. Nothing to import — add at least one teacher row below the header.",
    };
  }

  const planned: PlannedRow[] = [];
  for (const [index, raw] of rows.entries()) {
    planned.push(planOneRow(raw, index + 2, existingById));
  }

  return { fileName, rows: planned, fatal: null };
};

const countRows = (rows: PlannedRow[], kind: RowKind) =>
  rows.filter((row) => row.kind === kind).length;

const KIND_LABEL: Record<RowKind, string> = {
  create: "will be created",
  conflict: "will be staged for review",
  unchanged: "already matches the record",
  invalid: "will be skipped",
};

const countLabel = (count: number, kind: RowKind) =>
  `${count} ${count === 1 ? "row" : "rows"} ${KIND_LABEL[kind]}`;

/** One row's before and after, for the conflicts the admin still has to resolve. */
const conflictFields = (conflict: ImportConflict<Staff>) =>
  IMPORT_FIELDS.filter(
    (field) =>
      (conflict.current[field] ?? "") !== (conflict.incoming[field] ?? "")
  );

/** The problem rows a reader has to act on. */
const ProblemList = ({ rows }: { rows: PlannedRow[] }) => {
  const withProblems = rows.filter((row) => row.problems.length > 0);
  if (withProblems.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="font-heading text-sm font-medium">
        {withProblems.length} row{plural(withProblems.length)} to look at
      </p>
      <ul className="flex flex-col gap-2">
        {withProblems.map((row) => (
          <li
            key={row.line}
            className="border-primary/14 flex flex-col gap-1 border px-3 py-2"
          >
            <p className="text-xs font-semibold">
              Line {row.line} — {row.subject}
            </p>
            <ul className="flex flex-col gap-1">
              {row.problems.map((problem) => (
                <li
                  key={`${row.line}-${problem.field}-${problem.message}`}
                  className="text-muted-foreground flex items-start gap-1.5 text-xs"
                >
                  {problem.severity === "error" ? (
                    <IconCircleX
                      aria-hidden="true"
                      className="text-destructive mt-px size-3.5 shrink-0"
                    />
                  ) : (
                    <IconAlertTriangle
                      aria-hidden="true"
                      className="text-warning-ink mt-px size-3.5 shrink-0"
                    />
                  )}
                  <span>
                    <span className="font-medium">{problem.field}: </span>
                    {problem.message}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
};

const CountLine = ({
  count,
  kind,
  isProblem,
}: {
  count: number;
  kind: RowKind;
  isProblem: boolean;
}) => (
  <li className="flex items-center gap-1.5">
    {isProblem ? (
      <IconCircleX
        aria-hidden="true"
        className="text-destructive size-3.5 shrink-0"
      />
    ) : (
      <IconInfoCircle
        aria-hidden="true"
        className="text-muted-foreground size-3.5 shrink-0"
      />
    )}
    {countLabel(count, kind)}
  </li>
);

const FailureTable = ({ failures }: { failures: RowFailure[] }) => (
  <Table>
    <TableCaption className="sr-only">
      Rows this import did not write, and the server&rsquo;s reason for each
    </TableCaption>
    <TableHeader>
      <TableRow>
        <TableHead scope="col">Line</TableHead>
        <TableHead scope="col">Teacher</TableHead>
        <TableHead scope="col">Why it was not written</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {failures.map((failure) => (
        <TableRow key={failure.line}>
          <TableCell className="tabular-nums">{failure.line}</TableCell>
          <TableCell>{failure.subject}</TableCell>
          <TableCell className="whitespace-normal">{failure.message}</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

const REVIEW_NOTE =
  "Nothing is written until you confirm. Rows that cannot be imported are listed with the reason, and a blank cell leaves the field on the record unchanged.";

const WRITING_NOTE =
  "Writing rows one at a time. This window stays open until the run finishes.";

/**
 * The window's title and its one-line explanation.
 *
 * Four states, four sentences, written as early returns rather than a nested
 * ternary. The sentence is not decoration: it is what tells the reader whether
 * anything has been written yet, and the old title ("Review import") stayed on
 * screen after the write had finished, above a result table — a heading that
 * describes a step the reader had already left.
 */
const planHeadings = (
  plan: ImportPlan,
  phase: ImportPhase,
  hasFailures: boolean
): { title: string; description: string } => {
  if (plan.fatal) {
    return {
      title: "This file cannot be imported",
      description:
        "Nothing has been written. Fix the file and choose it again.",
    };
  }
  if (phase === "writing") {
    return { title: "Importing…", description: WRITING_NOTE };
  }
  if (phase === "done") {
    return {
      title: hasFailures ? "Import finished with problems" : "Import finished",
      description: hasFailures
        ? "The rows below were not written. Everything else was."
        : "What this import actually did.",
    };
  }
  return {
    title: `Review import — ${plan.fileName}`,
    description: REVIEW_NOTE,
  };
};

/** The plan on screen, before the write and while it runs. */
const ImportReviewBody = ({
  plan,
  isImporting,
}: {
  plan: ImportPlan;
  isImporting: boolean;
}) => {
  const createCount = countRows(plan.rows, "create");
  const conflictCount = countRows(plan.rows, "conflict");

  return (
    <div className="flex flex-col gap-4">
      {isImporting ? (
        <output className="block text-sm">{WRITING_NOTE}</output>
      ) : null}
      <ul className="grid gap-1 text-xs sm:grid-cols-2">
        <CountLine count={createCount} kind="create" isProblem={false} />
        <CountLine count={conflictCount} kind="conflict" isProblem={false} />
        <CountLine
          count={countRows(plan.rows, "unchanged")}
          kind="unchanged"
          isProblem={false}
        />
        <CountLine
          count={countRows(plan.rows, "invalid")}
          kind="invalid"
          isProblem={countRows(plan.rows, "invalid") > 0}
        />
      </ul>

      {conflictCount > 0 ? (
        <p className="text-muted-foreground border-primary/14 border px-3 py-2 text-xs">
          A row that differs from a teacher already on this year&rsquo;s roster
          is <strong>not</strong> overwritten. It is held for you to apply or
          discard afterwards, so a mistyped spreadsheet cannot silently rewrite
          a staff record.
        </p>
      ) : null}

      <ProblemList rows={plan.rows} />
    </div>
  );
};

/** What the run actually did, with every failure named. */
const ImportResultBody = ({
  failures,
  totals,
}: {
  failures: RowFailure[];
  totals: ImportTotals;
}) => {
  if (failures.length === 0) {
    return (
      <Empty className="min-h-48 border-none">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconInfoCircle aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>
            {totals.created} teacher{plural(totals.created)} created
          </EmptyTitle>
          <EmptyDescription>
            {totals.staged} row{plural(totals.staged)} staged for review and{" "}
            {totals.unchanged} already matched the record. The roster below has
            been updated.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        {totals.created} teacher{plural(totals.created)} created,{" "}
        {totals.staged} staged for review, {totals.unchanged} already up to
        date, and{" "}
        <span className="text-destructive font-semibold">
          {failures.length} row{plural(failures.length)} failed
        </span>
        .
      </p>
      <FailureTable failures={failures} />
    </div>
  );
};

/**
 * The import window. One dialog, four states, and each one says what it is
 * before the reader has to ask.
 *
 * A file that cannot be imported at all — a **fatal** problem, meaning not a
 * CSV, no data rows, or unreadable — gets the error panel and no confirm button
 * at all, because there is nothing that could be confirmed. The alternative was
 * a live "Import 0 teachers" button under an error, which is a control that
 * reliably does nothing.
 */
const ImportPlanDialog = ({
  plan,
  phase,
  failures,
  totals,
  onClose,
  onChooseFile,
  onApply,
  onDownloadFailedRows,
}: {
  plan: ImportPlan | null;
  phase: ImportPhase;
  failures: RowFailure[];
  totals: ImportTotals;
  onClose: () => void;
  onChooseFile: () => void;
  onApply: () => void;
  onDownloadFailedRows: () => void;
}) => {
  if (!plan) {
    return null;
  }

  const isImporting = phase === "writing";
  const showReview = !plan.fatal && (phase === "review" || isImporting);
  const showResult = !plan.fatal && phase === "done";
  const hasFailures = showResult && failures.length > 0;
  const createCount = countRows(plan.rows, "create");
  const hasSomethingToWrite =
    createCount + countRows(plan.rows, "conflict") > 0;
  const { title, description } = planHeadings(plan, phase, hasFailures);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isImporting) {
          onClose();
        }
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div
          className="flex-1 overflow-y-auto px-6 py-4"
          aria-busy={isImporting}
        >
          {plan.fatal ? (
            <QueryErrorPanel
              message={plan.fatal}
              onRetry={onChooseFile}
              title="The import was refused before anything was written"
              note="Choose another file, or download the blank template."
            />
          ) : null}

          {showResult ? (
            <ImportResultBody failures={failures} totals={totals} />
          ) : null}

          {showReview ? (
            <ImportReviewBody plan={plan} isImporting={isImporting} />
          ) : null}
        </div>

        {/*
          `mr-auto` rather than a `justify-between` override: the footer's own
          `sm:justify-end` is what keeps the actions on the right, and the
          download button is the one control that belongs on the left.
        */}
        <DialogFooter className="shrink-0 gap-2 border-t px-6 py-4">
          {hasFailures ? (
            <Button
              type="button"
              variant="outline"
              onClick={onDownloadFailedRows}
              className="mr-auto"
            >
              <IconDownload data-icon="inline-start" />
              Download failed rows
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isImporting}
          >
            Close
          </Button>
          {/*
            The write button exists in exactly one state. In the fatal state the
            recovery is the file picker, which the error panel's own button opens;
            in the result state the run is over. Offering a confirm under either
            is a control that either does nothing or repeats a write whose result
            the reader has already seen.
          */}
          {showReview ? (
            <Button
              type="button"
              onClick={onApply}
              disabled={isImporting || !hasSomethingToWrite}
              className="min-w-44"
            >
              {isImporting
                ? "Importing…"
                : `Import ${createCount} teacher${plural(createCount)}`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ConflictDiffTable = ({
  conflict,
}: {
  conflict: ImportConflict<Staff>;
}) => (
  <Table>
    <TableCaption className="sr-only">
      Fields where the imported row for {conflict.current.name} differs from the
      record on the server
    </TableCaption>
    <TableHeader>
      <TableRow>
        <TableHead scope="col">Field</TableHead>
        <TableHead scope="col">On the server</TableHead>
        <TableHead scope="col">In your file</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {conflictFields(conflict).map((field) => (
        <TableRow key={field}>
          <TableCell>{FIELD_LABEL[field]}</TableCell>
          <TableCell className="whitespace-normal">
            {conflict.current[field] || "—"}
          </TableCell>
          <TableCell className="whitespace-normal">
            {conflict.incoming[field] || "—"}
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

/**
 * The conflict resolver, and it is a `Dialog` and not an `AlertDialog`.
 *
 * An `AlertDialog` is for one question with one answer — delete this, are you
 * sure. This is a list of per-row decisions with a diff for each, and the window
 * has to stay open while they are made; using the confirmation primitive for it
 * meant an `AlertDialogCancel` labelled "Close" and no way to tell the reader
 * they were in a confirmation at all.
 */
const ImportConflictsDialog = ({
  isOpen,
  onOpenChange,
  conflicts,
  errors,
  applyingConflictId,
  onApply,
  onDiscard,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: ImportConflict<Staff>[];
  errors: Record<string, string>;
  applyingConflictId: string | null;
  onApply: (conflict: ImportConflict<Staff>) => void;
  onDiscard: (conflictId: string) => void;
}) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-2xl">
      <DialogHeader className="shrink-0 border-b px-6 py-4">
        <DialogTitle>Resolve import conflicts</DialogTitle>
        <DialogDescription>
          These rows from your last import differ from what the server has now.
          Nothing has been pushed — apply the imported values or discard the
          row, one at a time.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-6 py-4">
        {conflicts.map((conflict) => {
          const error = errors[conflict.conflictId];
          const isApplying = applyingConflictId === conflict.conflictId;

          return (
            <section
              key={conflict.conflictId}
              className="border-primary/14 flex flex-col gap-2 border px-3 py-3"
            >
              <h3 className="font-heading text-sm font-medium">
                {conflict.current.name}
              </h3>
              <ConflictDiffTable conflict={conflict} />
              {error ? (
                <p
                  role="alert"
                  className="border-destructive/30 bg-destructive/5 text-destructive border px-3 py-2 text-xs"
                >
                  {error}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onDiscard(conflict.conflictId)}
                  disabled={isApplying}
                >
                  Discard this row
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onApply(conflict)}
                  disabled={isApplying}
                  className="min-w-36"
                >
                  {isApplying ? "Applying…" : "Apply imported values"}
                </Button>
              </div>
            </section>
          );
        })}
      </div>
      <DialogFooter className="shrink-0 border-t px-6 py-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
        >
          Close
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

const EMPTY_TOTALS: ImportTotals = { created: 0, staged: 0, unchanged: 0 };

/**
 * Everything the import surface does, apart from drawing it.
 *
 * The state and the five handlers used to be inline in `TeacherCsvImport`, which
 * made a component over 300 lines long: the linter's size rule was right, and
 * so was the reader who wanted to know "what happens when a row is refused" and
 * had to scroll past two whole dialogs to find the `catch` that answered it.
 * Nothing about the behaviour moved — the decisions are the same, in the same
 * order — but they now live where they can be read on their own.
 */
const useCsvImport = ({
  teachers,
  onCreate,
  onUpdate,
}: TeacherCsvImportProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [conflicts, setConflicts] = useState<ImportConflict<Staff>[]>(() =>
    getImportConflicts<Staff>(NAMESPACE)
  );
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);
  /** Per-conflict failure, keyed by conflict id, so one refusal does not blank the rest. */
  const [conflictErrors, setConflictErrors] = useState<Record<string, string>>(
    {}
  );
  const [applyingConflictId, setApplyingConflictId] = useState<string | null>(
    null
  );
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [phase, setPhase] = useState<ImportPhase>("idle");
  const [failures, setFailures] = useState<RowFailure[]>([]);
  const [totals, setTotals] = useState<ImportTotals>(EMPTY_TOTALS);

  const isImporting = phase === "writing";

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    // Reset immediately: without it, choosing the *same* file twice in a row
    // fires no `change` event at all and the second attempt looks like a button
    // that has stopped working.
    event.target.value = "";
    if (!file) {
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch (error) {
      setPlan({
        fileName: file.name,
        rows: [],
        fatal: `The file could not be opened. ${
          error instanceof Error ? error.message : ""
        }`.trim(),
      });
      setPhase("review");
      return;
    }

    const existingById = new Map(
      teachers.map((teacher) => [teacher.id, teacher])
    );
    setPlan(buildPlan(file.name, text, existingById));
    setFailures([]);
    setTotals(EMPTY_TOTALS);
    setPhase("review");
  };

  const closePlan = () => {
    setPlan(null);
    setFailures([]);
    setTotals(EMPTY_TOTALS);
    setPhase("idle");
  };

  /**
   * Write the plan, one row at a time, and report exactly what happened.
   *
   * **Sequentially, and that is the point.** `Promise.all` over the rows fired
   * every `createStaff` in the file at once, so a 200-row file meant 200
   * concurrent writes, the server's own rate limit could refuse the tail, and
   * the reader had no idea which of the 200 had landed. One at a time also means
   * a failure is attributable to the row in front of you, which is the only way
   * the per-row report can be honest.
   *
   * A row that fails is recorded and the run continues: a bad NIC in row 40 is
   * not a reason to refuse rows 41-80, and stopping would leave the admin
   * guessing which half of the file was written.
   */
  const applyPlan = async () => {
    if (!plan || plan.fatal || isImporting) {
      return;
    }

    const rowsToWrite = plan.rows.filter(
      (row) => row.kind === "create" || row.kind === "conflict"
    );

    setPhase("writing");
    setFailures([]);

    const rowFailures: RowFailure[] = [];
    const stagedConflicts: ImportConflict<Staff>[] = [];
    let created = 0;

    for (const row of rowsToWrite) {
      if (row.kind === "conflict" && row.payload && row.existing) {
        stagedConflicts.push({
          conflictId: crypto.randomUUID(),
          recordId: row.existing.id,
          current: row.existing,
          incoming: { ...row.existing, ...row.payload } as Staff,
          importedAt: new Date().toISOString(),
        });
        continue;
      }

      if (row.kind === "create" && row.payload) {
        try {
          // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- these are writes to one table and must be sequential: a refusal has to be attributable to the row in front of the reader, and a 200-row file must not become 200 concurrent requests
          await onCreate(row.payload);
          created += 1;
        } catch (error) {
          rowFailures.push({
            line: row.line,
            subject: row.subject,
            message: formatApiErrorMessage(
              error,
              "The server refused this row."
            ),
          });
        }
      }
    }

    if (stagedConflicts.length > 0) {
      addImportConflicts<Staff>(NAMESPACE, stagedConflicts);
      setConflicts(getImportConflicts<Staff>(NAMESPACE));
    }

    const unchanged = countRows(plan.rows, "unchanged");
    setFailures(rowFailures);
    setTotals({ created, staged: stagedConflicts.length, unchanged });

    /*
     * Success is only ever claimed for a clean run.
     *
     * This used to be one unconditional `toast.success("Import complete: …")`
     * whose message happened to end in ", 12 skipped (invalid data)" when a
     * third of the file had been thrown away — a green toast over a partial
     * import is the single most misleading thing this button can do. A run with
     * any failure is an error toast that names both numbers, and the per-row
     * table in the window is the detail behind it.
     */
    if (rowFailures.length === 0) {
      toast.success(
        `Imported ${created} teacher${plural(created)}, ${stagedConflicts.length} staged for review, ${unchanged} already up to date`
      );
    } else {
      toast.error(
        `Imported ${created} of ${rowsToWrite.length} row${plural(rowsToWrite.length)} — ${rowFailures.length} failed. The failed rows are listed in the import window.`
      );
    }

    setPhase("done");
  };

  /**
   * Apply one staged conflict — and only the fields the diff says differ.
   *
   * It used to send all six fields, so applying a conflict that differed on the
   * phone number also re-sent `name`, `nic`, `gender` and `birthDate` as they
   * were when the file was read. Anything edited on the record in the meantime
   * was silently rolled back, in a dialog whose whole purpose is showing the
   * reader what is about to change. `conflictFields` is the same list the table
   * above the buttons renders, so what is shown and what is written cannot drift
   * apart.
   */
  const handleApplyConflict = async (conflict: ImportConflict<Staff>) => {
    setApplyingConflictId(conflict.conflictId);
    setConflictErrors((previous) => ({
      ...previous,
      [conflict.conflictId]: "",
    }));

    try {
      const payload: Record<string, unknown> = {};
      for (const field of conflictFields(conflict)) {
        payload[field] = conflict.incoming[field];
      }
      await onUpdate(conflict.recordId, payload);
      removeImportConflict(NAMESPACE, conflict.conflictId);
      setConflicts(getImportConflicts<Staff>(NAMESPACE));
      toast.success(`Applied the imported row for ${conflict.incoming.name}`);
    } catch (error) {
      /*
        The row stays in the list and the reason is printed beside its buttons,
        so one refusal neither loses the other nine nor leaves the reviewer
        guessing whether the click registered.
      */
      setConflictErrors((previous) => ({
        ...previous,
        [conflict.conflictId]: formatApiErrorMessage(
          error,
          "The server refused this update."
        ),
      }));
    }

    setApplyingConflictId(null);
  };

  const handleDiscardConflict = (conflictId: string) => {
    removeImportConflict(NAMESPACE, conflictId);
    setConflicts(getImportConflicts<Staff>(NAMESPACE));
  };

  const openConflicts = () => {
    setConflictErrors({});
    setIsConflictDialogOpen(true);
  };

  /**
   * The failed rows, as a CSV the admin can fix and re-import.
   *
   * A per-row report in a modal is only half a recovery: the reader has to
   * transcribe the line numbers back into the file they still have open
   * somewhere else. This hands back the original rows — the whole row, not just
   * the field that failed, so a corrected row is a complete row — with the
   * reason beside it, so the file itself carries the explanation.
   */
  const downloadFailedRows = () => {
    const reasonByLine = new Map(
      failures.map((failure) => [failure.line, failure.message])
    );
    const rows: Record<string, string | null | undefined>[] = [];

    for (const row of plan?.rows ?? []) {
      const reason = reasonByLine.get(row.line);
      if (!reason) {
        continue;
      }
      const exported: Record<string, string> = {};
      for (const column of TEMPLATE_COLUMNS) {
        exported[column] = row.raw[column] ?? "";
      }
      rows.push({ ...exported, importProblem: reason });
    }

    downloadCsv(
      "teachers-import-failed-rows.csv",
      toCsv([...TEMPLATE_COLUMNS, "importProblem"], rows)
    );
  };

  return {
    fileInputRef,
    conflicts,
    isConflictDialogOpen,
    setIsConflictDialogOpen,
    conflictErrors,
    applyingConflictId,
    plan,
    phase,
    failures,
    totals,
    isImporting,
    openFilePicker,
    handleFileChange,
    closePlan,
    applyPlan,
    handleApplyConflict,
    handleDiscardConflict,
    openConflicts,
    downloadFailedRows,
  };
};

/** The three controls, in the order the task reads: template, import, resolve. */
const CsvImportButtons = ({
  conflictCount,
  isImporting,
  onDownloadTemplate,
  onImportClick,
  onResolveConflicts,
}: {
  conflictCount: number;
  isImporting: boolean;
  onDownloadTemplate: () => void;
  onImportClick: () => void;
  onResolveConflicts: () => void;
}) => (
  <>
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onDownloadTemplate}
    >
      <IconDownload data-icon="inline-start" />
      Blank template
    </Button>
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onImportClick}
      disabled={isImporting}
    >
      <IconUpload data-icon="inline-start" />
      {isImporting ? "Importing…" : "Import CSV"}
    </Button>
    {conflictCount > 0 ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onResolveConflicts}
      >
        <Badge variant="destructive" className="mr-1">
          {conflictCount}
        </Badge>
        Resolve import conflicts
      </Button>
    ) : null}
  </>
);

export const TeacherCsvImport = (props: TeacherCsvImportProps) => {
  const {
    fileInputRef,
    conflicts,
    isConflictDialogOpen,
    setIsConflictDialogOpen,
    conflictErrors,
    applyingConflictId,
    plan,
    phase,
    failures,
    totals,
    isImporting,
    openFilePicker,
    handleFileChange,
    closePlan,
    applyPlan,
    handleApplyConflict,
    handleDiscardConflict,
    openConflicts,
    downloadFailedRows,
  } = useCsvImport(props);

  return (
    <>
      <CsvImportButtons
        conflictCount={conflicts.length}
        isImporting={isImporting}
        onDownloadTemplate={downloadBlankTemplate}
        onImportClick={openFilePicker}
        onResolveConflicts={openConflicts}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleFileChange}
      />

      <ImportPlanDialog
        plan={plan}
        phase={phase}
        failures={failures}
        totals={totals}
        onClose={closePlan}
        onChooseFile={openFilePicker}
        onApply={applyPlan}
        onDownloadFailedRows={downloadFailedRows}
      />

      <ImportConflictsDialog
        isOpen={isConflictDialogOpen}
        onOpenChange={setIsConflictDialogOpen}
        conflicts={conflicts}
        errors={conflictErrors}
        applyingConflictId={applyingConflictId}
        onApply={handleApplyConflict}
        onDiscard={handleDiscardConflict}
      />
    </>
  );
};
