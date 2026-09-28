import { QUALIFICATION_LEVELS } from "@school-student-teacher-management/db/constants/teachers";
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
  Field,
  FieldDescription,
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
 * "Secondary + a name" had to clear one control that was above the row and two
 * that were below it, and the screen had a ragged gap in the middle where the
 * shorter of the two rows ended. Search is a filter on the rows, so it is where
 * the other filters are — one row of controls, one count, one thing to clear.
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
          aria-describedby="register-search-hint"
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
    <FieldDescription id="register-search-hint">
      Searches by name or NIC — the NIC is unique, so it is the one that never
      collides.
    </FieldDescription>
  </Field>
);

/**
 * The remark, typed into a dialog.
 *
 * `saveReason(staffId, null, …)` is the whole-day note and it is the same write
 * the absence reason has always used — `markAttendance` nulls the column on any
 * write that omits it, which is why the hook sends the reason with every status
 * rather than only with an absence. So a remark on a present teacher and a reason
 * on an absent one are the same field: the remark is not a new concept, it is the
 * reason box, reachable for a teacher who is not absent.
 */
const RemarkDialog = ({
  initialValue,
  onOpenChange,
  onSave,
  open,
  teacherName,
}: {
  initialValue: string;
  onOpenChange: (open: boolean) => void;
  onSave: (value: string) => Promise<boolean>;
  open: boolean;
  teacherName: string;
}) => {
  const [value, setValue] = useState(initialValue);
  const [isSaving, setIsSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputId = "attendance-remark";

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remark for {teacherName}</DialogTitle>
          <DialogDescription>
            Anything worth remembering about this teacher on this date — a call
            from a parent, why a mark was changed, a note to yourself. It is the
            same field the absence reason uses, and saving it does not change
            the mark.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (isSaving) {
              return;
            }
            setIsSaving(true);
            setFailed(false);
            const saved = await onSave(value);
            setIsSaving(false);
            if (saved) {
              onOpenChange(false);
            } else {
              // The text stays and the dialog stays: a refused save is not a
              // reason to make somebody type it again.
              setFailed(true);
            }
          }}
        >
          <Field>
            <FieldLabel htmlFor={inputId}>Remark</FieldLabel>
            <Input
              autoFocus
              id={inputId}
              onChange={(event) => {
                setValue(event.target.value);
              }}
              placeholder="e.g. Called the office at 09:20, traffic"
              value={value}
            />
          </Field>
          {failed ? (
            <p className="text-destructive mt-2 text-sm" role="alert">
              The remark was not saved and the text is still here. Try again.
            </p>
          ) : null}
          <DialogFooter className="mt-4">
            <Button
              onClick={() => {
                onOpenChange(false);
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isSaving} type="submit">
              {isSaving ? "Saving…" : "Save remark"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export const AttendanceRegisterTable = ({
  page,
}: AttendanceRegisterTableProps) => {
  const [search, setSearch] = useState("");
  const [qualificationFilter, setQualificationFilter] = useState("all");
  const [bandFilter, setBandFilter] = useState(ANY_BAND);
  const [remarkFor, setRemarkFor] = useState<RegisterRow | null>(null);
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

  const onRemark = useCallback((row: RegisterRow) => {
    setRemarkFor(row);
  }, []);

  const columns = useMemo(
    () => buildRegisterColumns({ onRemark, page }),
    [onRemark, page]
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
        <SearchField
          onChange={setSearch}
          onClear={() => setSearch("")}
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

      {remarkFor ? (
        <RemarkDialog
          initialValue={remarkFor.remark}
          onOpenChange={(open) => {
            if (!open) {
              setRemarkFor(null);
            }
          }}
          onSave={async (value) => {
            const saved = await page.saveReason(remarkFor.staffId, null, value);
            if (saved) {
              setRemarkFor(null);
            }
            return saved;
          }}
          open
          teacherName={remarkFor.name}
        />
      ) : null}
    </div>
  );
};
