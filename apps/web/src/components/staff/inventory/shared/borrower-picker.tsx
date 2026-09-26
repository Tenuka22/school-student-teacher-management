"use client";

/**
 * The party a loan is owed back to: **a member of staff, or a student.**
 *
 * ## A student is a recorded borrower, never an actor
 *
 * A Grade 9 class is lent calculators, a sports set goes to a house, and a
 * laptop goes home with a pupil at the end of term, so `inventoryBorrow` carries
 * two borrower columns — `borrower_staff_id` and `borrower_student_id` — with a
 * database CHECK (`inventory_borrow_borrower_exclusive`) refusing both-set and
 * neither-set. `createBorrow` turns that into a `v.variant` keyed on `type`, so
 * the payload names a person *and* says which table they live in, and the two can
 * never be half-populated.
 *
 * **Nothing here is a student-facing screen, and there is no missing one.** The
 * `student` table has no `userId` link, so a student can never sign in: a student
 * loan is opened by a member of staff through the lend dialog and closed by a
 * member of staff through the return dialog. `borrowedByStaffId` and
 * `returnedByStaffId` are the actors; the borrower is a *subject* of the loan.
 * A reader who does not know that will assume a student's half of this feature is
 * missing and go looking for it, so it is stated here, at the top of the one file
 * that makes a student selectable.
 *
 * ## Why this is a mode switch and not one long list
 *
 * A school roll of nine hundred children and a staff roll of forty people share
 * no table, no id space and no reference format, and a combined list would have to
 * invent a type column the server never sends. So there are two modes, and the
 * active one is **stated in the field label** ("Borrower — staff") rather than
 * signalled by an icon alone: a clerk who is about to write down who is holding
 * the school projector must be able to tell from the form, not from a glyph they
 * have to recognise.
 *
 * ## The one backend gap this file works around, on the face of the field
 *
 * It is stated to the user below the control rather than left as a short list
 * that looks complete, because a list that silently lacks the one fact it exists
 * to give is a bug report the clerk files against the system.
 *
 * 1. **The student list carries no class.** `orpc.marking.listStudents` is the
 *    whole roll, but it has no search, no `limit`, and — the part that matters
 *    here — no `className`. "Grade 9B has the projector" is the sentence a clerk
 *    needs, and the class *is* available everywhere else: `listBorrows` resolves it
 *    through `studentClassAssignment` joined to `academicYear.isCurrent`, so the
 *    loan row shows it. The only place it is missing is this picker.
 *    `listStudentsByClass` could be called per class, but that is one round trip
 *    per class in the year on every open of the box, and a combobox is not the
 *    place for a fan-out. **The backend fix is one procedure: return `className`
 *    beside each student, resolved the way `resolveBorrowerStudentBatch` resolves
 *    it**, and the row below the name fills itself in.
 *
 * **The staff list carries no caveat, because there is nothing left to say about
 * it.** It used to: `orpc.inventory.options.assignableStaff` was
 * `adminProcedure` and filtered `staffCategory = "teacher"`, so the bursar and
 * the lab attendants were missing from a list the write path would have accepted
 * — and this field said so, in those words, below the control. **The server
 * dropped the category filter, and the caveat went with it:** the list now holds
 * every member of staff whose employment is `active` or unset, which is the
 * identical predicate `assertStaffIsAssignable` enforces on the write, so the
 * office that lent the projector and the person who carried it out are both in
 * it and the note would have been a lie. The gap is not papered over: what the
 * list does not carry is *stated*, and it hides no row, greys out none, and
 * prints no dash for a class it simply cannot see.
 */

/*
 * Three of this file's exports are pure functions — the request-payload
 * derivation, the reference line, and the prose describer — and all three are
 * about the *same* decision this component makes, so splitting them out would put
 * the wire shape a call site needs somewhere it cannot see the type it comes from.
 * The cost is one Fast Refresh boundary: editing `borrowerInputFrom` degrades
 * dev-time hot reload for this module to a full reload. `item-picker.tsx` pays the
 * same cost for `useItemOptions`.
 */
/* oxlint-disable react-doctor/only-export-components -- three pure functions derived from the same BorrowerChoice this component produces; see the note above */
import type { InferRouterInputs } from "@orpc/server";
import type { AppRouter } from "@school-student-teacher-management/api/routers/index";
import { studentIdSchema } from "@school-student-teacher-management/db/schema/marking";
import { staffIdSchema } from "@school-student-teacher-management/db/schema/staff";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@school-student-teacher-management/ui/components/combobox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@school-student-teacher-management/ui/components/field";
import { IconBackpack, IconBriefcase } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import type * as React from "react";
import { useEffect, useId, useMemo, useState } from "react";
import * as v from "valibot";

