"use client";

/**
 * The container for everything else in this folder: the two counter movements in
 * the header, and the four lifecycle tabs beneath them.
 *
 * ## Why this tab order, and it is a product decision
 *
 * **1. Loans — who has what, and what is overdue.**
 * The only tab holding something that is *wrong right now*. A late loan is the one
 * row in the whole inventory feature a clerk can act on today: chase whoever is
 * holding it, or take it back. It sorts to the top of its own list and its count
 * rides on the tab label, because a queue whose urgent rows are two clicks deep is
 * a queue nobody checks. The tab is named for the movement rather than for the
 * holder — loans are made to members of staff *and* to students now, and a tab
 * labelled "Teacher loans" above a table that is half pupils would be a caption the
 * table contradicts.
 *
 * **2. Issues — what has permanently left the school.**
 * A record, not a task. Nothing chases an issue and nothing can be done about one;
 * it is the certificate that exists because an audit will ask who took the three
 * projectors and when. Second because it is the one tab whose contents are
 * *evidence* rather than work.
 *
 * **3. Write-offs — the two-stage queue.**
 * Real work, but batched and second-signed, so it waits behind the tab whose rows
 * are individually actionable today. It is also the only tab where a row can be
 * **impossible** to act on — the server refuses self-approval — which makes it a
 * poor thing to land a user on first, and is why `DisposalsPanel` now defaults to
 * the *signed-off* queue rather than the awaiting-a-signature one.
 *
 * **4. Asset register — every tracked unit and its tag.**
 * The school's physical inventory, and the least urgent of the four. It is a
 * reference surface: a clerk goes to it to answer "do we have a projector, and
 * which one", not because something needs doing. Last, and deliberately — a
 * register that greets a user with four hundred asset tags is a screen that
 * buries the two rows above it that needed an answer.
 *
 * ## The four empty states, which are the highest-value work in this file
 *
 * Three of them are written here, one lives with the register in
 * `stock-dialogs.tsx` (which owns its own query and so has to decide its own empty
 * state). **They are four different pieces of copy on purpose, and this is the
 * single most valuable thing in the file.** A shared "No data" would be four lies:
 *
 * - An **empty loan queue** is *reassuring*. Every unit is where it should be. It
 *   is also the one of the four that can be empty for two quite different reasons
 *   — nothing has ever been lent, or everything lent has come back — and the copy
 *   in `borrow-dialogs.tsx` names both kinds of borrower rather than a single
 *   "somebody", because half the rows that would appear here are pupils.
 * - An **empty issue list** is also reassuring, and it means something quite
 *   different: nothing has permanently left the building.
 * - An **empty write-off queue** is normal, and the copy has to say which normal:
 *   nothing awaiting a signature is a quiet queue, while nothing finalised ever is
 *   the ordinary condition of a school that has not yet had to destroy anything.
 * - An **empty asset register** is the only one that asks for an action, because
 *   it means no delivery has ever been received.
 *
 * A user who reads an empty screen is being told what state their school is in.
 * "No data" tells them nothing, and four identical empty states on four tabs that
 * mean four different things is worse than no empty state at all.
 */
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@school-student-teacher-management/ui/components/tabs";
import { IconPackage, IconPackageOff } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { LoansPanel } from "@/components/staff/inventory/borrow-dialogs";
import { DisposalsPanel } from "@/components/staff/inventory/disposal-dialogs";
import { IssuesPanel } from "@/components/staff/inventory/issue-dialogs";
import { InventoryLedgerTabs } from "@/components/staff/inventory/ledger-views";
import {
  AssetRegisterPanel,
  StockInDialog,
  StockOutDialog,
} from "@/components/staff/inventory/stock-dialogs";
import { orpc } from "@/utils/orpc";

/** The tab values, exported so a route can deep-link into one. */
export type LifecycleTab = "loans" | "issues" | "write-offs" | "register";

