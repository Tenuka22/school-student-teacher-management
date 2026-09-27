import type { class_ as classTable } from "@school-student-teacher-management/db/schema/academics";
import { classInsertSchema } from "@school-student-teacher-management/db/schema/academics";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconDownload,
  IconUpload,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

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
import { orpc } from "@/utils/orpc";

type Class = typeof classTable.$inferSelect;

/**
 * A staged conflict, plus the one piece of display data the class record does
 * not carry.
 *
 * `ImportConflict<T>` types both `current` and `incoming` as `T`, and
 * `incoming.homeroomTeacherId` is a UUID — a diff that reads `3f9a…` instead of
 * a name is a diff nobody can act on. The name therefore rides on the incoming
 * record, where it is persisted with the conflict and survives a reload.
 */
type StagedRecord = Class & { incomingTeacherName?: string | null };

type StagedConflict = ImportConflict<StagedRecord>;

const TEMPLATE_COLUMNS = [
  "id",
  "name",
  "gradeLevel",
  "medium",
  "homeroomTeacher",
  "homeroomTeacherId",
] as const;

const NAMESPACE = "classes";

/** Columns a file must carry before it is worth reading as a class list. */
const REQUIRED_COLUMNS = ["name", "gradeLevel", "medium"] as const;

const MEDIUM_LABEL: Record<string, string> = {
  sinhala: "Sinhala",
  tamil: "Tamil",
  english: "English",
};

const describeMedium = (medium: string) => MEDIUM_LABEL[medium] ?? medium;

/**
 * A template that can actually be filled in.
 *
 * The homeroom column is a **name**, because a column headed
 * `homeroomTeacherId` asks a person to type a UUID. The id column is kept for
 * round trips — export, edit, re-import — and both are demonstrated in the
 * example row, since a CSV has nowhere else to explain itself.
 */
const downloadBlankTemplate = () => {
  const exampleRow: Record<string, string> = {
    id: "",
    name: "10-A",
    gradeLevel: "10",
    medium: "english",
    homeroomTeacher: "type the teacher's full name here",
    homeroomTeacherId: "",
  };

  downloadCsv(
    "classes-template.csv",
    toCsv([...TEMPLATE_COLUMNS], [exampleRow])
  );
};

const comparableColumns = [
  "name",
  "gradeLevel",
  "medium",
  "homeroomTeacherId",
] as const;

const rowsDiffer = (
  current: Record<string, unknown>,
  incoming: Record<string, unknown>
) =>
  comparableColumns.some(
    (column) => (current[column] ?? "") !== (incoming[column] ?? "")
  );

interface RejectedRow {
  kind: "invalid";
  line: number;
  name: string;
  problem: string;
}

interface CreateRow {
  kind: "create";
  line: number;
  name: string;
  gradeLevel: number;
  medium: string;
  homeroomTeacherId: string | null;
  homeroomTeacherName: string | null;
}

interface UpdateRow {
  kind: "update";
  line: number;
  name: string;
  existing: Class;
  gradeLevel: number;
  medium: string;
  homeroomTeacherId: string | null;
  homeroomTeacherName: string | null;
}

/** What the importer decided to do with one row, and why. */
type RowPlan =
  | CreateRow
  | UpdateRow
  | { kind: "unchanged"; line: number; name: string; existing: Class }
  | RejectedRow;

const isRejected = (row: RowPlan): row is RejectedRow => row.kind === "invalid";

interface ImportPlan {
  fileName: string;
  rows: RowPlan[];
}

interface WriteFailure {
  line: number;
  name: string;
  reason: string;
}

interface ImportResult {
  created: number;
  staged: number;
  unchanged: number;
  rejected: RejectedRow[];
  failures: WriteFailure[];
}

const OUTCOME_LABEL: Record<RowPlan["kind"], string> = {
  create: "Create",
  update: "Stage for review",
  unchanged: "No change",
  invalid: "Rejected",
};

const OutcomeBadge = ({ kind }: { kind: RowPlan["kind"] }) => {
  if (kind === "create") {
    return <Badge variant="secondary">{OUTCOME_LABEL.create}</Badge>;
  }
  if (kind === "update") {
    return <Badge variant="warning">{OUTCOME_LABEL.update}</Badge>;
  }
  if (kind === "invalid") {
    return <Badge variant="destructive">{OUTCOME_LABEL.invalid}</Badge>;
  }
  return <Badge variant="ghost">{OUTCOME_LABEL.unchanged}</Badge>;
};

