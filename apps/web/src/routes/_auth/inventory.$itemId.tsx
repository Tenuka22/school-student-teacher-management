import {
  ITEM_CONDITIONS,
  itemConditionLabel,
} from "@school-student-teacher-management/db/constants/inventory";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Field,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import { Textarea } from "@school-student-teacher-management/ui/components/textarea";
import { IconArrowBack, IconPackageExport } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

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
 */
const RouteComponent = () => {
  const { itemId } = Route.useParams();
  const queryClient = useQueryClient();
  const [isHandBackOpen, setIsHandBackOpen] = useState(false);
  const [handBackNote, setHandBackNote] = useState("");
  const [handBackCondition, setHandBackCondition] = useState<string>("");

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
        toast.success("Handed back to the store");
        setIsHandBackOpen(false);
        setHandBackNote("");
        setHandBackCondition("");
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
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-heading text-2xl font-semibold">
          This item is not one you can act on
        </h1>
        <p className="text-muted-foreground max-w-prose text-sm">
          {formatApiErrorMessage(
            itemQuery.error,
            "You can only scan an item that is available to take, or one you already hold or are in charge of."
          )}
        </p>
        <Link
          to="/account"
          className="border-primary text-primary hover:bg-primary hover:text-primary-foreground inline-block w-fit border px-5 py-2.5 text-xs font-extrabold tracking-[0.04em] transition-colors"
        >
          Back to your account
        </Link>
      </div>
    );
  }

  const item = itemQuery.data;

  if (!item) {
    return null;
  }

  /**
   * The hand-back affordance, as a function with two early returns rather than
   * a nested conditional: whether the reader may hand this back at all
   * (`item.canHandBack`) and whether the form is open are two different
   * questions, and folding them into one expression buried the "may they?"
   * answer under the shape of the form.
   */
  const renderHandBack = () => {
    if (!item.canHandBack) {
      return null;
    }

    if (!isHandBackOpen) {
      return (
        <Button
          type="button"
          variant="outline"
          onClick={() => setIsHandBackOpen(true)}
          data-icon="inline-start"
        >
          <IconArrowBack data-icon="inline-start" />
          Hand this back to the store
        </Button>
      );
    }

    return (
      <div className="border-primary/14 flex flex-col gap-3 border p-4">
        <Field>
          <FieldLabel htmlFor="scan-hand-back-condition">
            Condition (optional)
          </FieldLabel>
          <Select
            value={handBackCondition}
            onValueChange={(value) => setHandBackCondition(value ?? "")}
          >
            <SelectTrigger id="scan-hand-back-condition">
              <SelectValue placeholder="Leave unchanged" />
            </SelectTrigger>
            <SelectContent>
              {ITEM_CONDITIONS.map((condition) => (
                <SelectItem key={condition} value={condition}>
                  {itemConditionLabel(condition)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="scan-hand-back-note">
            Add a note (optional)
          </FieldLabel>
          <Textarea
            id="scan-hand-back-note"
            rows={2}
            value={handBackNote}
            onChange={(event) => setHandBackNote(event.target.value)}
            placeholder="Where it is going back to, or anything the next person should know."
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setIsHandBackOpen(false)}
            disabled={releaseMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() =>
              releaseMutation.mutate({
                itemId: item.id,
                note: handBackNote || undefined,
                condition: (handBackCondition as never) || undefined,
              })
            }
            disabled={releaseMutation.isPending}
          >
            {releaseMutation.isPending ? "Handing back…" : "Confirm hand-back"}
          </Button>
        </div>
      </div>
    );
  };

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
        managerName={item.managerName}
        custodianName={item.custodianName}
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
          type="button"
          onClick={() => takeMutation.mutate({ itemId: item.id })}
          disabled={takeMutation.isPending}
          data-icon="inline-start"
        >
          <IconPackageExport data-icon="inline-start" />
          {takeMutation.isPending ? "Borrowing…" : "Borrow this item"}
        </Button>
      ) : null}

      {renderHandBack()}

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
