"use client";

/**
 * The two histories: what happened to the counters, and what happened to the rows.
 *
 * `ledger.transactions` and `ledger.auditLogs` are siblings, not a subset of one
 * another. The counter ledger answers *"what happened to the stock, and what did
 * the numbers look like immediately before and after?"* — it stores the **pair**
 * (`qtyBefore`/`qtyAfter`) rather than a delta precisely so the delta is derivable
 * and so either side can be checked against the previous row's `after`. The audit
 * log answers *"what did this row look like before and after it was changed?"* for
 * every field of every entity, and it is the only place the departed staff member's
 * name survives.
 *
 * Both filters and both page limits are **server-side**. These procedures accept
 * `itemId` / `action` / `actorStaffId` / `from` / `to` / `limit` and count `total`
 * before the limit; fetching everything and narrowing it in the browser would put
 * a year's movements through the wire to show the last hundred.
 */
import { humanizeKey } from "@school-student-teacher-management/db/constants/display";
import {
  INVENTORY_TRANSACTION_ACTIONS,
  inventoryActionLabel,
} from "@school-student-teacher-management/db/constants/inventory";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@school-student-teacher-management/ui/components/collapsible";
import {
  FieldDescription,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import { Input } from "@school-student-teacher-management/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableCaption,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@school-student-teacher-management/ui/components/tabs";
import { IconArrowsDiff, IconChevronDown } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import {
  InventoryEmptyState,
  InventoryErrorState,
  InventorySkeleton,
  StaffComboboxField,
} from "@/components/staff/inventory/shared";
import {
  PartyName,
  formatDateTime,
} from "@/components/staff/inventory/stock-dialogs";
import { orpc } from "@/utils/orpc";

/** Row limits offered on both tabs, all within each procedure's own ceiling. */
const ROW_LIMIT_OPTIONS = [50, 100, 200, 500] as const;

/**
 * How many items the item filter offers.
 *
 * The filter is a `<Select>` of concrete items rather than a free-text box,
 * because `listTransactions` filters on `itemId` and a text box would have to
 * resolve a typed name to an id in the browser — guessing at a match the server
 * is better placed to make. The cap is stated in the field's own description
 * rather than hidden: a school with more than 200 lines narrows by date range or
 * action instead, and the item list is only ever a convenience.
 */
const ITEM_FILTER_LIMIT = 200;

/**
 * **The one explanation both actor filters carry, and why it has to be here.**
 *
 * `StaffComboboxField` is backed by `orpc.inventory.options.assignableStaff`,
 * whose predicate is employment `active` or unset with **no `staffCategory`
 * restriction** — so every member of staff on the roll is selectable, the bursar
 * and the office clerk included, and the forensic objection this sentence used to
 * answer ("the actor who made most of the movements cannot be selected here at
 * all") no longer applies to anybody with a staff record.
 *
 * Two exclusions remain, and they are of different kinds, so the sentence states
 * them separately rather than as one "only active teaching staff":
 *
 * 1. **A colleague who has since left.** A `terminated` or `on_leave` record is
 *    outside the predicate, so a movement made by somebody who has since
 *    departed cannot be filtered by them. The register is a permanent record and
 *    the filter is a live roster, and this is where those two differ.
 * 2. **The `admin` / `principal` / `deputy-principal` accounts**, which are
 *    excluded **on purpose** and are not in the table at all: they are users with
 *    no staff row, so no filter on `staff` reaches them. They administer the
 *    ledger, so filtering by one of them returns nothing however it is typed.
 *
 * The UI can only be honest about that, and is, rather than guessing in the
 * browser.
 *
 * **The backend change that would actually fix the first half, reported rather
 * than worked around:** `listAssignableStaff` needs a second variant for
 * *reading* actors — something like `listActorOptions`, `adminProcedure`,
 * projecting any employment status, terminated and on-leave included, and
 * reaching the three leadership accounts by joining `user` rather than `staff`.
 * It is a different question with a different answer, and it is safe to expose
 * where the assignable-staff roster is not: it names people who have touched the
 * inventory, which `inventory_audit_log.actor_name` already discloses in the
 * clear to anyone who can read the Change log. Keeping it on `adminProcedure`
 * preserves the `teacher` role's `read` contract, which is the reason the roster
 * is not permission-gated on `inventory:read` in the first place. Until it
 * exists, the two filters below say so on their face.
 */
const ACTOR_FILTER_DESCRIPTION =
  "Any member of staff still employed can be named here, but somebody who has since left cannot — a change they made is on the record and their name is off this list. Administrators, principals and deputy principals are not in it at all, by design: they hold no staff record, so filtering by one of them will return nothing however the search is typed. Narrow by date range or action instead.";

const ENTITY_TYPES = [
  "inventory_item",
  "inventory_unit",
  "inventory_issue",
  "inventory_borrow",
  "inventory_disposal",
  "inventory_category",
] as const;

/**
 * `action` is a `text` column under a CHECK, so the wire type is `string` while
 * the input is the closed picklist. Narrowed rather than cast, so a stale filter
 * value from a previous build cannot send an action the server will refuse.
 */
const isInventoryAction = (
  value: string
): value is (typeof INVENTORY_TRANSACTION_ACTIONS)[number] =>
  (INVENTORY_TRANSACTION_ACTIONS as readonly string[]).includes(value);

/**
 * A signed quantity, with the sign in the text.
 *
 * **A stock movement is a signed number and it has to read as one.** A ledger
 * whose only cue is red text is a ledger a colourblind reader, a greyscale
 * printout and a screen reader all get wrong in the same direction. So the sign
 * is a character: an ASCII `+` for an increase and U+2212 MINUS SIGN (not a
 * hyphen) for a decrease, because a hyphen at this size is a dash and the whole
 * point is that the figure is arithmetic.
 *
 * The colour is reinforcement layered on top of that, never the carrier, and the
 * accessible name spells the direction out in words for a screen reader that
 * would otherwise announce "plus three" and "minus one" with no idea which column
 * it was in.
 */
const signedQuantity = (
  delta: number
): {
  text: string;
  spoken: string;
  tone: string;
} => {
  if (delta === 0) {
    return { text: "0", spoken: "unchanged", tone: "text-muted-foreground" };
  }

  if (delta > 0) {
    return {
      text: `+${delta}`,
      spoken: `increased by ${delta}`,
      tone: "text-foreground",
    };
  }

  return {
    text: `−${Math.abs(delta)}`,
    spoken: `decreased by ${Math.abs(delta)}`,
    tone: "text-destructive",
  };
};

/** The signed figure, with its accessible name and its tabular figures. */
const DeltaCell: React.FC<{ delta: number }> = ({ delta }) => {
  const { text, spoken, tone } = signedQuantity(delta);

  return (
    <span
      className={`font-medium tabular-nums ${tone}`}
      aria-label={spoken}
      // The visible glyph already says the direction; this keeps a screen reader
      // from reading the minus sign as punctuation between two numbers.
      data-signed-delta={text}
    >
      {text}
    </span>
  );
};

/**
 * The `meta` keys worth surfacing, and nothing else.
 *
 * `meta` is a free `jsonb` bag and the procedures deliberately leave it
 * denormalised — the live joins are preferred and the blob is the fallback. So it
 * is **not** dumped. Two things in it are worth a row of their own, because they
 * are the facts a movement cannot be read without: the asset tags that went out,
 * and the reason a write-off happened. Anything else is a denormalised copy of
 * something already on the row, and printing it would be a second place for it
 * to be stale.
 */
const metaTags = (meta: Record<string, unknown> | null): string[] => {
  if (!meta) {
    return [];
  }

  for (const key of ["uniqueIds", "uniqueUnitIds"]) {
    const value = meta[key];
    if (Array.isArray(value)) {
      const tags = value.filter(
        (entry): entry is string => typeof entry === "string"
      );
      if (tags.length > 0) {
        return tags;
      }
    }
  }

  return [];
};

const metaText = (meta: Record<string, unknown> | null, key: string) => {
  const value = meta?.[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
};

/**
 * "On hand 7 → 4 · On loan 1 → 1" — the pair, not the difference.
 *
 * **A `Collapsible` and not a `Tooltip`, deliberately.** "What did the numbers
 * look like immediately before" is the question the counter ledger exists to
 * answer, and a tooltip is the wrong control for an answer: it is not in the tab
 * order, it closes on blur, and its content is not reliably announced to a screen
 * reader. A `Collapsible` is a real button in the tab order, its panel holds real
 * text, and the content stays open long enough to be read and copied. Hover is
 * never the only way to reach information in this file.
 *
 * **It also has its own column**, headed `Before → after`, which is what it
 * always was: the file's own header comment says this ledger stores the *pair*
 * precisely so either side can be checked against the previous row's `after`, and
 * that is the whole reason the procedure does not store a delta. Under a header
 * reading "Note" it was a ghost button — the one disclosure carrying the
 * absolute values, and sitting behind a column name that promised a sentence of
 * free text.
 */
const BeforeAfterPanel: React.FC<{
  qtyBefore: number;
  qtyAfter: number;
  borrowedQtyBefore: number;
  borrowedQtyAfter: number;
  qtyDelta: number;
  borrowedQtyDelta: number;
  reason: string | null;
}> = ({
  qtyBefore,
  qtyAfter,
  borrowedQtyBefore,
  borrowedQtyAfter,
  qtyDelta,
  borrowedQtyDelta,
  reason,
}) => (
  <Collapsible>
    <CollapsibleTrigger
      render={<Button variant="ghost" size="sm" />}
      className="text-muted-foreground h-6 px-2 text-xs"
    >
      <IconChevronDown className="mr-1 size-3.5" />
      Before and after
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div className="border-border bg-muted/30 mt-1 space-y-1 border px-3 py-2 text-xs">
        <p>
          <span className="text-muted-foreground">On hand:</span>{" "}
          <span className="tabular-nums">{qtyBefore}</span>
          {" → "}
          <span className="font-medium tabular-nums">{qtyAfter}</span>{" "}
          <span className="text-muted-foreground">
            ({signedQuantity(qtyDelta).text})
          </span>
        </p>
        <p>
          <span className="text-muted-foreground">Out on loan:</span>{" "}
          <span className="tabular-nums">{borrowedQtyBefore}</span>
          {" → "}
          <span className="font-medium tabular-nums">
            {borrowedQtyAfter}
          </span>{" "}
          <span className="text-muted-foreground">
            ({signedQuantity(borrowedQtyDelta).text})
          </span>
        </p>
        {/**
         * The two counters move independently, and the second line is where that
         * becomes visible. A borrow raises `borrowedQty` and leaves `qty` alone; an
         * issue lowers `qty` and leaves `borrowedQty` alone. A row where only one
         * of them moved is not a rendering artefact — it is the definition of which
         * kind of movement it was.
         */}
        <p className="text-muted-foreground">
          Rows that change no counter (a request raised, a signature, a
          withdrawn certificate) show 0 on both lines. That is what
          &ldquo;nothing was counted here&rdquo; looks like.
        </p>
        {reason ? (
          <p>
            <span className="text-muted-foreground">
              Reason on the certificate:
            </span>{" "}
            {reason}
          </p>
        ) : null}
        {/**
         * The asset tags used to be printed here as well, under a "Note" column
         * header that promised none of them. They have their own column now, in
         * full and always visible: the same tags shown twice in two different
         * shapes is a second place for them to disagree, and this one is behind a
         * disclosure.
         */}
      </div>
    </CollapsibleContent>
  </Collapsible>
);

/**
 * One changed field, as `field: old → new`.
 *
 * `auditValue` is the reason this is a component and not a template string. A raw
 * `jsonb` blob in a table is not a UI: `{qty: 7, borrowedQty: 1}` tells a reader
 * nothing, and a nested object or array has to be broken into pairs before any of
 * it can be compared. So a value is rendered by shape — a string as itself, `null`
 * as an explicit "was not set", a number or boolean as itself, an array of scalars
 * as a comma list, and a nested object as its own indented key/value pairs.
 *
 * **`JSON.stringify` is used for *comparison* and never for *display*.**
 * Structural equality needs it (`sameValue` below); a rendered value must never be
 * a serialised blob, because the moment one is, the column is a developer view
 * wearing a table's clothes.
 */
const auditValue = (value: unknown, depth = 0): string => {
  if (value === null) {
    return "not set";
  }
  if (value === undefined) {
    return "—";
  }
  if (typeof value === "string") {
    return value.length > 0 ? value : "(empty)";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "(none)";
    }
    if (value.every((entry) => typeof entry !== "object" || entry === null)) {
      return value.map((entry) => auditValue(entry, depth)).join(", ");
    }
    return value.map((entry) => auditValue(entry, depth + 1)).join("; ");
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return "(empty)";
    }
    const indent = depth > 0 ? "  " : "";
    return entries
      .map(([key, entry]) => `${indent}${key}: ${auditValue(entry, depth + 1)}`)
      .join(" · ");
  }

  return String(value);
};