/** The names a `homeroomTeacher` cell can be matched against, by name and id. */
interface Roster {
  byName: Map<string, { id: string; name: string }[]>;
  byId: Map<string, string>;
}

const buildRoster = (members: { id: string; name: string }[]): Roster => {
  const byName = new Map<string, { id: string; name: string }[]>();
  const byId = new Map<string, string>();
  for (const member of members) {
    const key = member.name.trim().toLowerCase();
    const bucket = byName.get(key) ?? [];
    bucket.push({ id: member.id, name: member.name });
    byName.set(key, bucket);
    byId.set(member.id, member.name);
  }
  return { byName, byId };
};

type ResolvedTeacher =
  | { ok: true; id: string | null; name: string | null }
  | { ok: false; problem: string };

/**
 * The `homeroomTeacher` / `homeroomTeacherId` columns, resolved against this
 * year's teaching staff.
 *
 * `onlyPositioned` is the same predicate the assignment procedure enforces
 * (`assertTeacherEligibleForYear` → `getEligibleTeacherIds`), so a name that
 * resolves here is a name the write will accept, and a name that does not is
 * caught here rather than as a failed request per row. Two staff sharing a name
 * is reported as ambiguous, never guessed at.
 */
const resolveNamedTeacher = (
  named: string,
  roster: Roster
): ResolvedTeacher => {
  const matches = roster.byName.get(named.toLowerCase()) ?? [];
  const [firstMatch] = matches;
  if (!firstMatch) {
    return {
      ok: false,
      problem:
        roster.byId.size === 0
          ? `This year's teaching roster came back empty, so "${named}" could not be checked. Reload the page and import again.`
          : `No teacher named "${named}" is on this year's teaching roster. Leave the column blank to import the class without one.`,
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      problem: `"${named}" matches ${matches.length} teachers on the roster. Use the homeroomTeacherId column for that one.`,
    };
  }
  return { ok: true, id: firstMatch.id, name: firstMatch.name };
};

const resolveTeacher = (
  row: Record<string, string>,
  roster: Roster
): ResolvedTeacher => {
  const namedTeacher = row.homeroomTeacher?.trim() ?? "";
  if (namedTeacher) {
    return resolveNamedTeacher(namedTeacher, roster);
  }

  const idTeacher = row.homeroomTeacherId?.trim() ?? "";
  if (!idTeacher) {
    return { ok: true, id: null, name: null };
  }
  const matchedName = roster.byId.get(idTeacher);
  if (!matchedName) {
    return {
      ok: false,
      problem: `homeroomTeacherId "${idTeacher}" is not on this year's teaching roster.`,
    };
  }
  return { ok: true, id: idTeacher, name: matchedName };
};

const rejected = (
  line: number,
  name: string,
  problem: string
): RejectedRow => ({
  kind: "invalid",
  line,
  name: name || "(no class name)",
  problem,
});

interface ValidRowFields {
  name: string;
  gradeLevel: number;
  medium: string;
}

/** The name, grade and medium, checked against the same schema the write uses. */
const parseRowFields = (
  row: Record<string, string>,
  academicYearId: string
): { ok: true; value: ValidRowFields } | { ok: false; problem: string } => {
  const name = row.name?.trim() ?? "";
  const parsed = v.safeParse(
    v.pick(classInsertSchema, [
      "academicYearId",
      "name",
      "gradeLevel",
      "medium",
    ]),
    {
      academicYearId,
      name,
      gradeLevel: Number(row.gradeLevel),
      medium: row.medium?.trim().toLowerCase() ?? "",
    }
  );
  if (parsed.success) {
    return {
      ok: true,
      value: {
        name,
        gradeLevel: parsed.output.gradeLevel,
        medium: parsed.output.medium,
      },
    };
  }
  const [first] = parsed.issues;
  const field = first?.path?.[0]?.key;
  const message = friendlyValidationMessage(first?.message, first?.type);
  return {
    ok: false,
    problem: field
      ? `${String(field)}: ${message}`
      : (message ?? "Invalid row"),
  };
};