import { orpc } from "@/utils/orpc";

const DEBOUNCE_MS = 250;

/**
 * Rows offered per open box.
 *
 * A page, not the whole register — the same number `item-picker.tsx` and
 * `list-teacher-options.ts` use, so "the list stops here" reads the same way in
 * every picker in this feature. The difference is that for students it is a
 * **client-side** cap: the roll arrives in one response, so the field says so
 * rather than pretending the server paged it.
 */
const BORROWER_ROW_LIMIT = 50;

/** Which kind of person a loan can name. Mirrors `InventoryBorrowerType` on the server. */
export type BorrowerType = "staff" | "student";

/**
 * One chosen party, in the shape the UI holds and renders.
 *
 * Deliberately the *same facts* the server's `InventoryBorrower` carries minus
 * `className`, and the omission is a decision rather than an oversight:
 * `listBorrows` resolves the class for the current year, but neither option
 * endpoint behind this field returns one, so a `className` here could only ever
 * be `null` — and a null that means "this list cannot see the class" is not the
 * same claim as the null that means "no class this year", which is what a real
 * `InventoryBorrower` with `className: null` says. Printing the second one from
 * this field would be a lie about the first. The class is rendered where it is a
 * fact: on the loan row.
 */
export interface BorrowerChoice {
  type: BorrowerType;
  id: string;
  name: string;
  /**
   * The badge number for staff (`staff.teacherServiceNo`), the admission number
   * for a student. Nullable for staff and never null for a student, because
   * `teacher_service_no` is nullable and `admission_number` is `notNull unique`.
   */
  reference: string | null;
}

const MODE_ICON: Record<BorrowerType, typeof IconBriefcase> = {
  staff: IconBriefcase,
  student: IconBackpack,
};

const MODES: readonly { value: BorrowerType; label: string }[] = [
  { value: "staff", label: "Member of staff" },
  { value: "student", label: "Student" },
];

/**
 * The mode-specific sentence the field states about itself, where one is left to
 * say. See the header: only the student roll carries a caveat now, and an absent
 * entry is rendered as no sentence at all rather than as a filler.
 */
const MODE_NOTE: Partial<Record<BorrowerType, string>> = {
  student:
    "The roll carries each student's name and admission number, and no class — so a student's class appears on the loan row once the loan is saved, not here.",
};

const MODE_PLACEHOLDER: Record<BorrowerType, string> = {
  staff: "Search by name or service number...",
  student: "Search by name or admission number...",
};

const MODE_EMPTY: Record<BorrowerType, string> = {
  staff: "No member of staff matches that",
  student: "No student on the roll matches that",
};

const MODE_WORD: Record<BorrowerType, string> = {
  staff: "Member of staff",
  student: "Student",
};

/**
 * The caveat this mode still has, or nothing at all.
 *
 * Its own component so the *absence* of a caveat costs the field no branch: the
 * staff mode has no sentence left to state, and rendering an empty
 * `FieldDescription` would put a blank paragraph under a control and hand the
 * screen reader a description of nothing. Passing `undefined` renders no element
 * and the `aria-describedby` wiring omits the id with it.
 */
const BorrowerModeNote: React.FC<{ id: string; note?: string }> = ({
  id,
  note,
}) => (note ? <FieldDescription id={id}>{note}</FieldDescription> : null);

/**
 * The borrower as `createBorrow` wants it.
 *
 * **Read off the router, not re-declared.** `InferRouterInputs<AppRouter>` at the
 * path the client calls is the same projection `inventory-types.ts` uses for the
 * response side, and it is the only version of this union that cannot go stale:
 * rename `staffId` on the server and this annotation is where it lands. A
 * hand-written `{ type: "staff"; staffId: string }` would be a second copy of a
 * shape the server owns.
 */
type CreateBorrowBorrower =
  InferRouterInputs<AppRouter>["inventory"]["borrows"]["create"]["borrower"];