/** Structural equality, so `{a: 1}` and `{a: 1}` are not reported as a change. */
const sameValue = (a: unknown, b: unknown): boolean => {
  if (a === b) {
    return true;
  }
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  ) {
    return false;
  }
  return JSON.stringify(a) === JSON.stringify(b);
};

interface DiffRow {
  key: string;
  label: string;
  before: unknown;
  after: unknown;
  changed: boolean;
}

/**
 * The union of both sides' keys, changed rows first.
 *
 * A row that existed before and not after (`before` has it, `after` does not) is
 * still shown, with "not set" as its new value — a field that disappeared is a
 * change, and hiding it would make the log quietly lossy.
 */
const diffRows = (
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): DiffRow[] => {
  const keys = [
    ...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
  ];

  const rows = keys.map((key) => {
    const beforeValue = before?.[key];
    const afterValue = after?.[key];
    return {
      key,
      // `humanizeKey` rather than a local map: these are entity column names
      // (`expectedReturnDate`, `issuedByStaffId`), not a closed set anyone has
      // written labels for, and the same humaniser the leave queue and the status
      // badges already use keeps the whole app speaking one way.
      label: humanizeKey(key),
      before: beforeValue,
      after: afterValue,
      changed: !sameValue(beforeValue, afterValue),
    };
  });

  // `toSorted` rather than `sort`: `rows` is a fresh array, but the rule is worth
  // keeping anyway — a diff that reordered the caller's snapshot array would be a
  // genuinely nasty bug, and this way it cannot.
  return rows.toSorted((a, b) => Number(b.changed) - Number(a.changed));
};