/** Records the name and reports a clash with an earlier line in the same file. */
const claimName = (
  gradeLevel: number,
  name: string,
  line: number,
  seenNames: Map<string, number>
): string | null => {
  const key = `${gradeLevel}:${name.toLowerCase()}`;
  const previousLine = seenNames.get(key);
  if (previousLine !== undefined) {
    return `Duplicates the class "${name}" already given on line ${previousLine}.`;
  }
  seenNames.set(key, line);
  return null;
};

/** A row that named an existing class, judged against what that class holds. */
const planAgainstExisting = (args: {
  incomingId: string;
  line: number;
  fields: ValidRowFields;
  teacher: Extract<ResolvedTeacher, { ok: true }>;
  existingById: Map<string, Class>;
}): RowPlan => {
  const { incomingId, line, fields, teacher } = args;
  const { name, gradeLevel, medium } = fields;

  const existing = args.existingById.get(incomingId);
  if (!existing) {
    // The dangerous branch. A file carrying ids that match nothing in the year
    // it is being loaded into would otherwise create a second copy of every
    // class it names, on a year that looked right on the way in.
    return rejected(
      line,
      name,
      `id "${incomingId}" does not match a class in the loaded list for this year. Clear the id column to create it as a new class.`
    );
  }

  // A grade cannot be changed after the fact. `updateClass` picks `name` and
  // `medium` and nothing else, so a differing grade in the file is not a
  // conflict to be reviewed — it is a value the server will quietly discard.
  // Rejecting the row is the only way the person finds out.
  if (existing.gradeLevel !== gradeLevel) {
    return rejected(
      line,
      name,
      `The class on record is in Grade ${existing.gradeLevel} and the file says Grade ${gradeLevel}. A class's grade cannot be changed once it exists — delete the class and import the row again to move it, or correct the grade in the file.`
    );
  }

  const differs = rowsDiffer(
    {
      name: existing.name,
      gradeLevel: String(existing.gradeLevel),
      medium: existing.medium,
      homeroomTeacherId: existing.homeroomTeacherId ?? "",
    },
    {
      name,
      gradeLevel: String(gradeLevel),
      medium,
      // A blank homeroom column means "leave it alone", never "unassign".
      homeroomTeacherId: teacher.id ?? "",
    }
  );

  if (!differs) {
    return { kind: "unchanged", line, name: existing.name, existing };
  }

  return {
    kind: "update",
    line,
    name,
    existing,
    gradeLevel,
    medium,
    homeroomTeacherId: teacher.id,
    homeroomTeacherName: teacher.name,
  };
};

/** One row of the file, judged against the year and the current class list. */
const planRow = (
  row: Record<string, string>,
  line: number,
  context: {
    academicYearId: string;
    existingById: Map<string, Class>;
    roster: Roster;
    seenNames: Map<string, number>;
  }
): RowPlan => {
  const parsed = parseRowFields(row, context.academicYearId);
  if (!parsed.ok) {
    return rejected(line, row.name?.trim() ?? "", parsed.problem);
  }
  const fields = parsed.value;

  // A class name is unique within a grade, and the file is about to be asked to
  // create two of them.
  const duplicate = claimName(
    fields.gradeLevel,
    fields.name,
    line,
    context.seenNames
  );
  if (duplicate) {
    return rejected(line, fields.name, duplicate);
  }

  const teacher = resolveTeacher(row, context.roster);
  if (!teacher.ok) {
    return rejected(line, fields.name, teacher.problem);
  }

  const incomingId = row.id?.trim() ?? "";
  if (!incomingId) {
    return {
      kind: "create",
      line,
      name: fields.name,
      gradeLevel: fields.gradeLevel,
      medium: fields.medium,
      homeroomTeacherId: teacher.id,
      homeroomTeacherName: teacher.name,
    };
  }

  return planAgainstExisting({
    incomingId,
    line,
    fields,
    teacher,
    existingById: context.existingById,
  });
};