/**
 * The one place a picked party becomes a request payload.
 *
 * **`v.parse` on the id, not a cast.** `staffIdSchema` and `studentIdSchema` are
 * branded and the ids arriving off the wire are plain strings, so something has
 * to apply the brand; `item-dialogs.tsx` and `custody-dialogs.tsx` already do it
 * this way at submit time, and this is the same step for a borrower's id.
 *
 * Because the branch is on `type` and the id is read once, there is no shape a
 * caller can assemble by hand: a half-populated borrower is not a thing this
 * function can be asked for, which is the whole reason the server models the
 * borrower as a union rather than as two nullable columns.
 */
export const borrowerInputFrom = (
  chosen: Pick<BorrowerChoice, "type" | "id">
): CreateBorrowBorrower =>
  chosen.type === "staff"
    ? { type: "staff", staffId: v.parse(staffIdSchema, chosen.id) }
    : { type: "student", studentId: v.parse(studentIdSchema, chosen.id) };

/**
 * The reference line, and the two ways it can be absent.
 *
 * One function for the whole feature, because it is one fact: `reference` is the
 * badge number for staff and the admission number for a student, and the two are
 * read aloud at different desks — a badge number is what a colleague says across a
 * corridor, an admission number is what a front office reads down a telephone.
 * Both the picker row and the loan row call this, so a person cannot be labelled
 * `EMP-0417` in one place and `Service no. EMP-0417` in another.
 *
 * A staff record with no badge is a real and common state (`teacher_service_no` is
 * nullable), so it is *stated* — "no service number on record" — rather than left
 * as a blank second line that reads as a rendering bug.
 */
export const borrowerReferenceLine = (option: {
  type: BorrowerType;
  reference: string | null;
}): string => {
  if (option.type === "staff") {
    return option.reference
      ? `Service no. ${option.reference}`
      : "No service number on record";
  }

  return option.reference
    ? `Admission no. ${option.reference}`
    : "No admission number on record";
};

/**
 * A borrower named in a sentence: a toast, a dialog description, a ledger note.
 *
 * The mirror of `describeBorrower` in the server's `inventory-database.ts`, and it
 * exists for the same reason — one function, so the places in this feature that
 * name a person in prose cannot spell a staff member's reference one way and a
 * student's another.
 *
 * A student gets their class appended and a staff member does not, because the two
 * sentences in a school are different claims: "Nimali Fernando (STU/2025/001),
 * Grade 9B" says which class the equipment is in, and "R. Perera (EMP-0417)" does
 * not need saying twice. `className` is read as *present or absent* and never as
 * *known or unknown* — the rows that reach this function got their class from
 * `listBorrows`, where a null genuinely means the student has no class assignment
 * in the current year, so "no class this year" is a fact about the child and not a
 * gap in the query.
 */
export const describeBorrowerChoice = (person: {
  type: BorrowerType;
  name: string;
  reference: string | null;
  className?: string | null;
}): string => {
  const named = person.reference
    ? `${person.name} (${person.reference})`
    : person.name;

  if (person.type !== "student") {
    return named;
  }

  return `${named}, ${person.className ?? "no class this year"}`;
};

/**
 * A staff choice the current page does not contain.
 *
 * Only the staff list can need this: it is a server-paged fifty, while the student
 * roll arrives whole and always contains the selection. The copy says what is
 * true — the id is real, the name is not loaded — rather than inventing a name
 * the way a placeholder object usually does.
 */
const unlistedStaff = (value: BorrowerChoice): BorrowerChoice => ({
  type: "staff",
  id: value.id,
  name: "Chosen — not on this page of names",
  reference: value.reference,
});

/**
 * Client-side matching for the student roll, name **and** admission number.
 *
 * Token-and-`includes`, the same shape `staff/list-staff.ts` uses for its own
 * client-side search, so "nimali stu" narrows and "stu/2025" finds a child by the
 * number a front office reads out. It has to be client-side because
 * `marking.listStudents` takes no input at all — there is no `search` and no
 * `limit` to send — and the alternative, one request per class, is noted in the
 * header. The staff branch does **not** use this: `options.assignableStaff`
 * searches on the server over `name` and `teacher_service_no` with its wildcards
 * escaped.
 */
const matchesBorrowerTerm = (
  row: { firstName: string; lastName: string; admissionNumber: string },
  term: string
): boolean => {
  if (!term) {
    return true;
  }

  const haystack =
    `${row.firstName} ${row.lastName} ${row.admissionNumber}`.toLowerCase();

  return term
    .split(/\s+/u)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
};

