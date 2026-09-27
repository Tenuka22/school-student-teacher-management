"use client";

/**
 * `IssuesPanel` — the store's issue history: what has permanently left the
 * building, and to whom.
 *
 * The raise form is `IssueDialog`, in `issue-dialog.tsx` beside its three field
 * blocks and its irreversible confirm; it is re-exported here because
 * `lifecycle-tabs.tsx` and `inventory-page.tsx` have always imported this path, and
 * the panel owns the one place the action makes sense.
 */
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import { FieldLabel } from "@school-student-teacher-management/ui/components/field";
import { Input } from "@school-student-teacher-management/ui/components/input";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import { IconPlus } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";

import type { IssueRecord } from "@/components/staff/inventory/inventory-types";
import { IssueDialog } from "@/components/staff/inventory/issue-dialog";
import { pluralUnits } from "@/components/staff/inventory/quantity";
import {
  InventoryEmptyState,
  InventoryErrorState,
  InventorySkeleton,
} from "@/components/staff/inventory/shared";
import {
  PartyName,
  formatDate,
  formatDateTime,
} from "@/components/staff/inventory/stock-form-helpers";
import { orpc } from "@/utils/orpc";

// Re-exported so `@/components/staff/inventory/issue-dialogs` stays the documented
// path for the raise form. The specific rule wins over Ultracite's general guidance
// against barrel files, exactly as in `stock-dialogs.tsx`.
// oxlint-disable-next-line no-barrel-file
export { IssueDialog } from "@/components/staff/inventory/issue-dialog";

/** `listIssues`' own default, and its hard ceiling. */
const ISSUE_LIST_LIMIT = 200;

/**
 * `isOutstanding` is a reconciliation aid and nothing else.
 *
 * An issue is **terminal**: `inventory_issue` has no `updatedAt`, no status column
 * and both of its foreign keys are `restrict`, so there is no return, no
 * cancellation and no transition for a flag to be the first arm of. The server
 * computes the flag on every row anyway, and the only honest thing a UI can do
 * with it is *point at a row worth asking about*.
 *
 * So the badge is `outline` rather than `warning` or `destructive`: it is not a
 * failure state and there is no task behind it. Copy that implied a workflow
 * ("overdue", "action required", "pending return") would be describing a state
 * machine this feature does not have.
 *
 * `text-warning-ink` and not `text-gold`: this is body-sized text, and `--gold` is
 * 3.87:1 on the page, which fails AA. `--gold` stays for fills and rules, where it
 * is a surface and not ink; the badge's `border-accent/50` and the striped fill are
 * exactly that use, so both tokens legitimately coexist on one element.
 */
const OutstandingMarker: React.FC<{ record: IssueRecord }> = ({ record }) =>
  record.isOutstanding ? (
    <Badge variant="outline" className="border-accent/50 text-warning-ink mt-1">
      Past expected return
    </Badge>
  ) : null;

/**
 * The store's issue history.
 *
 * Owns its own create dialog: the "Issue stock" action only makes sense beside the
 * list it will appear in, so there is no reason for the tab container to hold that
 * piece of state. (The two counter movements in the page header are the exception —
 * they have no natural tab, and `lifecycle-tabs.tsx` owns them.)
 */