/**
 * The school-wide count of late loans, for the tab label.
 *
 * A separate, deliberately tiny query: `limit: 1` because only `total` is wanted,
 * and the server computes that from the same `where` as the page and **before** the
 * limit. That is what makes the number safe to put on a tab label — it is the true
 * count of late loans in the school, not a count of whichever page happens to be
 * loaded. The Loans panel's own list is left unfiltered by this query, so nothing
 * here widens the payload the list itself has to render.
 */
const useOverdueCount = (): number => {
  const query = useQuery(
    orpc.inventory.borrows.list.queryOptions({
      input: { overdueOnly: true, limit: 1 },
    })
  );

  return query.data?.total ?? 0;
};

/**
 * Which of the four sub-tabs is active, and where a switch navigates — both
 * now owned by the parent route (`inventory-page.tsx`'s `InventoryPage`,
 * fed by real path segments like `.../inventory/loans` rather than a
 * `?subtab=` search param), for the same reason the pane above this one made
 * the identical change: a clerk chasing an overdue loan who bookmarks or
 * refreshes has to land back on the sub-tab they were reading, and a real
 * path survives that better than query state on a client-rendered page.
 * `scrollToLedger` is the one thing that isn't a `Tabs` value at all — the
 * ledger section sits below the tabs regardless of which one is active, so
 * `/inventory/ledger` lands on Loans (the pane's own default) and scrolls
 * past it to the heading below.
 */