/**
 * The staff / student switch, as a `fieldset` with a screen-reader-only legend.
 *
 * Its own component for two reasons. Semantically it is a group of controls, and
 * a `fieldset` is what says so — `role="group"` on a `div` says the same thing to
 * a browser and is what this codebase's `prefer-tag-over-role` rule objects to.
 * Structurally it keeps the two per-button `type === value` decisions out of the
 * field below, which is already carrying two queries and a debounce.
 */
const BorrowerModeToggle: React.FC<{
  type: BorrowerType;
  onChange: (next: BorrowerType) => void;
  label: string;
  disabled: boolean;
}> = ({ type, onChange, label, disabled }) => (
  <FieldSet className="flex-row gap-2">
    <FieldLegend className="sr-only">{`${label} type`}</FieldLegend>
    {MODES.map((mode) => {
      const Icon = MODE_ICON[mode.value];

      return (
        <Button
          key={mode.value}
          type="button"
          size="sm"
          variant={type === mode.value ? "default" : "outline"}
          aria-pressed={type === mode.value}
          disabled={disabled}
          onClick={() => {
            onChange(mode.value);
          }}
          data-icon="inline-start"
        >
          <Icon data-icon="inline-start" />
          {mode.label}
        </Button>
      );
    })}
  </FieldSet>
);

/** One row in the open list: the name, then the reference in that kind's words. */
const BorrowerOptionRow: React.FC<{ option: BorrowerChoice }> = ({
  option,
}) => (
  <div className="flex min-w-0 flex-col">
    <span className="truncate font-medium">{option.name}</span>
    <span className="text-muted-foreground truncate text-xs">
      {borrowerReferenceLine(option)}
    </span>
  </div>
);

/**
 * The chosen party, re-readable after selection: the kind of person in words, the
 * name, and the reference number.
 *
 * A name alone is not enough to confirm a loan at a counter — "R. Perera" is not a
 * disambiguator in a school with three of them, and the whole reason the reference
 * is on this field is that the clerk is about to write it on a register.
 */
const BorrowerSelectionSummary: React.FC<{ value: BorrowerChoice }> = ({
  value,
}) => {
  const Icon = MODE_ICON[value.type];

  return (
    <div className="border-border bg-muted/40 flex flex-wrap items-center gap-x-2 gap-y-1 border px-3 py-2 text-sm">
      <Badge variant="outline">
        <Icon />
        {MODE_WORD[value.type]}
      </Badge>
      <span className="font-medium">{value.name}</span>
      <span className="text-muted-foreground font-mono text-xs">
        {borrowerReferenceLine(value)}
      </span>
    </div>
  );
};

interface BorrowerOptions {
  options: BorrowerChoice[];
  isLoading: boolean;
}

/**
 * The search term, `DEBOUNCE_MS` behind the keystroke.
 *
 * Its own hook for one reason: both option hooks below need the *settled* term
 * rather than the raw state, and a value that arrives as an argument cannot be
 * read at the wrong moment of a keystroke.
 */
const useDebouncedValue = (raw: string): string => {
  const [settled, setSettled] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => setSettled(raw), DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [raw]);

  return settled;
};

/**
 * Staff options, from `orpc.inventory.options.assignableStaff`.
 *
 * **`adminProcedure`**, inputs `{ search?: string, limit?: 1..200 }`, returning
 * `{ id, name, staffCategory, employmentStatus, serviceNo, currentRole }`. It
 * matches `name` **and** `teacher_service_no` server-side with its wildcards
 * escaped, so the search box behaves the same in both modes — which is why this
 * branch sends the term to the server while the student branch below filters
 * locally.
 *
 * **Every member of staff whose employment is `active` or unset is in it**, with
 * no `staffCategory` restriction, so the bursar, the office clerk and the lab
 * attendant are as selectable as the teaching staff — and the list carries the
 * same predicate `assertStaffIsAssignable` enforces, so a name offered here is a
 * name the write will accept. The three seeded leadership accounts are the
 * exception, and they are absent by construction rather than by filter: they are
 * users with no staff row at all.
 *
 * Gate note: the picker is only ever mounted behind `listBorrows`, which is
 * itself `adminProcedure`, so this is the same audience the Loans tab already
 * admits — and a `teacher` role holds `inventory: ["read", "take", "manageOwn"]`
 * but not `create`, so a teacher can neither open the lend dialog nor name a
 * borrower.
 */
