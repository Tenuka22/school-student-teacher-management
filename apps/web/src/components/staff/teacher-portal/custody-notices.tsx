"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@school-student-teacher-management/ui/components/alert-dialog";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Field,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import { Textarea } from "@school-student-teacher-management/ui/components/textarea";
import { IconAlertTriangle, IconCheck } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

interface CustodyNotice {
  asPreviousCustodian: boolean;
  asManager: boolean;
  changedByName: string | null;
  itemName: string;
  itemSku: string;
  currentCustodianName: string | null;
}

/**
 * One sentence per role the caller holds on this notice \u2014 a teacher who is
 * both the previous custodian and the manager sees both, because both are
 * true and each names a different thing that happened to them.
 */
const describeNotice = (notice: CustodyNotice): string[] => {
  const sentences: string[] = [];
  if (notice.asPreviousCustodian) {
    sentences.push(
      `${notice.changedByName ?? "Somebody"} now has ${notice.itemName} (${notice.itemSku}), which you were holding.`
    );
  }
  if (notice.asManager) {
    sentences.push(
      `${notice.itemName} (${notice.itemSku}), which you are in charge of, is now with ${notice.currentCustodianName ?? "nobody"}.`
    );
  }
  return sentences;
};

/**
 * "Something changed and it concerns you" — the surfaced half of
 * `list-custody-notices.ts`. Mounted once, above the three sections, so
 * whichever equipment route the reader is on (`/equipment`,
 * `/equipment/in-charge`, `/equipment/in-hands`, `/equipment/lent-out`) shows
 * the same unread queue rather than three copies that could disagree.
 *
 * Renders nothing while empty, for the same reason `LentOutSection` does:
 * "nothing to tell you" is good news, and a heading with nothing under it
 * reads as broken rather than as reassurance.
 */
export const CustodyNotices = () => {
  const queryClient = useQueryClient();
  const [disputeId, setDisputeId] = useState<string | null>(null);
  const [disputeNote, setDisputeNote] = useState("");

  const noticesQuery = useQuery(
    orpc.inventory.custody.notices.list.queryOptions()
  );

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: orpc.inventory.custody.notices.list.queryOptions().queryKey,
    });
  };

  const acknowledgeMutation = useMutation(
    orpc.inventory.custody.notices.acknowledge.mutationOptions({
      onSuccess: async () => {
        await invalidate();
      },
      onError: (error) => {
        toast.error(
          formatApiErrorMessage(error, "Could not clear this notice")
        );
      },
    })
  );

  const disputeMutation = useMutation(
    orpc.inventory.custody.notices.dispute.mutationOptions({
      onSuccess: async () => {
        toast.success("Flagged — an administrator will look into it");
        setDisputeId(null);
        setDisputeNote("");
        await invalidate();
      },
      onError: (error) => {
        toast.error(formatApiErrorMessage(error, "Could not raise a dispute"));
      },
    })
  );

  const notices = noticesQuery.data?.notices ?? [];

  if (noticesQuery.isPending || notices.length === 0) {
    return null;
  }

  return (
    <section className="border-accent/50 bg-accent/10 flex flex-col gap-3 border p-4">
      <h2 className="font-heading text-lg font-semibold">
        Notices ({notices.length})
      </h2>
      <ul className="flex flex-col gap-2">
        {notices.map((notice) => (
          <li
            key={notice.id}
            className="border-primary/10 bg-card flex flex-col gap-2 border p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 flex-1">
              {describeNotice(notice).map((sentence) => (
                <p key={sentence} className="text-sm">
                  {sentence}
                </p>
              ))}
              {notice.note ? (
                <p className="text-muted-foreground mt-1 text-xs italic">
                  &ldquo;{notice.note}&rdquo;
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={
                  acknowledgeMutation.isPending &&
                  acknowledgeMutation.variables?.id === notice.id
                }
                onClick={() => acknowledgeMutation.mutate({ id: notice.id })}
                data-icon="inline-start"
              >
                <IconCheck data-icon="inline-start" />
                Acknowledge
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setDisputeId(notice.id)}
                data-icon="inline-start"
              >
                <IconAlertTriangle data-icon="inline-start" />
                This never happened
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <AlertDialog
        open={disputeId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDisputeId(null);
            setDisputeNote("");
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogTitle>Flag this record</AlertDialogTitle>
          <Field>
            <FieldLabel htmlFor="dispute-note">
              Say what is wrong with it
            </FieldLabel>
            <Textarea
              id="dispute-note"
              rows={3}
              value={disputeNote}
              onChange={(event) => setDisputeNote(event.target.value)}
              placeholder="I was never handed this item, or I never gave it to anyone."
            />
          </Field>
          <p className="text-muted-foreground text-xs">
            This does not undo the change on its own — it flags the record for
            an administrator to look into and correct.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                disputeNote.trim().length === 0 || disputeMutation.isPending
              }
              onClick={() => {
                if (disputeId) {
                  disputeMutation.mutate({
                    id: disputeId,
                    note: disputeNote.trim(),
                  });
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disputeMutation.isPending ? "Flagging…" : "Flag it"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};