/**
 * Every row is judged before a single byte is written.
 *
 * The importer used to write as it read: `Promise.all` over the rows, each one
 * creating immediately, the whole thing inside one `try`. That fails three ways
 * at once — a refusal halfway through abandons the rows behind it with no
 * record of what landed, a row the schema rejects returns the bare string
 * `"invalid"` that becomes `(invalid data)` inside a *success* toast, and a file
 * that matched nothing at all still got `toast.success`. Deciding first is also
 * what makes the preview possible, and the preview is the only place a person
 * can see that their `homeroomTeacher` column spelled a name this year's staff
 * list does not contain.
 */
const buildPlan = (
  rawRows: Record<string, string>[],
  context: { academicYearId: string; classes: Class[]; roster: Roster }
): RowPlan[] => {
  const plans: RowPlan[] = [];
  const shared = {
    academicYearId: context.academicYearId,
    existingById: new Map(context.classes.map((cls) => [cls.id, cls])),
    roster: context.roster,
    seenNames: new Map<string, number>(),
  };
  for (const [index, row] of rawRows.entries()) {
    // Line 1 is the header, so the first data row is line 2.
    plans.push(planRow(row, index + 2, shared));
  }
  return plans;
};

const countPlan = (rows: RowPlan[]) => {
  const counts = { create: 0, update: 0, unchanged: 0, invalid: 0 };
  for (const row of rows) {
    counts[row.kind] += 1;
  }
  return counts;
};

const toStagedConflict = (row: UpdateRow): StagedConflict => ({
  conflictId: crypto.randomUUID(),
  recordId: row.existing.id,
  current: row.existing,
  incoming: {
    ...row.existing,
    name: row.name,
    gradeLevel: row.gradeLevel,
    medium: row.medium,
    ...(row.homeroomTeacherId
      ? { homeroomTeacherId: row.homeroomTeacherId }
      : {}),
    incomingTeacherName: row.homeroomTeacherName,
  },
  importedAt: new Date().toISOString(),
});

/**
 * The three preview columns for one row.
 *
 * A row that matched an existing class shows what is *on the server* rather
 * than what the file asked for — the two are the same for a row about to be
 * staged, and saying "unchanged" in the homeroom column is the honest reading
 * of a blank cell there. A rejected row has no values to show at all, because
 * it never got that far.
 */
const previewCells = (row: RowPlan) => {
  if (row.kind === "unchanged") {
    return {
      grade: String(row.existing.gradeLevel),
      medium: describeMedium(row.existing.medium),
      teacher: "unchanged",
    };
  }
  if (row.kind === "invalid") {
    return { grade: "—", medium: "—", teacher: "—" };
  }
  return {
    grade: String(row.gradeLevel),
    medium: describeMedium(row.medium),
    teacher: row.homeroomTeacherName ?? "none",
  };
};

const ResultTile = ({
  label,
  value,
  negative = false,
}: {
  label: string;
  value: number;
  negative?: boolean;
}) => (
  <li
    className={
      negative
        ? "border-destructive/40 bg-destructive/5 border p-3"
        : "border p-3"
    }
  >
    <p
      className={
        negative
          ? "text-destructive font-heading text-2xl font-semibold tabular-nums"
          : "font-heading text-2xl font-semibold tabular-nums"
      }
    >
      {value}
    </p>
    <p className="text-muted-foreground text-xs">{label}</p>
  </li>
);