const useStaffBorrowerOptions = (
  enabled: boolean,
  debouncedQuery: string
): BorrowerOptions => {
  const query = useQuery(
    orpc.inventory.options.assignableStaff.queryOptions({
      input: { search: debouncedQuery || undefined },
      enabled,
    })
  );

  const options = useMemo<BorrowerChoice[]>(
    () =>
      (query.data ?? []).map((row) => ({
        type: "staff" as const,
        id: row.id,
        name: row.name,
        reference: row.serviceNo,
      })),
    [query.data]
  );

  return { options, isLoading: query.isLoading };
};

/**
 * Student options, from `orpc.marking.listStudents`.
 *
 * **`requireStudentPermission("read")`**, and — read from the procedure file —
 * **no input schema at all**: no `search`, no `limit`, and no `className`. It is
 * the only source of the roll that exists, so it is what this field reads; the
 * gate is `student: ["read"]`, which the `teacher` role holds, and the reason that
 * is not a new exposure here is the one above: this component is unreachable
 * without `inventory: ["create"]` on the tab behind it.
 */
const useStudentBorrowerOptions = (
  enabled: boolean,
  debouncedQuery: string
): BorrowerOptions & { truncated: boolean; matchCount: number } => {
  const query = useQuery(orpc.marking.listStudents.queryOptions({ enabled }));

  /**
   * One pass, not `filter().map()`. The roll is a school-wide list and this runs
   * on every settled keystroke, so building the result in a single walk is both
   * the rule this codebase follows and the cheaper of the two.
   */
  const matches = useMemo<BorrowerChoice[]>(() => {
    const term = debouncedQuery.trim().toLowerCase();
    const found: BorrowerChoice[] = [];

    for (const row of query.data ?? []) {
      if (matchesBorrowerTerm(row, term)) {
        found.push({
          type: "student",
          id: row.id,
          name: `${row.firstName} ${row.lastName}`.trim(),
          reference: row.admissionNumber,
        });
      }
    }

    return found;
  }, [query.data, debouncedQuery]);

  const options = useMemo(
    () => matches.slice(0, BORROWER_ROW_LIMIT),
    [matches]
  );

  return {
    options,
    isLoading: query.isLoading,
    // Both counts, so the list can say *how* it is truncating rather than only
    // that it is: a cap with no number is how a clerk concludes a child is not on
    // the register.
    matchCount: matches.length,
    truncated: matches.length > options.length,
  };
};

/**
 * The current page of names, with the selection guaranteed to be on it.
 *
 * A selected staff member can sit off the current page — the box holds a search
 * term, the page holds fifty names. Without a stand-in row the field would render
 * as *empty* while a value was set, which on a lend form reads as "nobody is
 * holding this" and is the one thing this control must never do.
 */
const optionsWithSelection = (
  options: BorrowerChoice[],
  value: BorrowerChoice | null
): BorrowerChoice[] => {
  if (!value || options.some((option) => option.id === value.id)) {
    return options;
  }

  return [unlistedStaff(value), ...options];
};

/**
 * Who is holding school property, as a searchable two-mode picker.
 *
 * Used in two places, and the difference between them is a prop rather than a
 * component: the lend dialog (`required`) and the loans-list filter
 * (`allowClear`). The value is a `BorrowerChoice` and not a bare id precisely so
 * the *mode travels with the id* — which is what makes "both borrower filters at
 * once" unrepresentable in the caller's state and therefore impossible to send.
 *
 * **One query per mode, each behind an `enabled` flag on the active type**, so
 * switching modes neither refetches the mode being left nor leaves a staff list
 * in memory while a student is being named.
 */
