import { Button } from "@school-student-teacher-management/ui/components/button";
import { IconPackageExport } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { HandBackPanel } from "@/components/staff/inventory/scan-item-panels";
import {
  ConditionBadge,
  CustodyBadge,
  invalidateInventory,
  ItemStatusBadge,
} from "@/components/staff/inventory/shared";
import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

/**
 * The page a QR code on a cupboard or a shelf actually points at — the target
 * `list-custody-notices.ts`'s doc comment and `get-item-for-scan.ts`'s doc
 * comment both refer to.
 *
 * Mounted directly under `_auth` (like `account.tsx`), not under any one
 * role's workspace: an admin, a Principal, a Deputy and a teacher can all
 * scan the same physical label, and `getForScan` decides what each of them
 * may see and do with it server-side — this page renders whatever comes
 * back rather than branching on the caller's role itself. A teacher who is
 * neither the item's manager nor its holder nor eligible to take it gets a
 * `FORBIDDEN` from the query, rendered here as a plain refusal rather than
 * the whole register.
 *
 * ## What is in this file, and what is not
 *
 * The three writes, their toasts and their invalidation — because that is what
 * a route file is for, and because a toast that fires on success and a toast
 * that fires on the server's own sentence are the same decision. The two
 * dialog-shaped forms are in `scan-item-panels.tsx`; they used to be
 * `renderHandBack()` and `renderRequest()` closures here, which is what took this
 * file past `react-doctor`'s `no-giant-component` line. Which of them is offered
 * at all is **not** decided here either: `getForScan` returns `canTake`,
 * `canHandBack` and `canRequest` per caller, and this page renders what it is
 * told.
 */
const RouteComponent = () => {
  const { itemId } = Route.useParams();
  const queryClient = useQueryClient();

  const itemQuery = useQuery(
    orpc.inventory.items.getForScan.queryOptions({ input: { itemId } })
  );

  const invalidate = async () => {
    await invalidateInventory(queryClient, "custody");
    await queryClient.invalidateQueries();
  };

  const takeMutation = useMutation(
    orpc.inventory.custody.take.mutationOptions({
      onSuccess: async () => {
        toast.success("This item is now recorded as yours");
        await invalidate();
      },
      onError: (error) => {
        toast.error(formatApiErrorMessage(error, "Could not take this item"));
      },
    })
  );

  const releaseMutation = useMutation(
    orpc.inventory.custody.release.mutationOptions({
      onSuccess: async () => {
        toast.success("Handed back — the register records who takes it now");
        await invalidate();
      },
      onError: (error) => {
        toast.error(
          formatApiErrorMessage(error, "Could not hand this item back")
        );
      },
    })
  );

  if (itemQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">Reading this item…</p>
      </div>
    );
  }

  if (itemQuery.isError) {
    // A `FORBIDDEN` here is the ordinary case for a reader with no relationship
    // to the item, and it is a refusal rather than a failure: the label scanned
    // fine, and the answer is that this person may not do anything with it.
    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          {formatApiErrorMessage(
            itemQuery.error,
            "This item could not be read"
          )}
        </p>
      </div>
    );
  }

  const item = itemQuery.data;

  if (!item) {
    return null;
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="font-heading text-3xl font-semibold">{item.name}</h1>
        <p className="text-muted-foreground mt-1 font-mono text-sm">
          {item.sku}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ItemStatusBadge status={item.status} />
        <ConditionBadge condition={item.condition} />
      </div>

      <CustodyBadge
        custodianName={item.custodianName}
        managerName={item.managerName}
      />

      {item.description ? (
        <p className="text-muted-foreground max-w-prose text-sm">
          {item.description}
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
            Category
          </dt>
          <dd className="mt-1">{item.categoryName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
            Location
          </dt>
          <dd className="mt-1">{item.location || "Not set"}</dd>
        </div>
      </dl>

      {item.canTake ? (
        <Button
          data-icon="inline-start"
          disabled={takeMutation.isPending}
          onClick={() => {
            takeMutation.mutate({ itemId: item.id });
          }}
          type="button"
        >
          <IconPackageExport data-icon="inline-start" />
          {takeMutation.isPending ? "Borrowing…" : "Borrow this item"}
        </Button>
      ) : null}

      {item.canHandBack ? (
        <HandBackPanel
          isPending={releaseMutation.isPending}
          managerName={item.managerName}
          managerStaffId={item.managerStaffId}
          onConfirm={(input) => {
            releaseMutation.mutate({ itemId: item.id, ...input });
          }}
        />
      ) : null}

      {!item.canTake && !item.canHandBack ? (
        <p className="text-muted-foreground text-sm">
          You are in charge of this item, but it is currently held by{" "}
          {item.custodianName ?? "nobody"}.
        </p>
      ) : null}
    </div>
  );
};

export const Route = createFileRoute("/_auth/inventory/$itemId")({
  component: RouteComponent,
});
