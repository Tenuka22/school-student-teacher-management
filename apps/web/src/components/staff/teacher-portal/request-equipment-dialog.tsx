"use client";

import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import { Input } from "@school-student-teacher-management/ui/components/input";
import { Textarea } from "@school-student-teacher-management/ui/components/textarea";
import { IconLoader2, IconQrcode, IconSearch } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";

import type { RequestableItemView } from "@/components/staff/inventory/inventory-types";
import { QrScanDialog } from "@/components/staff/teacher-portal/qr-scan-dialog";
import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

/** One item a teacher could ask a colleague for, as a selectable row. */
const RequestableRow = ({
  item,
  isSelected,
  onSelect,
}: {
  item: RequestableItemView;
  isSelected: boolean;
  onSelect: () => void;
}) => (
  <li>
    <button
      aria-pressed={isSelected}
      className={`flex w-full flex-col items-start gap-0.5 border-b px-3 py-2.5 text-left last:border-b-0 ${
        isSelected ? "bg-primary/8" : "hover:bg-muted"
      }`}
      onClick={onSelect}
      type="button"
    >
      <span className="text-sm font-medium">{item.name}</span>
      <span className="text-muted-foreground font-mono text-xs">
        {item.sku}
      </span>
      <span className="text-muted-foreground text-xs">
        Held by {item.custodianName}
      </span>
    </button>
  </li>
);

interface RequestEquipmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Get equipment": search what a colleague already holds, pick one, ask for
 * it. Submitting raises a `custody.requests.create` row and nothing moves
 * until the holder approves it on their own dashboard — see
 * `decide-custody-request.ts` for why approving *is* the transfer.
 */
export const RequestEquipmentDialog = ({
  open,
  onOpenChange,
}: RequestEquipmentDialogProps) => {
  const searchFieldId = useId();
  const noteFieldId = useId();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [isScanOpen, setIsScanOpen] = useState(false);

  const itemsQuery = useQuery({
    ...orpc.inventory.custody.requests.listRequestable.queryOptions({
      input: { search: search.trim() || undefined },
    }),
    enabled: open,
  });
  const items = itemsQuery.data?.items ?? [];
  const selectedItem = items.find((item) => item.id === selectedItemId);

  const createMutation = useMutation(
    orpc.inventory.custody.requests.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.inventory.custody.requests.listOutgoing.queryOptions({
            input: {},
          }).queryKey,
        });
        toast.success("Request sent — you'll be notified when it's decided");
        setSearch("");
        setSelectedItemId(null);
        setNote("");
        onOpenChange(false);
      },
      onError: (error) => {
        toast.error(formatApiErrorMessage(error, "Could not send the request"));
      },
    })
  );

  const handleSubmit = () => {
    if (!selectedItemId) {
      return;
    }
    createMutation.mutate({
      itemId: selectedItemId as never,
      note: note.trim() || undefined,
    });
  };

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          setSearch("");
          setSelectedItemId(null);
          setNote("");
        }
        onOpenChange(next);
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Get equipment</DialogTitle>
          <DialogDescription>
            Ask a colleague for something they&apos;re holding. They&apos;ll see
            your request the moment you send it and can approve or deny it from
            their own dashboard.
          </DialogDescription>
        </DialogHeader>

        <Button
          className="w-fit"
          data-icon="inline-start"
          onClick={() => setIsScanOpen(true)}
          type="button"
          variant="outline"
        >
          <IconQrcode data-icon="inline-start" />
          Scan the item&apos;s QR code instead
        </Button>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={searchFieldId}>Search equipment</FieldLabel>
            <div className="relative">
              <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                className="pl-8"
                id={searchFieldId}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Projector, laptop, tripod…"
                value={search}
              />
            </div>
          </Field>

          <div className="max-h-56 overflow-y-auto rounded-none border">
            {itemsQuery.isPending && (
              <p className="text-muted-foreground p-3 text-sm">Loading…</p>
            )}
            {itemsQuery.isSuccess && items.length === 0 && (
              <p className="text-muted-foreground p-3 text-sm">
                {search
                  ? "No matching equipment is held by anyone right now."
                  : "Nobody is currently holding requestable equipment."}
              </p>
            )}
            {items.length > 0 && (
              <ul>
                {items.map((item) => (
                  <RequestableRow
                    isSelected={item.id === selectedItemId}
                    item={item}
                    key={item.id}
                    onSelect={() => setSelectedItemId(item.id)}
                  />
                ))}
              </ul>
            )}
          </div>

          <Field>
            <FieldLabel htmlFor={noteFieldId}>
              Note to {selectedItem?.custodianName ?? "the holder"} (optional)
            </FieldLabel>
            <Textarea
              id={noteFieldId}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Need it for period 3 on Thursday"
              value={note}
            />
          </Field>
        </FieldGroup>

        <Button
          className="mt-2 w-full"
          disabled={!selectedItemId || createMutation.isPending}
          onClick={handleSubmit}
        >
          {createMutation.isPending && <IconLoader2 className="animate-spin" />}
          Send request
        </Button>
      </DialogContent>

      <QrScanDialog onOpenChange={setIsScanOpen} open={isScanOpen} />
    </Dialog>
  );
};
