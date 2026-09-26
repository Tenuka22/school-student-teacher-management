import type { InferRouterInputs } from "@orpc/server";
import type { AppRouter } from "@school-student-teacher-management/api/routers/index";
import { IconPlus } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { formatAcademicYearRange } from "@/components/admin/admin-overview";
import type { AdminOverview } from "@/components/admin/admin-overview";
import {
  DashboardPanels,
  ErrorPanel,
} from "@/components/admin/admin-overview-panels";
import type { CategoryOption } from "@/components/staff/inventory/inventory-types";
import { InventoryItemDialogs } from "@/components/staff/inventory/item-dialogs";
import { invalidateInventory } from "@/components/staff/inventory/shared";
import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

type CreateItemInput =
  InferRouterInputs<AppRouter>["inventory"]["items"]["create"];

/**
 * The edit half of `InventoryItemDialogs`, which this page never reaches.
 *
 * `onEditOpenChange`, `onEditSubmit` and `editActions` are required props, and
 * the edit dialog is only ever opened through `onEditOpenChange`. This page
 * keeps it shut (`isEditOpen={false}`, `selectedItem={null}`) and opens only
 * the create dialog, so nothing below is reachable: an administrator creating a
 * new line on the home page is not editing an existing one, and the register
 * (`/admin/$year/staff/inventory`) is where that happens.
 *
 * Named here, with the reason, rather than inlined as four empty arrows at the
 * call site: an empty function at a call site reads as "not wired up yet", which
 * is exactly the impression the note above the page is trying to remove. Each
 * returns its own argument rather than having an empty body, so the "this never
 * runs" is stated once in the note and not repeated in every arrow.
 */
const ignoreEditOpenChange = (open: boolean) => open;
const ignoreEditSubmit = () => Promise.resolve();
const ignoreEditAction = () => false;

/**
 * The administrator's home page.
 *
 * Every figure here is a query against the selected year
 * (`staff.getAdminOverview`). It used to be a set of module-level constants — a
 * fixed 62% ring, "1,736 of 2,800" slots, "All systems operational" with no
 * health check behind it — and every button on the page was inert, which taught
 * administrators to distrust the whole surface. The panels themselves live in
 * `components/admin/admin-overview-panels.tsx`; this module fetches and routes.
 *
 * The header carries three buttons now, and the third ("+ New Item") is a
 * deliberate exception to the other two's own rule. "Academic years" and
 * "GO TO TEACHERS" are *navigation* — the argument for keeping the header to a
 * pair of them is that the exhaustive navigation surface is the `Go to` grid
 * inside `DashboardPanels`, and a header of a dozen links is a header nobody
 * reads. "+ New Item" is not navigation: it opens the same complex,
 * multi-fieldset item-creation dialog the equipment register uses
 * (`InventoryItemDialogs` in `components/staff/inventory/item-dialogs.tsx`)
 * without leaving this page, so registering a new line in the store — the
 * single highest-frequency write on the whole admin surface — does not first
 * require a trip to `/admin/$year/staff/inventory`. Adding it here duplicates
 * a small, independent slice of `useInventoryPage` (the categories read, the
 * `createItem` mutation, one boolean of dialog state) rather than the whole
 * hook, which also runs borrow/low-stock queries and ten other mutations this
 * page has no use for. The edit half of `InventoryItemDialogs` is always
 * closed here (`isEditOpen={false}`, `selectedItem={null}`) — this page never
 * edits an existing item, only ever creates a new one.
 */