export const InventoryLifecycleTabs = ({
  activeSubtab,
  onSubtabChange,
  scrollToLedger,
}: {
  activeSubtab: LifecycleTab;
  onSubtabChange: (next: LifecycleTab) => void;
  scrollToLedger: boolean;
}) => {
  const [isStockInOpen, setIsStockInOpen] = useState(false);
  const [isStockOutOpen, setIsStockOutOpen] = useState(false);
  const overdueCount = useOverdueCount();
  const ledgerHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (scrollToLedger) {
      ledgerHeadingRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [scrollToLedger]);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        {/*
          **An `<h2>`, not the `<h1>` this used to be.** The page's single `h1` —
          "Inventory" — is in `inventory-page.tsx`, above the tab bar, precisely so
          that it survives a change of pane. This heading is the Records pane's own
          name, so it is a section of that page rather than a second name for it, and
          two `h1`s in one document is the thing that was wrong: assistive technology
          reads the outline, and a document with two level-one headings has no way to
          say which one the page is called.

          The sequence below it is `h1` (page) → `h2` (this pane) → `h2` ("Ledgers").
          `Ledgers` stays at the same level rather than dropping to an `h3` because it
          is a **sibling** of this header, not a subsection of it: the two movements
          and the four lifecycle tabs sit under this heading, and the ledgers are a
          separate `<section>` after them, not something inside the movements. Two
          `h2`s under one `h1` is a flat, valid outline; nesting one of them for a
          relationship the DOM does not have would not be.
        */}
        <h2 className="font-heading text-4xl font-semibold">Stock movements</h2>
        <p className="text-muted-foreground max-w-3xl">
          Everything the school has given out, written off, or received — and
          every tagged device behind it. A loan comes back; an issue does not; a
          write-off needs a second signature before any stock moves.
        </p>
      </header>

      {/**
       * The two direct counter movements, in the header rather than on a tab,
       * because neither of them belongs to a lifecycle.
       *
       * `stockIn` and `stockOut` both change `inventoryItem.qty` in a single
       * call, with no queue and no signature — they are the movements a store does
       * on the day. Everything under the tabs is a record of something, or a
       * request for something.
       *
       * **The second button is "Remove from stock", not "Write off stock".** The
       * tab below it is called Write-offs, and it is a two-stage certificate that
       * a principal has to sign — a clerk destroying a projector was pressing a
       * primary button labelled with the same word as the request queue one tab
       * away, and the irreversible single-call route was the one wearing the
       * primary style. The description under the pair says which needs no
       * approval, because "no approval" is the whole difference between them and a
       * verb is not enough to convey it.
       */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => setIsStockInOpen(true)}
            data-icon="inline-start"
          >
            <IconPackage data-icon="inline-start" />
            Receive stock
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsStockOutOpen(true)}
            data-icon="inline-start"
          >
            <IconPackageOff data-icon="inline-start" />
            Remove from stock
          </Button>
        </div>
        <p className="text-muted-foreground max-w-3xl text-xs">
          Both of these take effect immediately and need no approval. Property
          being destroyed, recycled, auctioned or donated goes on the{" "}
          <span className="font-medium">Write-offs</span> tab instead, which
          waits for a second signature before any stock moves.
        </p>
      </div>

      <Tabs
        value={activeSubtab}
        onValueChange={(next: unknown) => onSubtabChange(next as LifecycleTab)}
      >
        <TabsList
          variant="line"
          className="border-primary/18 h-auto w-full justify-start gap-0.5 rounded-none border-b p-0"
        >
          <TabsTrigger
            value="loans"
            className="group gap-2 rounded-none border border-b-0 border-transparent px-4 py-2.5 font-semibold after:hidden"
          >
            Loans
            {/**
             * The count on the tab label is the one number on this page that
             * demands action, so it is on the tab rather than inside the tab. A
             * queue whose urgent rows are one click deep is a queue that gets
             * checked; the same number buried in a sub-filter button is not.
             */}
            {overdueCount > 0 ? (
              <span className="group-data-active:bg-primary group-data-active:text-accent bg-destructive/15 text-destructive px-1.5 py-0.5 font-mono text-xs tabular-nums">
                {overdueCount} overdue
              </span>
            ) : null}
          </TabsTrigger>

          <TabsTrigger
            value="issues"
            className="rounded-none border border-b-0 border-transparent px-4 py-2.5 font-semibold after:hidden"
          >
            Issues
          </TabsTrigger>

          <TabsTrigger
            value="write-offs"
            className="rounded-none border border-b-0 border-transparent px-4 py-2.5 font-semibold after:hidden"
          >
            Write-offs
          </TabsTrigger>

          <TabsTrigger
            value="register"
            className="rounded-none border border-b-0 border-transparent px-4 py-2.5 font-semibold after:hidden"
          >
            Asset register
          </TabsTrigger>
        </TabsList>

        <TabsContent value="loans" className="space-y-4 pt-4">
          <LoansPanel overdueCount={overdueCount} />
        </TabsContent>

        <TabsContent value="issues" className="space-y-4 pt-4">
          <IssuesPanel />
        </TabsContent>

        <TabsContent value="write-offs" className="space-y-4 pt-4">
          <DisposalsPanel />
        </TabsContent>

        <TabsContent value="register" className="space-y-4 pt-4">
          {/**
           * The register's own empty state lives in `stock-dialogs.tsx` beside its
           * query — it is the fourth of the four, and the only one that offers an
           * action. It is reachable from here by this handler rather than owning a
           * second "Receive stock" button, so the page has exactly one.
           */}
          <AssetRegisterPanel onReceiveStock={() => setIsStockInOpen(true)} />
        </TabsContent>
      </Tabs>

      <section aria-labelledby="ledger-heading" className="space-y-4">
        <div className="space-y-2">
          <h2
            ref={ledgerHeadingRef}
            id="ledger-heading"
            className="font-heading text-2xl font-semibold"
          >
            Ledgers
          </h2>
          <p className="text-muted-foreground max-w-3xl">
            Two read-only histories, kept apart on purpose.{" "}
            <strong className="font-medium">Movements</strong> is what happened
            to the quantities, with the numbers from immediately before and
            after each one. <strong className="font-medium">Change log</strong>{" "}
            is what happened to the records themselves, field by field, and it
            keeps the name of the person who made each change even after they
            have left.
          </p>
        </div>
        <InventoryLedgerTabs />
      </section>

      <StockInDialog open={isStockInOpen} onOpenChange={setIsStockInOpen} />
      <StockOutDialog open={isStockOutOpen} onOpenChange={setIsStockOutOpen} />
    </div>
  );
};
