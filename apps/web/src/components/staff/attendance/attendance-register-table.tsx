import { QUALIFICATION_LEVELS } from "@school-student-teacher-management/db/constants/teachers";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Field,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import { Input } from "@school-student-teacher-management/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import { IconSearch, IconX } from "@tabler/icons-react";
import { useTable } from "@tanstack/react-table";
import type { SortingState } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

import {
  ArrivalDialog,
  PeriodsDialog,
  RemarkDialog,
} from "@/components/staff/attendance/attendance-mark-dialogs";
import {
  buildRegisterColumns,
  qualificationLabel,
} from "@/components/staff/attendance/attendance-register-columns";
import type { RegisterRow } from "@/components/staff/attendance/attendance-register-rows";
import {
  ANY_BAND,
  buildRegisterRows,
  gradeBandOptions,
  qualificationGroups,
  qualificationsPresent,
} from "@/components/staff/attendance/attendance-register-rows";
import type { AttendancePageApi } from "@/components/staff/attendance/use-attendance-page";
import { DataTableFrame } from "@/components/ui-patterns/data-table/data-table-frame";
import { listTableFeatures } from "@/components/ui-patterns/data-table/list-table-features";

/**
 * The attendance register, as a list.
 *
 * ## Why a list, and what it costs
 *
 * This replaces a matrix: 60 teachers down, 8 periods across, one checkbox per
 * cell. The matrix was good at exactly one thing — seeing the whole day at once —
 * and bad at the three the job needs. You could not find one teacher without
 * re-reading sixty rows. You could not sort the roll, so "who is in" and "who is
 * out" were two visual passes over the same screen. And a remark had nowhere to
 * live except inside a cell, which meant a note about a teacher was a note about
 * a *period*.
 *
 * A list fixes all three, and it matches every other table in the app, which
 * matters more than it sounds: a second table shape means the reader learns the
 * keyboard twice.
 *
 * **The cost, stated plainly:** the at-a-glance period grid is gone. A teacher
 * absent for periods 3 and 4 is now "P3, P4" in a cell rather than two crossed
 * boxes visible from across the room. For marking 60 people in a minute that is a
 * real loss, and it is why the absent periods stay in the row's own status cell
 * rather than being summarised away.
 *
 * ## The data is one date, not a paged list
 *
 * Every other list table here is server-paged: sort and page go to the server as
 * params. This one cannot be, and the difference is not laziness. The register is
 * *one day* of the whole teaching staff — about sixty rows, all of them, the day
 * the page is showing. There is no page 2 to fetch and no ninth to refuse, so a
 * page control would be furniture. Sorting, searching, grouping and the filters
 * are therefore client-side, which is the correct tier for a set the client
 * already holds in full. `manualSorting` is still declared, because the header
 * calls `column.getIsSorted()` and that is a feature-gated method.
 */
interface AttendanceRegisterTableProps {
  page: AttendancePageApi;
}

/**
 * The search box, beside the two filters it behaves like.
 *
 * It used to live on the page, in its own block to the right of the date picker,
 * which put three *table* filters in two different places: a reader setting
 * "Secondary + a name" had to clear one control above the row and two that were
 * below it, and the screen had a ragged gap in the middle where the shorter of
 * the two rows ended. Search is a filter on the rows, so it is where the other
 * filters are — one row of controls, one count, one thing to clear.
 *
 * **No `FieldDescription` under this one**, unlike the other two fields: the row
 * aligns on the bottom edge, so a three-line hint here lifted "Qualification" and
 * "Teaches" a whole block out of line with it. The hint is not carrying anything
 * the placeholder does not already say, so it went rather than the alignment.
 */
const SearchField = ({
  onChange,
  onClear,
  value,
}: {
  onChange: (value: string) => void;
  onClear: () => void;
  value: string;
}) => (
  <Field className="w-72">
    <FieldLabel htmlFor="register-search">Filter teachers</FieldLabel>
    <div className="flex items-end gap-2">
      <div className="relative flex-1">
        <IconSearch
          aria-hidden="true"
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
        />
        <Input
          className="pl-8"
          id="register-search"
          onChange={(event) => {
            onChange(event.target.value);
          }}
          placeholder="Search by name or NIC…"
          type="search"
          value={value}
        />
      </div>
      {value ? (
        <Button
          aria-label="Clear the teacher search"
          onClick={onClear}
          size="sm"
          type="button"
          variant="ghost"
        >
          <IconX data-icon="inline-start" />
          Clear
        </Button>
      ) : null}
    </div>
  </Field>
);

