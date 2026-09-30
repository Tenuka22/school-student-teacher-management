"use client";

/**
 * `AssetRegisterPanel` — every tagged unit the school owns, and the only two
 * status moves a person is allowed to make by hand.
 *
 * ## The per-unit move is a popover on the row, and that is the deliberate change
 *
 * This used to be a bare `Remove from stock` button per row that fired
 * `units.update` **on the first click, with no confirmation and no statement of
 * what it would do to the item's count.** A destructive one-click is worse than a
 * dialog: there is nowhere to read the consequence and no chance to change your
 * mind, and a mis-click on a 200-row table is easy.
 *
 * A modal would be the other failure — interrupting, trapping focus and hiding the
 * register to change one word on one row. So it is a `Popover`: non-modal, anchored
 * to the row, the register stays readable, and it can show the item's actual
 * on-hand figure before and after the move.
 *
 * `StockInDialog` and `StockOutDialog` stay dialogs, and for the opposite reason:
 * they are multi-field, they carry a reason somebody has to write, and the commit
 * goes through a confirm. See the report for the full list.
 */
import {
  UNIT_STATUSES,
  unitStatusLabel,
} from "@school-student-teacher-management/db/constants/inventory";
import { Button } from "@school-student-teacher-management/ui/components/button";
import { FieldLabel } from "@school-student-teacher-management/ui/components/field";
import { Input } from "@school-student-teacher-management/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@school-student-teacher-management/ui/components/popover";
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
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import { IconPackage, IconPackageOff, IconRestore } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";

import type { UnitStatus } from "@/components/staff/inventory/inventory-types";
import { counted, pluralUnits } from "@/components/staff/inventory/quantity";
import { useStockSnapshot } from "@/components/staff/inventory/quantity-field";
import {
  ConditionBadge,
  InventoryEmptyState,
  InventoryErrorState,
  InventorySkeleton,
  UnitStatusBadge,
  invalidateInventory,
} from "@/components/staff/inventory/shared";
import { formatDateTime } from "@/components/staff/inventory/stock-form-helpers";
import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

/**
 * `listUnits`' own default page size. Not exported from the procedure file, and
 * read here only so the counter strip can say what it is counting.
 */
const REGISTER_PAGE_SIZE = 200;

/**
 * The stored statuses are `text` under a database CHECK, so the wire type is
 * `string` and every place that needs a real `UnitStatus` has to narrow it.
 * Written as a guard rather than a cast so an unrecognised value degrades to "not
 * a status this screen can act on" instead of being trusted.
 */
const isUnitStatus = (value: string | null): value is UnitStatus =>
  value !== null && (UNIT_STATUSES as readonly string[]).includes(value);

/**
 * Which statuses a person may move by hand, and for the three they may not, which
 * procedure owns them.
 *
 * `updateUnit` accepts `available` and `removed` and refuses the other three with a
 * message naming the owning procedure. **A status `<Select>` on this register would
 * therefore be a control that silently fails for three of its five values** — worse
 * than no control, because it would look correct until it was pressed. So the row
 * action offers exactly two verbs, and for a lifecycle row it says who owns the
 * state instead of offering a button that cannot work.
 */
const MANUAL_STATUS_NOTE: Record<UnitStatus, string | null> = {
  available: null,
  removed: null,
  issued: "Issued out of the school — terminal, there is no return path",
  disposed: "Disposed on a signed certificate — changes at finalisation",
};

interface UnitCounters extends Record<UnitStatus, number> {
  /** Rows on the page, including any status this build does not recognise. */
  total: number;
}

const countUnits = (units: { status: string }[]): UnitCounters => {
  const counters: UnitCounters = {
    total: units.length,
    available: 0,
    issued: 0,
    disposed: 0,
    removed: 0,
  };

  for (const unit of units) {
    if (isUnitStatus(unit.status)) {
      counters[unit.status] += 1;
    }
  }

  return counters;
};

/**
 * The six figures as a **real table**, not a grid of six bordered boxes.
 *
 * A grid of `label over big number` cells is the hero-metric template at 1/6
 * scale: it reads as a dashboard, it has no caption, and a screen reader is told
 * six numbers with six unexplained labels. A `<table>` with a `<caption>` that
 * says *what is being counted* and `<th scope="col">` on each header is what a
 * records tool uses, and the caption is where the "this page, not the school"
 * caveat lives — the sentence that used to sit in a `<p>` under the grid, where it
 * was the only part of the thing that a screen-reader user never heard.
 */