const FieldDiff: React.FC<{ before: unknown; after: unknown }> = ({
  before,
  after,
}) => (
  <span className="flex flex-wrap items-baseline gap-1.5">
    <span className="text-muted-foreground decoration-destructive/50 line-through">
      {auditValue(before)}
    </span>
    <span aria-hidden="true">&rarr;</span>
    <span className="font-medium">{auditValue(after)}</span>
  </span>
);

const EntityDiff: React.FC<{
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}> = ({ before, after }) => {
  const rows = useMemo(() => diffRows(before, after), [before, after]);
  const changed = rows.filter((row) => row.changed);
  const unchanged = rows.filter((row) => !row.changed);

  if (changed.length === 0 && unchanged.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        No field snapshot was recorded for this change.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {changed.map((row) => (
        <p key={row.key} className="flex flex-wrap items-baseline gap-1.5">
          <span className="text-muted-foreground w-40 shrink-0 text-xs">
            {row.label}
          </span>
          <FieldDiff before={row.before} after={row.after} />
        </p>
      ))}

      {/**
       * Unchanged fields are collapsed rather than dropped, and the count is
       * always shown. A snapshot of a whole row is mostly fields that did not
       * move — printing all of them buries the one line that changed — but
       * printing none of them makes the log lossy, so the number stays visible
       * and the rows are one disclosure away.
       */}
      {unchanged.length > 0 ? (
        <Collapsible>
          <CollapsibleTrigger
            render={<Button variant="ghost" size="sm" />}
            className="text-muted-foreground h-6 px-1 text-xs"
          >
            <IconChevronDown className="mr-1 size-3.5" />
            {unchanged.length} unchanged field
            {unchanged.length === 1 ? "" : "s"}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-1 pt-1">
              {unchanged.map((row) => (
                <p
                  key={row.key}
                  className="flex flex-wrap items-baseline gap-1.5"
                >
                  <span className="text-muted-foreground w-40 shrink-0 text-xs">
                    {row.label}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {auditValue(row.after)}
                  </span>
                </p>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
};

/** The shared "showing N of M" line. Both tabs state it, neither omits it. */
const ResultCount: React.FC<{ shown: number; total: number; noun: string }> = ({
  shown,
  total,
  noun,
}) => (
  <p className="text-muted-foreground text-xs" aria-live="polite">
    Showing <span className="tabular-nums">{shown}</span> of{" "}
    <span className="tabular-nums">{total}</span> matching {noun}
    {total > shown
      ? " — narrow the date range, the item or the action to see more."
      : "."}
  </p>
);

/** The date range pair, identical on both tabs and in the same order. */
const DateRangeFields: React.FC<{
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  idPrefix: string;
}> = ({ from, to, onFromChange, onToChange, idPrefix }) => (
  <>
    <div>
      <FieldLabel htmlFor={`${idPrefix}-from`}>From</FieldLabel>
      <Input
        id={`${idPrefix}-from`}
        type="date"
        value={from}
        onChange={(event) => onFromChange(event.target.value)}
        className="mt-1"
      />
    </div>
    <div>
      <FieldLabel htmlFor={`${idPrefix}-to`}>To</FieldLabel>
      <Input
        id={`${idPrefix}-to`}
        type="date"
        value={to}
        onChange={(event) => onToChange(event.target.value)}
        className="mt-1"
      />
    </div>
  </>
);

const RowLimitField: React.FC<{
  value: number;
  onChange: (value: number) => void;
  idPrefix: string;
}> = ({ value, onChange, idPrefix }) => (
  <div>
    <FieldLabel htmlFor={`${idPrefix}-limit`}>Rows</FieldLabel>
    <Select
      value={String(value)}
      onValueChange={(next: string | null) => {
        const parsed = Math.trunc(Number(next ?? ""));
        if (Number.isFinite(parsed) && parsed > 0) {
          onChange(parsed);
        }
      }}
    >
      <SelectTrigger id={`${idPrefix}-limit`} className="mt-1">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROW_LIMIT_OPTIONS.map((option) => (
          <SelectItem key={option} value={String(option)}>
            {option} rows
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

/**
 * The counter ledger: every movement of `qty` and `borrowedQty`, newest first.
 */
const MovementsTable = () => {
  const [itemId, setItemId] = useState("");
  const [action, setAction] = useState("");
  const [actorStaffId, setActorStaffId] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState<number>(100);

  const itemsQuery = useQuery(
    orpc.inventory.items.list.queryOptions({
      input: { limit: ITEM_FILTER_LIMIT },
    })
  );

  const transactionsQuery = useQuery(
    orpc.inventory.ledger.transactions.queryOptions({
      input: {
        limit,
        ...(itemId ? { itemId } : {}),
        ...(isInventoryAction(action) ? { action } : {}),
        ...(actorStaffId ? { actorStaffId } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      },
    })
  );

  const transactions = useMemo(
    () => transactionsQuery.data?.transactions ?? [],
    [transactionsQuery.data]
  );
  const total = transactionsQuery.data?.total ?? 0;
  const items = useMemo(() => itemsQuery.data?.items ?? [], [itemsQuery.data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <FieldLabel htmlFor="movements-item">Item</FieldLabel>
          <Select
            value={itemId === "" ? "all" : itemId}
            onValueChange={(value: string | null) => {
              setItemId(value === "all" || value === null ? "" : value);
            }}
          >
            <SelectTrigger id="movements-item" className="mt-1 min-w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All items</SelectItem>
              {items.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name} ({item.sku})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            The first {ITEM_FILTER_LIMIT} lines. Narrow by date or action beyond
            that.
          </FieldDescription>
        </div>

        <div>
          <FieldLabel htmlFor="movements-action">Action</FieldLabel>
          <Select
            value={action === "" ? "all" : action}
            onValueChange={(value: string | null) => {
              setAction(value === "all" || value === null ? "" : value);
            }}
          >
            <SelectTrigger id="movements-action" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {INVENTORY_TRANSACTION_ACTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {inventoryActionLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-56">
          <StaffComboboxField
            value={actorStaffId}
            onChange={setActorStaffId}
            label="Who made the movement"
            description={ACTOR_FILTER_DESCRIPTION}
            placeholder="Search for a member of staff..."
            allowClear
          />
        </div>

        <DateRangeFields
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
          idPrefix="movements"
        />

        <RowLimitField value={limit} onChange={setLimit} idPrefix="movements" />
      </div>

      {transactionsQuery.isLoading ? <InventorySkeleton rows={8} /> : null}

      {transactionsQuery.isError ? (
        <InventoryErrorState
          error={transactionsQuery.error}
          onRetry={() => {
            void transactionsQuery.refetch();
          }}
        />
      ) : null}

      {!transactionsQuery.isLoading &&
      !transactionsQuery.isError &&
      transactions.length === 0 ? (
        <InventoryEmptyState
          title="No movements match these filters"
          description="The counter ledger is empty for this combination. Every write that touches stock writes a row here, so an empty result means nothing has moved under these conditions rather than that the history is missing — widen the date range or clear the action filter."
        />
      ) : null}

      {!transactionsQuery.isLoading &&
      !transactionsQuery.isError &&
      transactions.length > 0 ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>When</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Out on loan</TableHead>
                <TableHead>Asset tags</TableHead>
                <TableHead>Note</TableHead>
                {/**
                 * A column named for what it holds. See `BeforeAfterPanel`: the
                 * disclosure *is* the before/after pair, it was the reason this
                 * procedure stores two counters instead of a delta, and calling
                 * the column "Note" put the only place the absolute values are
                 * written under a heading that promised a sentence.
                 */}
                <TableHead>Before → after</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((row) => {
                const tags = metaTags(row.meta);
                const reason =
                  metaText(row.meta, "reason") ?? metaText(row.meta, "purpose");

                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Badge variant="outline">
                        {row.actionLabel ?? inventoryActionLabel(row.action)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="block">{row.itemName}</span>
                      <span className="text-muted-foreground font-mono text-xs">
                        {row.sku}
                      </span>
                    </TableCell>
                    <TableCell>
                      {/**
                       * Three states, not one: a name, a departed colleague, or
                       * an account with no staff row. `actorStaffId` is
                       * `set null`, so the second is a normal row and the third is
                       * an empty slot, and the ledger is the only place either can
                       * be told apart.
                       */}
                      <PartyName
                        name={row.actorName}
                        staffId={row.actorStaffId}
                        emptyLabel="Account with no staff record"
                      />
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDateTime(row.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DeltaCell delta={row.qtyDelta} />
                    </TableCell>
                    <TableCell className="text-right">
                      <DeltaCell delta={row.borrowedQtyDelta} />
                    </TableCell>
                    {/**
                     * Every tag, wrapping, never truncated. A movement of twenty
                     * labelled devices is one row here, and a list that stops at
                     * three is a list that cannot answer "which twenty".
                     */}
                    <TableCell className="max-w-48 text-xs">
                      {tags.length > 0 ? (
                        <span className="font-mono break-all">
                          {tags.join(", ")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          &mdash; counted in bulk
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-64">
                      {row.note ? (
                        <span className="line-clamp-2">{row.note}</span>
                      ) : (
                        <span className="text-muted-foreground">&mdash;</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <BeforeAfterPanel
                        qtyBefore={row.qtyBefore}
                        qtyAfter={row.qtyAfter}
                        borrowedQtyBefore={row.borrowedQtyBefore}
                        borrowedQtyAfter={row.borrowedQtyAfter}
                        qtyDelta={row.qtyDelta}
                        borrowedQtyDelta={row.borrowedQtyDelta}
                        reason={reason}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableCaption>
              On hand and out on loan are the changes to the item&rsquo;s two
              counters. The two move independently: a borrow raises only the
              second, an issue lowers only the first. Open a row&rsquo;s{" "}
              <span className="font-medium">Before → after</span> column for the
              absolute pair either side of the movement, which is what the
              ledger stores instead of a difference.
            </TableCaption>
          </Table>

          <ResultCount
            shown={transactions.length}
            total={total}
            noun="movements"
          />
        </>
      ) : null}
    </div>
  );
};

/**
 * The change log: every edit to every inventory entity, with a readable diff.
 *
 * **`actorName` is `notNull` in the schema precisely so this log survives the
 * departure of the person who wrote it.** `actor_staff_id` is `set null`, so
 * deleting a staff record anonymises the pointer — and without the denormalised
 * name beside it, every row that person ever touched would answer the only
 * question this table exists for with "somebody who no longer works here". It is
 * `notNull` rather than nullable because Postgres evaluates CHECK constraints
 * during the `UPDATE` a `set null` performs, so a single name-less row would
 * wedge every later `delete from staff`.
 */
/**
 * The two filters that have to agree: which entity, and which item line.
 *
 * Split out because they are the only place on this tab where two controls are
 * **coupled**, and coupling is much easier to see in a component of its own than
 * in the middle of a table. An `entityId` is unique within one table and
 * meaningless across six, so the item filter implies `inventory_item` and the
 * entity filter is disabled while it is set; changing the entity away from
 * `inventory_item` drops the item. Either control alone would let a reader
 * combine a mismatched pair and get an empty result that looks like a broken
 * filter.
 */
const ChangeLogEntityFilters: React.FC<{
  entityType: string;
  onEntityTypeChange: (value: string) => void;
  itemId: string;
  onItemIdChange: (value: string) => void;
  items: { id: string; name: string; sku: string }[];
}> = ({ entityType, onEntityTypeChange, itemId, onItemIdChange, items }) => (
  <>
    <div>
      <FieldLabel htmlFor="audit-item">Item line</FieldLabel>
      <Select
        value={itemId === "" ? "all" : itemId}
        onValueChange={(value: string | null) => {
          onItemIdChange(value === "all" || value === null ? "" : value);
        }}
      >
        <SelectTrigger
          id="audit-item"
          className="mt-1 min-w-56"
          disabled={itemId !== ""}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All items</SelectItem>
          {items.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.name} ({item.sku})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>
        {itemId === ""
          ? `The edits made to one item's own record — its name, condition, location, counters. The first ${ITEM_FILTER_LIMIT} lines; narrow by date or action beyond that. Movements of its stock are on the Movements tab.`
          : "Showing the audit rows for this item line. Clear it to choose a different entity type."}
      </FieldDescription>
    </div>

    <div>
      <FieldLabel htmlFor="audit-entity-type">Entity</FieldLabel>
      <Select
        value={entityType === "" ? "all" : entityType}
        onValueChange={(value: string | null) => {
          const next = value === "all" || value === null ? "" : value;
          onEntityTypeChange(next);
          // An item id only means anything against `inventory_item`.
          if (next !== "inventory_item") {
            onItemIdChange("");
          }
        }}
      >
        <SelectTrigger
          id="audit-entity-type"
          className="mt-1"
          disabled={itemId !== ""}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All entities</SelectItem>
          {ENTITY_TYPES.map((option) => (
            <SelectItem key={option} value={option}>
              {humanizeKey(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>
        {itemId === ""
          ? "One table serves every entity, so the type is the low-cardinality first cut. The action verb — unit.update, disposal.finalize — is how this log is actually read."
          : "Fixed to Item while an item line is chosen: an item id is meaningless against any other table."}
      </FieldDescription>
    </div>
  </>
);

const ChangeLogTable = () => {
  const [entityType, setEntityType] = useState("");
  /**
   * The item line whose own audit rows are wanted, or `""`.
   *
   * The filter the tab used to lack, and the one an auditor reaches for first:
   * "what has been done to *this* projector?" was answerable only by reading
   * `entityId` off rows with the eye and matching them by hand against the
   * Movements tab — a transcription exercise on a truncated id, with the full
   * value reachable only by hovering it.
   *
   * Choosing an item **forces** `entityType` to `inventory_item` rather than
   * sitting beside it, because the two are only meaningful together: a bare
   * `entityId` is unique within one table and meaningless across six, which is
   * exactly what `list-audit-logs.ts` says about its own composite index. Sending
   * an item id alongside `inventory_unit` would return nothing and look like a
   * filter that does not work.
   */
  const [itemId, setItemId] = useState("");
  const [action, setAction] = useState("");
  const [actorStaffId, setActorStaffId] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState<number>(100);

  const itemsQuery = useQuery(
    orpc.inventory.items.list.queryOptions({
      input: { limit: ITEM_FILTER_LIMIT },
    })
  );
  const items = useMemo(() => itemsQuery.data?.items ?? [], [itemsQuery.data]);

  /**
   * The one place the entity type and the item are reconciled. An item filter
   * implies `inventory_item`; choosing any other entity type implies no item, and
   * the item is dropped rather than left to produce an empty result.
   */
  const effectiveEntityType = itemId === "" ? entityType : "inventory_item";

  const auditLogsQuery = useQuery(
    orpc.inventory.ledger.auditLogs.queryOptions({
      input: {
        limit,
        ...(effectiveEntityType ? { entityType: effectiveEntityType } : {}),
        ...(itemId ? { entityId: itemId } : {}),
        ...(action.trim() ? { action: action.trim() } : {}),
        ...(actorStaffId ? { actorStaffId } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      },
    })
  );

  const auditLogs = useMemo(
    () => auditLogsQuery.data?.auditLogs ?? [],
    [auditLogsQuery.data]
  );
  const total = auditLogsQuery.data?.total ?? 0;

  return (
    <div className="space-y-4">
      {/**
       * The item filter, and the note that replaced the old "there is none" one.
       *
       * The tab genuinely is not item-scoped — one table serves every entity, and
       * `entityType` is its low-cardinality first cut — but "not item-scoped" is
       * not the same as "cannot be narrowed to one thing", and the composite
       * index `(entity_type, entity_id)` exists precisely to answer that. What the
       * old comment got wrong was the conclusion it drew: having established that
       * a bare id is meaningless, it concluded the equivalent of an item filter
       * did not exist, and the tab shipped with no way to narrow to one record.
       */}
      <div className="flex flex-wrap items-end gap-3">
        <ChangeLogEntityFilters
          entityType={entityType}
          onEntityTypeChange={setEntityType}
          itemId={itemId}
          onItemIdChange={setItemId}
          items={items}
        />

        <div>
          <FieldLabel htmlFor="audit-action">Action</FieldLabel>
          <Input
            id="audit-action"
            value={action}
            onChange={(event) => setAction(event.target.value)}
            placeholder="e.g. disposal.finalize"
            className="mt-1"
          />
          <FieldDescription>
            Free text. These are CRUD verbs, not the counter movements.
          </FieldDescription>
        </div>

        <div className="min-w-56">
          <StaffComboboxField
            value={actorStaffId}
            onChange={setActorStaffId}
            label="Who made the change"
            description={ACTOR_FILTER_DESCRIPTION}
            placeholder="Search for a member of staff..."
            allowClear
          />
        </div>

        <DateRangeFields
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
          idPrefix="audit"
        />

        <RowLimitField value={limit} onChange={setLimit} idPrefix="audit" />
      </div>

      {auditLogsQuery.isLoading ? <InventorySkeleton rows={8} /> : null}

      {auditLogsQuery.isError ? (
        <InventoryErrorState
          error={auditLogsQuery.error}
          onRetry={() => {
            void auditLogsQuery.refetch();
          }}
        />
      ) : null}

      {!auditLogsQuery.isLoading &&
      !auditLogsQuery.isError &&
      auditLogs.length === 0 ? (
        <InventoryEmptyState
          title="No changes match these filters"
          description={`Every create, edit and lifecycle step in the inventory writes a row here, so an empty result means nothing has been changed under these conditions rather than that the trail is missing.${itemId === "" ? " Note that the actor filter only offers members of staff who are still employed — a change made by an administrator or a principal, neither of whom has a staff record, will not appear when one is chosen." : ""}`}
        />
      ) : null}

      {!auditLogsQuery.isLoading &&
      !auditLogsQuery.isError &&
      auditLogs.length > 0 ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>When</TableHead>
                <TableHead>What changed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLogs.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Badge variant="outline">{row.action}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="block">{humanizeKey(row.entityType)}</span>
                    {/**
                     * The full id is reachable without a pointer.
                     *
                     * It used to exist only in `title=` on a truncated span, which
                     * contradicts this file's own rule seven hundred lines up —
                     * "hover is never the only way to reach information in this
                     * file" — and the id is the one field on the row that has to
                     * be transcribed: it is how a row here is matched against a row
                     * on the Movements tab, and a half-read uuid is not a match.
                     *
                     * So the visible span is `aria-hidden` and truncated for
                     * layout, and the whole value sits beside it in an `sr-only`
                     * span, which is what a screen reader and a text-selection
                     * both get.
                     */}
                    <span
                      className="text-muted-foreground block max-w-40 truncate font-mono text-xs"
                      aria-hidden="true"
                    >
                      {row.entityId}
                    </span>
                    <span className="sr-only">Row id {row.entityId}</span>
                  </TableCell>
                  <TableCell>{row.actorName}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatDateTime(row.createdAt)}
                  </TableCell>
                  <TableCell className="max-w-xl min-w-96 whitespace-normal">
                    <EntityDiff before={row.before} after={row.after} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableCaption>
              Only the fields that actually changed are shown by default. The
              unchanged remainder of each snapshot is one disclosure away, so
              the log is never lossy and never a wall of jsonb.
            </TableCaption>
          </Table>

          <ResultCount shown={auditLogs.length} total={total} noun="changes" />
        </>
      ) : null}
    </div>
  );
};

/**
 * Both ledgers, side by side as tabs.
 */
export const InventoryLedgerTabs = () => (
  <Tabs defaultValue="movements">
    <TabsList
      variant="line"
      className="border-primary/18 h-auto w-full justify-start gap-0.5 rounded-none border-b p-0"
    >
      <TabsTrigger
        value="movements"
        className="gap-2 rounded-none border border-b-0 border-transparent px-4 py-2.5 font-semibold after:hidden"
      >
        Movements
      </TabsTrigger>
      <TabsTrigger
        value="change-log"
        className="gap-2 rounded-none border border-b-0 border-transparent px-4 py-2.5 font-semibold after:hidden"
      >
        <IconArrowsDiff />
        Change log
      </TabsTrigger>
    </TabsList>

    <TabsContent value="movements" className="space-y-4 pt-4">
      <MovementsTable />
    </TabsContent>

    <TabsContent value="change-log" className="space-y-4 pt-4">
      <ChangeLogTable />
    </TabsContent>
  </Tabs>
);