/**
 * Routes one row's open dialog to the right component.
 *
 * A component rather than three ternaries at the call site, because the `key`
 * that remounts it is what clears the previous dialog's draft: switching
 * teacher, or switching from remark to periods, starts from that teacher's own
 * saved values instead of handing the last one's half-typed text along.
 *
 * Every `onSave` closes only on success. A refused write leaves the dialog up
 * with its own message, because the text in it is the thing the user would
 * otherwise have to reconstruct.
 */
const MarkDialogs = ({
  kind,
  onClose,
  page,
  row,
}: {
  kind: "remark" | "arrival" | "periods";
  onClose: () => void;
  page: AttendancePageApi;
  row: RegisterRow;
}) => {
  const closeWhen = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  if (kind === "remark") {
    return (
      <RemarkDialog
        initialValue={row.remark}
        onOpenChange={closeWhen}
        onSave={async (value) => {
          const saved = await page.saveReason(row.staffId, null, value);
          if (saved) {
            onClose();
          }
          return saved;
        }}
        open
        teacherName={row.name}
      />
    );
  }

  if (kind === "arrival") {
    return (
      <ArrivalDialog
        cutoff={page.policy?.arrivalCutoffTime ?? null}
        onOpenChange={closeWhen}
        onSave={async (arrivalTime) => {
          const saved = await page.recordArrival(row.staffId, arrivalTime);
          if (saved) {
            onClose();
          }
          return saved;
        }}
        open
        teacherName={row.name}
      />
    );
  }

  return (
    <PeriodsDialog
      absent={page.expandedAbsentPeriods(row.staffId)}
      onOpenChange={closeWhen}
      onSave={async (absentPeriods) => {
        const saved = await page.saveTeacherDay(
          row.staffId,
          absentPeriods,
          page.dayReason(row.staffId)
        );
        if (saved) {
          onClose();
        }
        return saved;
      }}
      open
      teacherName={row.name}
    />
  );
};