const ProblemSection = ({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) => (
  <section className="border-destructive/40 border p-3">
    <h3 className="text-destructive flex items-center gap-2 text-sm font-semibold">
      <IconAlertTriangle aria-hidden="true" className="size-4" />
      {title}
    </h3>
    <p className="text-muted-foreground mt-1 text-xs">{note}</p>
    <div className="mt-2">{children}</div>
  </section>
);

/**
 * What the import actually did, in one sentence, and never optimistically.
 *
 * `toast.success` on a partial import is the specific lie this replaces: three
 * of sixty rows written, one refused, and a green box saying "Import complete".
 */
const announceImport = (
  created: number,
  staged: number,
  unchanged: number,
  refused: number
) => {
  const written = created + staged;
  if (refused > 0 && written === 0) {
    toast.error(
      `Nothing was imported — the server refused all ${refused} ${refused === 1 ? "row" : "rows"}`
    );
    return;
  }
  if (refused > 0) {
    toast.warning(
      `Imported ${written} of ${written + refused} — ${refused} ${refused === 1 ? "row was" : "rows were"} refused`
    );
    return;
  }
  if (written === 0) {
    toast.info("Nothing to import — every row already matches this year");
    return;
  }
  const current = unchanged > 0 ? `, ${unchanged} already current` : "";
  toast.success(`${created} created, ${staged} staged for review${current}`);
};

const importButtonLabel = (isReading: boolean, isWriting: boolean) => {
  if (isReading) {
    return "Reading…";
  }
  return isWriting ? "Importing…" : "Import CSV";
};

const confirmLabel = (
  counts: { create: number; update: number },
  isWriting: boolean
) => {
  if (isWriting) {
    return "Importing…";
  }
  if (counts.update > 0) {
    return `Create ${counts.create}, stage ${counts.update}`;
  }
  return `Create ${counts.create} ${counts.create === 1 ? "class" : "classes"}`;
};

interface ImportPlanDialogProps {
  plan: ImportPlan;
  result: ImportResult | null;
  isWriting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Two states, one dialog: what the file would do, and what it did.
 *
 * Someone who has just gone back to a spreadsheet to fix a name needs to see
 * the plan they fixed it against, which a dialog that only reported counts
 * could not do.
 */
const ImportPlanDialog = ({
  plan,
  result,
  isWriting,
  onConfirm,
  onClose,
}: ImportPlanDialogProps) => {
  const counts = countPlan(plan.rows);
  const notImported = result
    ? result.rejected.length + result.failures.length
    : 0;

  const rejectedRows = plan.rows.filter(isRejected);

  const body = () => {
    if (result) {
      return (
        <>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ResultTile label="Created" value={result.created} />
            <ResultTile label="Staged for review" value={result.staged} />
            <ResultTile label="Already current" value={result.unchanged} />
            <ResultTile
              label="Not imported"
              value={notImported}
              negative={notImported > 0}
            />
          </ul>

          {result.failures.length > 0 && (
            <ProblemSection
              title="Refused by the server"
              note="These rows were not written. The server's reason is quoted."
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Line</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.failures.map((failure) => (
                    <TableRow key={failure.line}>
                      <TableCell className="tabular-nums">
                        {failure.line}
                      </TableCell>
                      <TableCell className="font-medium">
                        {failure.name}
                      </TableCell>
                      <TableCell className="text-destructive">
                        {failure.reason}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ProblemSection>
          )}

          {result.rejected.length > 0 && (
            <ProblemSection
              title="Rejected before sending"
              note="These rows never reached the server. Fix the file and import it again."
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Line</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Problem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rejected.map((row) => (
                    <TableRow key={row.line}>
                      <TableCell className="tabular-nums">{row.line}</TableCell>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{row.problem}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ProblemSection>
          )}

          {notImported === 0 && (
            <p className="text-success flex items-center gap-2 text-sm font-semibold">
              <IconCircleCheck aria-hidden="true" className="size-4" />
              Every row in the file was accounted for.
            </p>
          )}
        </>
      );
    }

    return (
      <>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ResultTile label="To create" value={counts.create} />
          <ResultTile label="To stage for review" value={counts.update} />
          <ResultTile label="Already current" value={counts.unchanged} />
          <ResultTile
            label="Rejected"
            value={counts.invalid}
            negative={counts.invalid > 0}
          />
        </ul>

        {counts.update > 0 && (
          <p className="text-muted-foreground text-xs">
            A row that matches an existing class is never overwritten. It is
            staged so each one can be applied or discarded on the face of it.
          </p>
        )}

        <div className="max-h-80 overflow-auto border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">Line</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead>Medium</TableHead>
                <TableHead>Homeroom teacher</TableHead>
                <TableHead>Outcome</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plan.rows.map((row) => (
                <TableRow key={row.line}>
                  <TableCell className="tabular-nums">{row.line}</TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{previewCells(row).grade}</TableCell>
                  <TableCell>{previewCells(row).medium}</TableCell>
                  <TableCell>{previewCells(row).teacher}</TableCell>
                  <TableCell>
                    <OutcomeBadge kind={row.kind} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {counts.invalid > 0 && (
          <ProblemSection
            title="Why rows were rejected"
            note="Nothing was written for these rows. Fix the file and import it again."
          >
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {rejectedRows.map((row) => (
                <li key={row.line}>
                  Line {row.line} — {row.name}: {row.problem}
                </li>
              ))}
            </ul>
          </ProblemSection>
        )}
      </>
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isWriting) {
          onClose();
        }
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
          <DialogTitle className="font-heading text-lg font-semibold">
            {result ? "Import result" : `Check ${plan.fileName}`}
          </DialogTitle>
          <DialogDescription>
            {result
              ? "Every row in the file is accounted for below."
              : "Nothing has been written yet. Check the rows, then confirm."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {body()}
        </div>

        <DialogFooter className="shrink-0 border-t px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={isWriting}>
            Close
          </Button>
          {!result && (
            <Button
              onClick={onConfirm}
              disabled={isWriting || counts.create + counts.update === 0}
              className="min-w-48"
            >
              {confirmLabel(counts, isWriting)}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface ConflictReviewDialogProps {
  conflicts: StagedConflict[];
  classes: Class[];
  roster: Roster;
  resolvingId: string | null;
  onApply: (conflict: StagedConflict) => void;
  onDiscard: (conflictId: string) => void;
  onOpenChange: (open: boolean) => void;
}

const ConflictDiff = ({
  conflict,
  roster,
}: {
  conflict: StagedConflict;
  roster: Roster;
}) => {
  const currentTeacher = conflict.current.homeroomTeacherId
    ? (roster.byId.get(conflict.current.homeroomTeacherId) ??
      "not on this year's roster")
    : "none";
  const incomingTeacher =
    conflict.incoming.incomingTeacherName ??
    (conflict.incoming.homeroomTeacherId
      ? roster.byId.get(conflict.incoming.homeroomTeacherId)
      : null) ??
    "unchanged";

  const diffs = [
    ["Name", conflict.current.name, conflict.incoming.name],
    [
      "Grade",
      String(conflict.current.gradeLevel),
      String(conflict.incoming.gradeLevel),
    ],
    [
      "Medium",
      describeMedium(conflict.current.medium),
      describeMedium(conflict.incoming.medium),
    ],
    ["Homeroom teacher", currentTeacher, incomingTeacher],
  ];

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Field</TableHead>
          <TableHead>On the server</TableHead>
          <TableHead>In the file</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {diffs.map(([field, current, incoming]) => {
          const differs = current !== incoming;
          // A staged row can predate the rule that refuses a grade change, and
          // an old conflict can carry one. Saying so beats rendering a diff the
          // button beneath it will not act on.
          const notApplicable = field === "Grade" && differs;
          return (
            <TableRow key={field}>
              <TableCell className="text-muted-foreground">{field}</TableCell>
              <TableCell className={differs ? "line-through" : undefined}>
                {current}
              </TableCell>
              <TableCell
                className={
                  differs ? "text-warning-ink font-semibold" : undefined
                }
              >
                {incoming}
                {notApplicable && (
                  <span className="text-muted-foreground block text-xs font-normal">
                    Cannot be applied — a grade is fixed once the class exists
                  </span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};

const ConflictReviewDialog = ({
  conflicts,
  classes,
  roster,
  resolvingId,
  onApply,
  onDiscard,
  onOpenChange,
}: ConflictReviewDialogProps) => (
  <Dialog open onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
      <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
        <DialogTitle className="font-heading text-lg font-semibold">
          Staged import changes
        </DialogTitle>
        <DialogDescription>
          These rows from your last import differ from what the server holds.
          Applying a row writes its name and medium of instruction. Where the
          file named a homeroom teacher and the class has none, that is written
          too; replacing a teacher who is already there needs a reason, so it is
          left for the class card. A class&rsquo;s grade cannot be changed after
          it is created. Discarding leaves the class exactly as it is.
        </DialogDescription>
      </DialogHeader>

      <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
        {conflicts.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Nothing is waiting for review.
          </p>
        ) : (
          conflicts.map((conflict) => {
            const live = classes.find((cls) => cls.id === conflict.recordId);
            // Only call a row stale when the year actually holds classes. An
            // empty list here usually means the read failed, and declaring
            // every staged row undeletable on the strength of a failed request
            // is the same confident falsehood this feature used to tell.
            const isStale = classes.length > 0 && !live;
            const isResolving = resolvingId === conflict.conflictId;
            return (
              <div key={conflict.conflictId} className="border p-3">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-heading text-base font-semibold">
                    {conflict.current.name}
                  </p>
                  {isStale && (
                    <Badge variant="destructive">Class no longer listed</Badge>
                  )}
                </div>

                {isStale ? (
                  <p className="text-warning-ink text-sm font-semibold">
                    This class is not in the class list for this year, so there
                    is nothing to compare it against and nothing to apply.
                    Discard the row.
                  </p>
                ) : (
                  <ConflictDiff conflict={conflict} roster={roster} />
                )}

                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onDiscard(conflict.conflictId)}
                    disabled={isResolving}
                  >
                    Discard
                  </Button>
                  {!isStale && (
                    <Button
                      size="sm"
                      onClick={() => onApply(conflict)}
                      disabled={isResolving}
                      className="min-w-44"
                    >
                      {isResolving ? "Applying…" : "Apply imported version"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <DialogFooter className="shrink-0 border-t px-6 py-4">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
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
  const [conflicts, setConflicts] = useState<StagedConflict[]>(() =>
    getImportConflicts<StagedRecord>(NAMESPACE)
  );
  const [isReading, setIsReading] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const rosterQuery = useQuery(
    orpc.staff.listStaff.queryOptions({
      input: { academicYearId, onlyPositioned: true },
      enabled: Boolean(academicYearId),
    })
  );

  const roster = useMemo(
    () => buildRoster(rosterQuery.data ?? []),
    [rosterQuery.data]
  );

  const isBusy = isReading || isWriting;

  const readFile = async (file: File) => {
    if (!academicYearId) {
      toast.error(
        "No academic year is selected, so there is nothing to import classes into. Open this page from a year in the address bar."
      );
      return;
    }
    if (rosterQuery.isError) {
      toast.error(
        "This year's teaching roster could not be loaded, so a homeroom column cannot be checked. Reload the page and import again."
      );
      return;
    }

    setIsReading(true);
    setResult(null);
    try {
      const rawRows = parseCsv(await file.text());

      if (rawRows.length === 0) {
        toast.error(
          "That file has no class rows under its header. Download the blank template and add at least one class."
        );
        return;
      }

      const headers = Object.keys(rawRows[0] ?? {});
      const missing = REQUIRED_COLUMNS.filter(
        (column) => !headers.includes(column)
      );
      if (missing.length > 0) {
        toast.error(
          `That file is missing the ${missing.join(", ")} ${missing.length === 1 ? "column" : "columns"}, so it was not built from the classes template. Nothing has been written.`
        );
        return;
      }

      setPlan({
        fileName: file.name,
        rows: buildPlan(rawRows, { academicYearId, classes, roster }),
      });
    } catch (error) {
      toast.error(
        formatApiErrorMessage(error, "That file could not be read as CSV.")
      );
    }
    setIsReading(false);
  };

  const closePlan = () => {
    setPlan(null);
    setResult(null);
  };

  /**
   * The write phase, one row at a time.
   *
   * Each create is settled on its own rather than the batch being allowed to
   * fail: a refusal halfway through must not abandon the rows behind it, and
   * the person who pressed the button has to be told which rows landed. The
   * browser's own per-host connection cap is what bounds the concurrency here,
   * so nothing reaches the server all at once either.
   */
  const confirmImport = async () => {
    if (!plan || !academicYearId) {
      return;
    }
    setIsWriting(true);

    try {
      const creates: CreateRow[] = [];
      const staged: StagedConflict[] = [];
      let unchanged = 0;
      for (const row of plan.rows) {
        if (row.kind === "create") {
          creates.push(row);
        } else if (row.kind === "update") {
          staged.push(toStagedConflict(row));
        } else if (row.kind === "unchanged") {
          unchanged += 1;
        }
      }
      if (staged.length > 0) {
        addImportConflicts<StagedRecord>(NAMESPACE, staged);
      }

      const settled = await Promise.allSettled(
        creates.map((row) =>
          onCreate({
            academicYearId,
            name: row.name,
            gradeLevel: row.gradeLevel,
            medium: row.medium,
            homeroomTeacherId: row.homeroomTeacherId,
          })
        )
      );

      const failures: WriteFailure[] = [];
      let created = 0;
      for (const [index, outcome] of settled.entries()) {
        const row = creates[index];
        if (!row) {
          continue;
        }
        if (outcome.status === "fulfilled") {
          created += 1;
        } else {
          failures.push({
            line: row.line,
            name: row.name,
            reason: formatApiErrorMessage(
              outcome.reason,
              "The server refused this row."
            ),
          });
        }
      }

      setResult({
        created,
        staged: staged.length,
        unchanged,
        rejected: plan.rows.filter(isRejected),
        failures,
      });
      announceImport(created, staged.length, unchanged, failures.length);
    } catch (error) {
      // The only way out of here is a failure of the importer itself — storage
      // full, say — rather than a refusal by the server, which is handled per
      // row above. Say so, and say what is still staged.
      toast.error(
        formatApiErrorMessage(
          error,
          "The import could not be finished. Any rows already written were kept."
        )
      );
    }

    setConflicts(getImportConflicts<StagedRecord>(NAMESPACE));
    setIsWriting(false);
  };

  /**
   * Writes the imported version of a conflicted class.
   *
   * The dialog showed every differing field and this used to hand all of them
   * to `updateClass`, whose input is an explicit `pick` of `name` and `medium` —
   * so the grade and the homeroom teacher the diff had just displayed were
   * stripped by the schema and the row reported as applied. Two things follow,
   * and both are stated on the face of the dialog rather than discovered
   * afterwards: the homeroom teacher goes through `assignClassTeacher`, and only
   * when the class had nobody — a *replacement* needs a reason from
   * `TEACHER_REASSIGNMENT_REASONS`, and a spreadsheet cannot supply one, so
   * replacing is left to the class card where the reason can be given. A grade
   * difference is never applied.
   */
  const applyConflict = async (conflict: StagedConflict) => {
    setResolvingId(conflict.conflictId);
    const assignsHomeroom =
      !conflict.current.homeroomTeacherId &&
      Boolean(conflict.incoming.homeroomTeacherId);
    try {
      await onUpdate(conflict.recordId, {
        name: conflict.incoming.name,
        medium: conflict.incoming.medium,
        ...(assignsHomeroom
          ? { homeroomTeacherId: conflict.incoming.homeroomTeacherId }
          : {}),
      });
      removeImportConflict(NAMESPACE, conflict.conflictId);
      setConflicts(getImportConflicts<StagedRecord>(NAMESPACE));

      if (conflict.incoming.homeroomTeacherId && !assignsHomeroom) {
        toast.warning(
          `${conflict.incoming.name} was renamed, but its homeroom teacher was not changed. Replacing a teacher mid-year needs a reason, which a CSV cannot give — reassign from the class card.`
        );
      } else {
        toast.success(
          `Applied the imported version of ${conflict.incoming.name}`
        );
      }
    } catch (error) {
      toast.error(
        formatApiErrorMessage(
          error,
          `${conflict.incoming.name} could not be updated.`
        )
      );
    }
    setResolvingId(null);
  };

  const discardConflict = (conflictId: string) => {
    removeImportConflict(NAMESPACE, conflictId);
    setConflicts(getImportConflicts<StagedRecord>(NAMESPACE));
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={downloadBlankTemplate}>
        <IconDownload aria-hidden="true" className="mr-2 size-4" />
        Blank template
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={isBusy || !academicYearId}
      >
        <IconUpload aria-hidden="true" className="mr-2 size-4" />
        {importButtonLabel(isReading, isWriting)}
      </Button>
      {conflicts.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsConflictDialogOpen(true)}
          aria-label={`Review ${conflicts.length} staged import ${conflicts.length === 1 ? "conflict" : "conflicts"}`}
        >
          Review staged changes ({conflicts.length})
        </Button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            readFile(file);
          }
        }}
      />

      {plan && (
        <ImportPlanDialog
          plan={plan}
          result={result}
          isWriting={isWriting}
          onConfirm={() => {
            confirmImport();
          }}
          onClose={closePlan}
        />
      )}

      {isConflictDialogOpen && (
        <ConflictReviewDialog
          conflicts={conflicts}
          classes={classes}
          roster={roster}
          resolvingId={resolvingId}
          onApply={(conflict) => {
            applyConflict(conflict);
          }}
          onDiscard={discardConflict}
          onOpenChange={setIsConflictDialogOpen}
        />
      )}
    </>
  );
};