export const IssuesPanel = () => {
  const idBase = `issues-${useId().replaceAll(/[^\dA-Za-z_-]/gu, "")}`;
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const issuesQuery = useQuery(
    orpc.inventory.issues.list.queryOptions({
      input: {
        limit: ISSUE_LIST_LIMIT,
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      },
    })
  );

  const issues = useMemo(
    () => issuesQuery.data?.issues ?? [],
    [issuesQuery.data]
  );
  const total = issuesQuery.data?.total ?? 0;
  const hasFilter = Boolean(search.trim() || from || to);
  const outstandingCount = useMemo(
    () => issues.filter((issue) => issue.isOutstanding).length,
    [issues]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56">
            <FieldLabel htmlFor={`${idBase}-search`}>Search</FieldLabel>
            <Input
              id={`${idBase}-search`}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              placeholder="Receiver, purpose, item or SKU"
              className="mt-1"
            />
          </div>
          <div>
            <FieldLabel htmlFor={`${idBase}-from`}>Issued from</FieldLabel>
            <Input
              id={`${idBase}-from`}
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
              }}
              className="mt-1"
            />
          </div>
          <div>
            <FieldLabel htmlFor={`${idBase}-to`}>Issued to</FieldLabel>
            <Input
              id={`${idBase}-to`}
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
              }}
              className="mt-1"
            />
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setIsDialogOpen(true);
          }}
          data-icon="inline-start"
        >
          <IconPlus aria-hidden="true" data-icon="inline-start" />
          Issue stock
        </Button>
      </div>

      {outstandingCount > 0 ? (
        <p className="text-muted-foreground text-xs">
          {outstandingCount} of the {issues.length} shown were promised back by
          a date that has now passed. Nothing chases them &mdash; an issue has
          no return path &mdash; so this is a list of rows worth asking about at
          the end of term, not an open task.
        </p>
      ) : null}

      {issuesQuery.isLoading ? <InventorySkeleton rows={8} /> : null}

      {/**
       * The one place a failed read must not become a fact. `isError` and
       * `isLoading` both suppress the table and the empty state below, so a request
       * that never arrived renders as a named error with a retry and **not** as
       * "No stock has left the school" &mdash; which is the sentence a clerk would
       * act on.
       */}
      {issuesQuery.isError ? (
        <InventoryErrorState
          error={issuesQuery.error}
          onRetry={() => {
            void issuesQuery.refetch();
          }}
        />
      ) : null}

      {!issuesQuery.isLoading && !issuesQuery.isError && issues.length === 0 ? (
        <InventoryEmptyState
          title={
            hasFilter
              ? "No issues match this search"
              : "No stock has left the school"
          }
          description={
            hasFilter
              ? "Nothing in the issue history matches this search or date range. Clear them to see every hand-over on record."
              : "Every unit the school owns is still the school's. An issue is a deliberate hand-over to somebody outside the school's daily use — a graduating student, a contractor, a feeder school — and each one is recorded here with the receiver's name and the asset tags that went out with it."
          }
        />
      ) : null}

      {!issuesQuery.isLoading && !issuesQuery.isError && issues.length > 0 ? (
        <>
          <Table>
            <TableCaption>
              {`Every issue on record${total > issues.length ? `, first ${issues.length} of ${total}` : ""}. Every asset tag on an issue is listed in full — this page is the only record of which devices left the building, so nothing on it is shortened.`}
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Received by</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Asset tags</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Expected back</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {issues.map((issue) => (
                <TableRow key={issue.id}>
                  <TableCell>
                    <span className="block font-medium">{issue.itemName}</span>
                    <span className="text-muted-foreground font-mono text-xs">
                      {issue.itemSku}
                    </span>
                  </TableCell>
                  {/**
                   * The quantity cell names the unit rather than printing a bare
                   * figure. The issue row is the one place a bare `3` is genuinely
                   * ambiguous: it is the only record of how much of what left the
                   * building, and it is read months later by somebody who was not
                   * there.
                   */}
                  <TableCell className="text-right font-medium tabular-nums">
                    {pluralUnits(issue.qty)}
                  </TableCell>
                  <TableCell>
                    <span className="block">{issue.receiverName}</span>
                    {issue.receiverDepartment ? (
                      <span className="text-muted-foreground text-xs">
                        {issue.receiverDepartment}
                      </span>
                    ) : null}
                    {issue.receiverPhone ? (
                      <span className="text-muted-foreground font-mono text-xs tabular-nums">
                        {issue.receiverPhone}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-72">
                    <span className="line-clamp-2">{issue.purpose}</span>
                    {issue.note ? (
                      <span className="text-muted-foreground line-clamp-1 text-xs italic">
                        {issue.note}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {/**
                     * **Every tag, in full.**
                     *
                     * This was `summariseTags` — three tags and a `+17 more` — and
                     * the field's own copy promised the opposite ("the receipt quotes
                     * them back"). On the one page that exists *only* to record which
                     * devices left the building and to whom, a shortened tag list is a
                     * shortened audit trail, and there is nothing else on the row that
                     * could recover the rest. So the list wraps instead of truncating,
                     * and the caption says so.
                     */}
                    {issue.units.length > 0 ? (
                      <ul className="font-mono text-xs">
                        {issue.units.map((unit) => (
                          <li key={unit.id} className="break-all">
                            {unit.uniqueNo}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-muted-foreground">
                        Counted in bulk — no tags
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="block tabular-nums">
                      {formatDateTime(issue.issuedAt)}
                    </span>
                    <PartyName
                      name={issue.issuedByName}
                      staffId={issue.issuedByStaffId}
                      emptyLabel="Issued by an account with no staff record"
                      goneLabel="Issuer no longer on the roll"
                    />
                  </TableCell>
                  <TableCell>
                    {issue.expectedReturnDate ? (
                      <>
                        <span className="block tabular-nums">
                          {formatDate(issue.expectedReturnDate)}
                        </span>
                        <OutstandingMarker record={issue} />
                      </>
                    ) : (
                      <span className="text-muted-foreground">Not stated</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <p className="text-muted-foreground text-xs">
            Showing {issues.length} of {total} issues on record. Every asset tag
            on an issue is listed in full &mdash; this page is the only record
            of which devices left the building, so nothing on it is shortened.{" "}
            <span className="font-medium">Past expected return</span> marks
            stock that was promised back and was not &mdash; it is a note for
            the end-of-term reconciliation, not a state this system moves on.
          </p>
        </>
      ) : null}

      <IssueDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </div>
  );
};