export const AttendanceRegisterTable = ({
  page,
}: AttendanceRegisterTableProps) => {
  const [search, setSearch] = useState("");
  const [qualificationFilter, setQualificationFilter] = useState("all");
  const [bandFilter, setBandFilter] = useState(ANY_BAND);
  const [dialogFor, setDialogFor] = useState<{
    kind: "remark" | "arrival" | "periods";
    row: RegisterRow;
  } | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);

  const rows = useMemo(() => buildRegisterRows(page), [page]);

  /**
   * Search, then the two filters, then the grouping.
   *
   * Search matches the **name and the NIC**, and the field says so. A register of
   * sixty people is found by name, and the NIC is the one identifier that cannot
   * be shared, so it is the right thing to type when two teachers are similarly
   * named. The remark is deliberately *not* searched: a note written in March
   * would hide somebody from today's register, which is a filter that lies about
   * who is present.
   */
  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (term !== "") {
        const hitsName = row.name.toLowerCase().includes(term);
        const hitsNic = (row.nic ?? "").toLowerCase().includes(term);
        if (!hitsName && !hitsNic) {
          return false;
        }
      }
      if (
        qualificationFilter !== "all" &&
        row.qualification !== qualificationFilter
      ) {
        return false;
      }
      if (bandFilter !== ANY_BAND && row.gradeBand !== bandFilter) {
        return false;
      }
      return true;
    });
  }, [bandFilter, qualificationFilter, rows, search]);

  const groups = useMemo(() => qualificationGroups(visibleRows), [visibleRows]);

  /**
   * Where each group starts in the flattened body.
   *
   * Counted off the flattened list rather than carried from the grouping pass, so
   * the index is the index the frame will actually see — one source of truth, and
   * no way for a header to point at the wrong row after a filter changes.
   */
  const rowGroups = useMemo(() => {
    const flat = groups.flatMap(([, groupRows]) => groupRows);
    const boundaries: { startsAt: number; label: string; count: number }[] = [];
    let offset = 0;
    for (const [qualification, groupRows] of groups) {
      boundaries.push({
        startsAt: offset,
        label: qualificationLabel(qualification),
        count: groupRows.length,
      });
      offset += groupRows.length;
    }
    return flat.length === boundaries.length
      ? boundaries
      : boundaries.filter((boundary) => boundary.startsAt < flat.length);
  }, [groups]);

  /**
   * Which row is in a dialog, and which dialog.
   *
   * One state rather than three booleans because a row can only ever be in one:
   * opening the arrival dialog from a row whose remark is open has to close the
   * remark, and three flags would leave both mounted and fight over focus.
   */
  const onRemark = useCallback((row: RegisterRow) => {
    setDialogFor({ kind: "remark", row });
  }, []);

  const onArrival = useCallback((row: RegisterRow) => {
    setDialogFor({ kind: "arrival", row });
  }, []);

  const onPeriods = useCallback((row: RegisterRow) => {
    setDialogFor({ kind: "periods", row });
  }, []);

  const columns = useMemo(
    () => buildRegisterColumns({ onArrival, onPeriods, onRemark, page }),
    [onArrival, onPeriods, onRemark, page]
  );

  const table = useTable({
    features: listTableFeatures,
    columns,
    // Grouped order, not alphabetical: the flat list is the groups concatenated,
    // and the frame renders the group boundaries from `groups`.
    data: groups.flatMap(([, groupRows]) => groupRows),
    getRowId: (row) => row.staffId,
    rowCount: rows.length,
    manualSorting: true,
    state: { sorting },
    onSortingChange: setSorting,
  });

  const isFiltered =
    search.trim() !== "" ||
    qualificationFilter !== "all" ||
    bandFilter !== ANY_BAND;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <SearchField
          onChange={setSearch}
          onClear={() => {
            setSearch("");
          }}
          value={search}
        />
        <Field className="w-64">
          <FieldLabel htmlFor="register-qualification">
            Qualification
          </FieldLabel>
          <Select
            onValueChange={(value: string | null) => {
              setQualificationFilter(value ?? "all");
            }}
            value={qualificationFilter}
          >
            <SelectTrigger id="register-qualification">
              <SelectValue placeholder="All qualifications" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All qualifications</SelectItem>
                {qualificationsPresent(rows).map((level) => (
                  <SelectItem key={level} value={level}>
                    {QUALIFICATION_LEVELS[level].label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field className="w-56">
          <FieldLabel htmlFor="register-band">Teaches</FieldLabel>
          <Select
            onValueChange={(value: string | null) => {
              setBandFilter(value ?? ANY_BAND);
            }}
            value={bandFilter}
          >
            <SelectTrigger id="register-band">
              <SelectValue placeholder="All bands" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={ANY_BAND}>All bands</SelectItem>
                {gradeBandOptions().map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <p className="text-muted-foreground ml-auto text-sm tabular-nums">
          {visibleRows.length === rows.length
            ? `${rows.length} on the roll`
            : `${visibleRows.length} of ${rows.length} shown`}
        </p>
      </div>

      <DataTableFrame
        caption={`Attendance register for ${page.date}, grouped by highest qualification`}
        emptyContent={
          isFiltered ? (
            <div className="text-muted-foreground space-y-2 text-sm">
              <p>
                No teacher on the roll matches the name, that qualification and
                that band together.
              </p>
              <Button
                onClick={() => {
                  setQualificationFilter("all");
                  setBandFilter(ANY_BAND);
                  setSearch("");
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Clear the search and both filters
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Nobody is on this year&apos;s teaching roll.
            </p>
          )
        }
        rowGroups={rowGroups}
        table={table}
      />

      {dialogFor ? (
        <MarkDialogs
          key={`${dialogFor.kind}:${dialogFor.row.staffId}`}
          kind={dialogFor.kind}
          onClose={() => {
            setDialogFor(null);
          }}
          page={page}
          row={dialogFor.row}
        />
      ) : null}
    </div>
  );
};