export const BorrowerPickerField: React.FC<{
  value: BorrowerChoice | null;
  onChange: (choice: BorrowerChoice | null) => void;
  /** The noun only. The mode word is appended by the field, so it is never missed. */
  label?: string;
  description?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  allowClear?: boolean;
}> = ({
  value,
  onChange,
  label = "Borrower",
  description,
  error,
  disabled = false,
  required = false,
  allowClear = false,
}) => {
  const [mode, setMode] = useState<BorrowerType>("staff");
  const [query, setQuery] = useState("");

  const inputId = useId();
  const errorId = `${inputId}-error`;
  const descriptionId = `${inputId}-description`;
  const noteId = `${inputId}-note`;

  /**
   * The mode the *label* states, which is the value's mode whenever a value is
   * set. Deriving it rather than trusting `mode` means a value set from outside
   * this control cannot leave the label claiming a kind of person the selection is
   * not — the label and the list are one fact, read twice.
   */
  const type = value?.type ?? mode;

  /**
   * This mode's caveat, where it still has one. `noteId` is therefore derived
   * rather than unconditional: an `aria-describedby` pointing at an element that
   * was not rendered announces nothing and makes the wiring look as though it is
   * describing the control when it is not.
   */
  const note = MODE_NOTE[type];
  const describedBy = [error && errorId, description && descriptionId, note]
    .filter(Boolean)
    .join(" ");

  const debouncedQuery = useDebouncedValue(query);

  const staff = useStaffBorrowerOptions(type === "staff", debouncedQuery);
  const student = useStudentBorrowerOptions(type === "student", debouncedQuery);

  const isLoading = type === "staff" ? staff.isLoading : student.isLoading;
  const isTruncated = type === "student" && student.truncated;

  const items = useMemo(
    () =>
      optionsWithSelection(
        type === "staff" ? staff.options : student.options,
        value
      ),
    [staff.options, student.options, type, value]
  );

  const chosen = useMemo(
    () => items.find((option) => option.id === value?.id) ?? null,
    [items, value]
  );

  /**
   * Switching mode **clears the selection**, and that is a correctness step rather
   * than a nicety: a staff id and a student id are ids in two different tables, so
   * keeping the old one would hand `createBorrow` a `staffId` while the form said
   * student. Clearing makes the transition total — after it there is no selection
   * and no half-converted one.
   */
  const handleModeChange = (next: BorrowerType) => {
    if (next === type) {
      return;
    }

    setMode(next);
    setQuery("");
    if (value) {
      onChange(null);
    }
  };

  return (
    <Field data-invalid={Boolean(error)}>
      {/**
       * The mode word is inside the label, so the kind of person this field wants
       * is legible without touching it, and a screen reader announces it as part
       * of the control's name rather than as a stray badge below it.
       */}
      <FieldLabel htmlFor={inputId}>
        {`${label} — ${MODE_WORD[type].toLowerCase()}${required ? " *" : ""}`}
      </FieldLabel>

      <BorrowerModeToggle
        type={type}
        onChange={handleModeChange}
        label={label}
        disabled={disabled}
      />

      <Combobox<BorrowerChoice>
        items={items}
        value={chosen}
        onValueChange={(item) => onChange(item ?? null)}
        onInputValueChange={setQuery}
        itemToStringLabel={(item) => item?.name ?? ""}
        isItemEqualToValue={(a, b) => a?.id === b?.id}
        // Matching is the source's job in both modes and this component's job in
        // one: the staff list is searched and paged by
        // `options.assignableStaff`, the student roll is filtered by
        // `matchesBorrowerTerm` above. A second filter over an already-filtered
        // page would only re-run the same comparison.
        filter={null}
      >
        <ComboboxInput
          id={inputId}
          placeholder={MODE_PLACEHOLDER[type]}
          showClear={allowClear && Boolean(value)}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
        />
        <ComboboxContent>
          <ComboboxEmpty>
            {isLoading ? "Searching..." : MODE_EMPTY[type]}
          </ComboboxEmpty>
          <ComboboxList>
            {items.map((option) => (
              <ComboboxItem key={`${option.type}-${option.id}`} value={option}>
                <BorrowerOptionRow option={option} />
              </ComboboxItem>
            ))}
          </ComboboxList>
          {/**
           * A roll of nine hundred is not a list, so the cap is stated. The
           * alternative — silently offering the first fifty with no count — is how
           * a clerk concludes a child is not on the register.
           */}
          {isTruncated ? (
            <p className="text-muted-foreground border-t px-3 py-2 text-xs">
              {`Showing the first ${student.options.length} of ${student.matchCount} matches — keep typing to narrow it`}
            </p>
          ) : null}
        </ComboboxContent>
      </Combobox>

      {value ? <BorrowerSelectionSummary value={value} /> : null}

      {description ? (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      ) : null}
      {/**
       * What this list does **not** carry, rendered only in a mode that still
       * has such a thing to say, and referenced by the input when it is there.
       * A short list that explains itself is a fact; a short list that does not
       * is a bug report the clerk files against the system — which is also why
       * there is no sentence at all in staff mode now: the caveat it used to
       * carry was true and then stopped being true, and a note still rendered
       * after the gap closed is the same defect in a new coat.
       */}
      <BorrowerModeNote id={noteId} note={note} />
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </Field>
  );
};