const RouteComponent = () => {
  const { year } = Route.useParams();
  const { session } = useRouteContext({ from: "/_auth" });
  const queryClient = useQueryClient();

  const academicYearsQuery = useQuery(
    orpc.staff.listAcademicYears.queryOptions()
  );
  const selectedYear = useMemo(
    () => academicYearsQuery.data?.find((item) => item.year === Number(year)),
    [academicYearsQuery.data, year]
  );

  const overview = useQuery({
    ...orpc.staff.getAdminOverview.queryOptions({
      input: { academicYearId: selectedYear?.id ?? "" },
    }),
    enabled: Boolean(selectedYear?.id),
  });

  const data = overview.data as AdminOverview | undefined;
  const isLoading = academicYearsQuery.isPending || overview.isPending;
  const error =
    (overview.isError ? overview.error : academicYearsQuery.error) ?? null;

  // ─── Item creation ──────────────────────────────────────────────────────
  //
  // The independent slice of `useInventoryPage` this page actually needs: a
  // categories read (an item cannot be created without one, and the picker
  // has to know what exists), the create mutation, and one boolean for the
  // dialog. Everything else that hook carries — borrows, low-stock counts,
  // the other nine mutations — has no reader on this page.

  const [isCreateItemOpen, setIsCreateItemOpen] = useState(false);

  const categoriesQuery = useQuery(
    orpc.inventory.categories.list.queryOptions()
  );
  const categories: CategoryOption[] = useMemo(
    () => categoriesQuery.data ?? [],
    [categoriesQuery.data]
  );

  const createItemMutation = useMutation(
    orpc.inventory.items.create.mutationOptions({
      onSuccess: async (created) => {
        toast.success(
          `"${created.name}" registered as ${created.sku}${
            created.uniqueIdCount > 0
              ? ` with ${created.uniqueIdCount} asset tag(s)`
              : ""
          }`
        );
        setIsCreateItemOpen(false);
        await invalidateInventory(queryClient, "item");
      },
      onError: (createError: unknown) => {
        toast.error(
          formatApiErrorMessage(createError, "Could not register this item")
        );
      },
    })
  );

  const handleCreateItemSubmit = useCallback(
    async (values: Record<string, unknown>) => {
      await createItemMutation.mutateAsync(values as CreateItemInput);
    },
    [createItemMutation]
  );

  return (
    <div className="flex flex-col gap-[18px]">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="font-heading text-primary m-0 text-[38px] leading-[1.05] font-semibold">
            Welcome back, {session?.user.name ?? "there"}
          </h1>
          <p className="text-primary/65 mt-1.5 text-[13.5px]">
            {data?.year
              ? `Academic year ${data.year.year}, ${formatAcademicYearRange(data.year.startDate, data.year.endDate)}.`
              : "Loading the selected academic year."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link
            className="border-primary/25 text-primary hover:border-primary border px-[18px] py-2.5 text-xs font-bold transition-colors"
            params={{ year }}
            to="/admin/$year/academic-years"
          >
            Academic years
          </Link>
          <button
            type="button"
            className="border-primary/25 text-primary hover:border-primary flex items-center gap-1.5 border px-[18px] py-2.5 text-xs font-bold transition-colors"
            onClick={() => {
              setIsCreateItemOpen(true);
            }}
          >
            <IconPlus className="size-4" />
            New Item
          </button>
          <Link
            className="bg-primary text-primary-foreground hover:bg-primary-hover px-5 py-2.5 text-xs font-extrabold tracking-[0.04em] transition-colors"
            params={{ year }}
            to="/admin/$year/staff/teachers"
          >
            GO TO TEACHERS
          </Link>
        </div>
      </header>

      {isLoading && (
        <p className="text-primary/60 text-sm">Loading this year…</p>
      )}

      {!isLoading && error && (
        <ErrorPanel
          message={error.message}
          onRetry={() => {
            overview.refetch();
          }}
        />
      )}

      {data && <DashboardPanels data={data} year={year} />}

      <InventoryItemDialogs
        categories={categories}
        isCreateOpen={isCreateItemOpen}
        onCreateOpenChange={setIsCreateItemOpen}
        isEditOpen={false}
        onEditOpenChange={ignoreEditOpenChange}
        selectedItem={null}
        isCreatePending={createItemMutation.isPending}
        isEditPending={false}
        onCreateSubmit={handleCreateItemSubmit}
        onEditSubmit={ignoreEditSubmit}
        editActions={{
          isLoading: false,
          handleTransferCustody: ignoreEditAction,
          handleAssignManager: ignoreEditAction,
          handleRecordStockIn: ignoreEditAction,
          handleWriteOffStock: ignoreEditAction,
        }}
      />
    </div>
  );
};

export const Route = createFileRoute("/_auth/admin/$year/")({
  component: RouteComponent,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      orpc.staff.listAcademicYears.queryOptions()
    );
  },
});