const REGISTER_COUNTERS: { key: keyof UnitCounters; label: string }[] = [
  { key: "total", label: "On this page" },
  { key: "available", label: "Available" },
  { key: "issued", label: "Issued" },
  { key: "disposed", label: "Disposed" },
  { key: "removed", label: "Removed" },
];

/**
 * The one movement a single tagged unit can make, as a popover on its own row.
 *
 * The quantity is **fixed at one** and stated as such, because that is the whole
 * operation: one asset tag leaves, or comes back. A quantity control here would be
 * an invitation to move four, and `units.update` takes a `unitId`, so a
 * four-quantity request is not even expressible — a control that could not do what
 * it appeared to do.
 */
const UnitStatusPopover: React.FC<{
  unitId: string;
  uniqueNo: string;
  itemId: string;
  itemName: string;
  status: string;
  isPending: boolean;
  onSetStatus: (unitId: string, status: UnitStatus) => void;
}> = ({
  unitId,
  uniqueNo,
  itemId,
  itemName,
  status,
  isPending,
  onSetStatus,
}) => {
  const [open, setOpen] = useState(false);
  const isRemoved = status === "removed";
  const nextStatus: UnitStatus = isRemoved ? "available" : "removed";
  const read = useStockSnapshot(open ? itemId : null);

  const ownedBy = isUnitStatus(status) ? MANUAL_STATUS_NOTE[status] : null;

  /**
   * The three lifecycle statuses get words rather than a control, and the words
   * name the procedure that owns the change. A disabled button with no explanation
   * is the failure mode here: it looks broken rather than withheld.
   */
  if (ownedBy !== null) {
    return <span className="text-muted-foreground text-xs">{ownedBy}</span>;
  }

  const title = isRemoved
    ? `Put ${uniqueNo} back on the shelf`
    : `Take ${uniqueNo} off the register`;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant={isRemoved ? "outline" : "destructive"}
            disabled={isPending}
            data-icon="inline-start"
          />
        }
      >
        {isRemoved ? (
          <IconRestore aria-hidden="true" data-icon="inline-start" />
        ) : (
          <IconPackageOff aria-hidden="true" data-icon="inline-start" />
        )}
        {isRemoved ? "Restore to stock" : "Remove from stock"}
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <PopoverHeader>
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription>
            {isRemoved
              ? `${uniqueNo} is recorded as removed from stock. Putting it back makes the school count it again, and the register's quantity rises by one.`
              : `${uniqueNo} is one of ${itemName}'s asset tags. Removing it takes exactly one off the shelf, not the whole line — the item's quantity on hand falls by one and the tag is marked removed.`}
          </PopoverDescription>
        </PopoverHeader>

        {/**
         * The item's real counters, in the popover, while the register stays
         * visible behind it. **A failed read prints no numbers at all** — the same
         * rule as the movement dialogs, and for the same reason: a row that read
         * `0 on hand` because the request timed out is a row that stops somebody
         * receiving a delivery.
         */}
        {read.status === "loading" ? (
          <p className="text-muted-foreground text-xs" aria-busy="true">
            Reading {itemName}&rsquo;s quantity on hand&hellip;
          </p>
        ) : null}

        {read.status === "error" ? (
          <p role="alert" className="text-destructive text-xs">
            {read.message} The move is not blocked by this &mdash; the server
            re-checks and will refuse it with the real number if there is
            nothing to take.
          </p>
        ) : null}

        {read.status === "ready" ? (
          <table className="w-full border text-xs">
            <caption className="sr-only">
              {itemName}: quantity on hand before and after this move.
            </caption>
            <tbody>
              <tr className="border-b">
                <th
                  scope="row"
                  className="text-muted-foreground px-2 py-1 text-left font-normal"
                >
                  On hand now
                </th>
                <td className="px-2 py-1 text-right font-medium tabular-nums">
                  {counted(read.item.qty, read.item.unit)}
                </td>
              </tr>
              <tr>
                <th
                  scope="row"
                  className="text-muted-foreground px-2 py-1 text-left font-normal"
                >
                  {isRemoved ? "After this" : "After this removal"}
                </th>
                <td className="px-2 py-1 text-right font-medium tabular-nums">
                  {counted(
                    isRemoved ? read.item.qty + 1 : read.item.qty - 1,
                    read.item.unit
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setOpen(false);
            }}
          >
            Leave it
          </Button>
          <Button
            type="button"
            size="sm"
            variant={isRemoved ? "outline" : "destructive"}
            loading={isPending}
            onClick={() => {
              onSetStatus(unitId, nextStatus);
              setOpen(false);
            }}
            data-icon="inline-start"
          >
            {isRemoved ? (
              <IconRestore aria-hidden="true" data-icon="inline-start" />
            ) : (
              <IconPackageOff aria-hidden="true" data-icon="inline-start" />
            )}
            {isRemoved ? "Put it back" : "Remove this one"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

/**
 * The asset-tag register: every physical unit the school has labelled.
 *
 * Sits on `listUnits`, ordered `uniqueNo ASC` so it reads down the page the way a
 * label drawer does.
 *
 * Its empty state is the fourth of the four distinct empty states in this feature
 * and the only one that asks for an action — the other three (loans, issues,
 * write-offs) are reassuring or informational and are written in
 * `lifecycle-tabs.tsx`, which explains the set. This one lives here because this
 * panel owns its own query and an empty state has to be decided where the rows
 * are. `onReceiveStock` is passed in rather than created here so the header owns
 * the one Receive-stock button for the whole page.
 */
export const AssetRegisterPanel = ({
  onReceiveStock,
}: {
  onReceiveStock: () => void;
}) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<UnitStatus | "all">("all");
  const idBase = `asset-register-${useId().replaceAll(/[^\dA-Za-z_-]/gu, "")}`;

  const unitsQuery = useQuery(
    orpc.inventory.units.list.queryOptions({
      input: {
        limit: REGISTER_PAGE_SIZE,
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(statusFilter === "all" ? {} : { status: statusFilter }),
      },
    })
  );

  const units = useMemo(() => unitsQuery.data?.units ?? [], [unitsQuery.data]);
  const total = unitsQuery.data?.total ?? 0;
  const counters = useMemo(() => countUnits(units), [units]);
  /** True when the register holds more tags than the page asked for. */
  const isTruncated = total > units.length;

  const updateUnitMutation = useMutation(
    orpc.inventory.units.update.mutationOptions({
      onSuccess: async (result) => {
        toast.success(
          result.unit.status === "removed"
            ? `${result.unit.uniqueNo} taken off the register as removed from stock — ${result.item.name} now holds ${pluralUnits(result.item.qty)}`
            : `${result.unit.uniqueNo} restored to stock — ${result.item.name} now holds ${pluralUnits(result.item.qty)}`
        );
        /**
         * `unit`, not `stock`: this is one tagged unit's status moving by hand, not
         * a delivery and not a removal of stock. The difference is what gets
         * re-read — a unit's status feeds the item's `availableQty`, so the register
         * and the item read both move, and the row this wrote to the change log is
         * the audit of it.
         */
        await invalidateInventory(queryClient, "unit");
      },
      onError: (error) => {
        toast.error(
          formatApiErrorMessage(error, "Could not update that asset tag")
        );
      },
    })
  );

  const setUnitStatus = (unitId: string, status: UnitStatus) => {
    updateUnitMutation.mutate({ unitId, status });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <FieldLabel htmlFor={`${idBase}-search`}>
            Search the register
          </FieldLabel>
          <Input
            id={`${idBase}-search`}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            placeholder="Asset tag, item name or SKU"
            className="mt-1"
          />
        </div>
        <div>
          <FieldLabel htmlFor={`${idBase}-status`}>Status</FieldLabel>
          <Select
            value={statusFilter}
            onValueChange={(value: string | null) => {
              if (value === "all" || isUnitStatus(value)) {
                setStatusFilter(value);
              }
            }}
          >
            <SelectTrigger id={`${idBase}-status`} className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {UNIT_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {unitStatusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/**
       * Counted from the rows on screen, not from the database.
       *
       * `listUnits` returns a page plus the matching `total` — there is no group-by
       * aggregate — so a per-status count would mean a second round trip per status,
       * or a client-side pass over rows that were never fetched. The table's caption
       * is therefore a summary of *this page* and says so: when `total` exceeds the
       * rows on screen, the caption and the line under it both say it rather than
       * presenting a partial count as the whole register. Narrowing the search or
       * the status filter above makes the page the whole register.
       *
       * `InventoryStatCards` is deliberately not used here: its six fields
       * (`totalItems`, `lowStockItems`, …) describe the *item* register, and
       * bending them to describe *units* would put a card labelled "Items" above
       * a number that is a count of tags.
       *
       * **Gated on `!isLoading && !isError`, and that gate is the point.** A row of six
       * zeros is a claim about the school: it says the store has no tags, nothing on
       * loan, nothing issued, nothing disposed and nothing removed. Rendering it while
       * the request is in flight — or after it failed — is the same defect as
       * `data?.total ?? 0`, and it is the one a storekeeper acts on: "nothing is on
       * loan" and "we could not reach the server" must not look alike. While the read is
       * in flight the skeleton below stands in for the region; after a failure the named
       * error does, and the counters are simply absent rather than wrong.
       */}
      {!unitsQuery.isLoading && !unitsQuery.isError ? (
        <table className="w-full border text-xs">
          <caption className="text-muted-foreground pb-1 text-left">
            {`Counted from the ${units.length} tag${units.length === 1 ? "" : "s"} on this page, out of ${total} on record — narrow the search or the status filter to count a smaller set.`}
          </caption>
          <thead>
            <tr>
              {REGISTER_COUNTERS.map(({ key, label }) => (
                <th
                  key={key}
                  scope="col"
                  className="border px-3 py-2 text-right font-medium"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {REGISTER_COUNTERS.map(({ key }) => (
                <td
                  key={key}
                  className="border px-3 py-2 text-right font-semibold tabular-nums"
                >
                  {counters[key]}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      ) : null}

      {unitsQuery.isLoading ? <InventorySkeleton rows={8} /> : null}

      {unitsQuery.isError ? (
        <InventoryErrorState
          error={unitsQuery.error}
          onRetry={() => {
            void unitsQuery.refetch();
          }}
        />
      ) : null}

      {!unitsQuery.isLoading && !unitsQuery.isError && units.length === 0 ? (
        <InventoryEmptyState
          title="No asset tags have been received yet"
          description="The register lists every individual device the school has labelled, one row per tag, and nothing has been received — so there is nothing here to track. Receive a delivery and its tags are created for you."
          action={
            <Button
              type="button"
              size="sm"
              onClick={onReceiveStock}
              data-icon="inline-start"
            >
              <IconPackage aria-hidden="true" data-icon="inline-start" />
              Receive stock
            </Button>
          }
        />
      ) : null}

      {!unitsQuery.isLoading && !unitsQuery.isError && units.length > 0 ? (
        <Table>
          <TableCaption>
            {`Every asset tag the school has labelled${isTruncated ? `, first ${units.length} of ${total}` : ""}. The action column is the only status change a person may make by hand; the other three statuses are moved by the procedure that owns them, and the row says which.`}
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Asset tag</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead className="hidden md:table-cell">Location</TableHead>
              <TableHead className="hidden md:table-cell">
                Last change
              </TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((unit) => (
              <TableRow key={unit.id}>
                <TableCell className="font-mono font-medium">
                  {unit.uniqueNo}
                </TableCell>
                <TableCell>
                  <span className="block">{unit.itemName}</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {unit.itemSku}
                  </span>
                </TableCell>
                <TableCell>
                  <UnitStatusBadge status={unit.status} />
                </TableCell>
                <TableCell>
                  <ConditionBadge condition={unit.condition} />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {unit.location || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground hidden tabular-nums md:table-cell">
                  {formatDateTime(unit.updatedAt)}
                </TableCell>
                <TableCell>
                  <UnitStatusPopover
                    unitId={unit.id}
                    uniqueNo={unit.uniqueNo}
                    itemId={unit.itemId}
                    itemName={unit.itemName}
                    status={unit.status}
                    isPending={updateUnitMutation.isPending}
                    onSetStatus={setUnitStatus}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
};
