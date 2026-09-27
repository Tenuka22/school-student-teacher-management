"use client";

import { Button } from "@school-student-teacher-management/ui/components/button";
import { IconPackage, IconX } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { HoldToConfirmButton } from "@/components/staff/teacher-portal/hold-to-confirm-button";
import { useCustodyRequestEvents } from "@/hooks/use-custody-request-events";
import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

/**
 * The teacher dashboard's live "somebody wants this" banner: a compact pill
 * that appears the instant a colleague requests something the caller is
 * holding, and stays up for as long as a request is waiting on a decision.
 *
 * The oldest pending request leads — the same "earliest first" queue
 * discipline `listDisposals` uses — and a second or third request collapses
 * into a "+N more" count rather than stacking banners, so the dashboard never
 * grows a wall of pills. Deciding the lead request reveals the next one.
 *
 * Approving is a `HoldToConfirmButton`: it hands a colleague's equipment to
 * somebody else, arriving unannounced as a push notification, and must never
 * fire from a stray tap. Denying carries no such risk and is one ordinary
 * click.
 */
export const CustodyRequestBanner = () => {
  const queryClient = useQueryClient();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const incomingQuery = useQuery(
    orpc.inventory.custody.requests.listIncoming.queryOptions({ input: {} })
  );

  // The live channel: every event refreshes `listIncoming` above, so the
  // banner's own queue is always the query's data — this hook exists to
  // trigger that refresh promptly and to pop a toast for the arrival itself,
  // not to hold a second copy of the queue.
  useCustodyRequestEvents((event) => {
    if (event.type === "requested") {
      toast.info(`${event.requesterName} is asking for ${event.itemName}`, {
        description: event.note ?? undefined,
      });
    }
  });

  const decideMutation = useMutation(
    orpc.inventory.custody.requests.decide.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries({
          queryKey: orpc.inventory.custody.requests.listIncoming.queryOptions({
            input: {},
          }).queryKey,
        });
        toast.success(
          result.status === "approved"
            ? "Approved — the item is now theirs"
            : "Request denied"
        );
      },
      onError: (error) => {
        toast.error(
          formatApiErrorMessage(error, "Could not record your decision")
        );
      },
    })
  );

  const pending = (incomingQuery.data?.requests ?? []).filter(
    (request) => !dismissedIds.has(request.id)
  );

  if (pending.length === 0) {
    return null;
  }

  const [lead, ...rest] = pending;

  return (
    <div className="animate-in fade-in-0 slide-in-from-top-3 border-primary bg-card ring-primary/15 relative flex flex-wrap items-center gap-4 border-l-4 p-4 shadow-sm ring-1 duration-300">
      <IconPackage className="text-primary size-8 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {lead.requesterName} wants to borrow {lead.itemName}
        </p>
        {lead.note && (
          <p className="text-muted-foreground mt-0.5 truncate text-sm">
            &ldquo;{lead.note}&rdquo;
          </p>
        )}
        {rest.length > 0 && (
          <p className="text-muted-foreground mt-1 text-xs">
            +{rest.length} more request{rest.length === 1 ? "" : "s"} waiting
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          disabled={decideMutation.isPending}
          onClick={() =>
            decideMutation.mutate({
              requestId: lead.id as never,
              decision: "denied",
            })
          }
          variant="outline"
        >
          Deny
        </Button>
        <HoldToConfirmButton
          disabled={decideMutation.isPending}
          holdingLabel="Keep holding to approve…"
          label="Hold to approve"
          onConfirm={() =>
            decideMutation.mutate({
              requestId: lead.id as never,
              decision: "approved",
            })
          }
        />
        <button
          aria-label="Dismiss for now"
          className="text-muted-foreground hover:text-foreground p-1"
          onClick={() =>
            setDismissedIds((previous) => new Set(previous).add(lead.id))
          }
          type="button"
        >
          <IconX className="size-4" />
        </button>
      </div>
    </div>
  );
};
