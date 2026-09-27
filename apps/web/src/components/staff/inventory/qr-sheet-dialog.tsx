"use client";

import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
import {
  Field,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import { Input } from "@school-student-teacher-management/ui/components/input";
import { useState } from "react";

import type { InventoryItemView } from "@/components/staff/inventory/inventory-types";

export interface QrSheetSelection {
  itemId: string;
  copies: number;
}

/**
 * How many labels to print for each ticked item, asked once up front rather
 * than assumed.
 *
 * A single-unit item (a projector, a laptop) almost always wants one label,
 * so it defaults to one. A bulk-counted item (a run of chairs) is the case
 * this dialog exists for: its `qty` is the school's own count of how many
 * physical units the row stands for, so it is offered as a one-click fill —
 * "20 chairs in stock" becomes "20 numbered labels" without retyping the
 * number the register already knows. The field stays a plain, editable count
 * rather than a from/to range or a per-unit checkbox list, because nothing
 * in this store keeps a persistent identity for an individual chair to tick
 * — the running number stamped on each label ("unit 3 of 20", encoded in the
 * printed code's own `?u=` payload) is generated fresh for this one print
 * job, not read back from a row that remembers it was already printed once.
 */
const QrSheetForm = ({
  items,
  isSubmitting,
  onSubmit,
}: {
  items: InventoryItemView[];
  isSubmitting: boolean;
  onSubmit: (selection: QrSheetSelection[]) => void;
}) => {
  const [copiesByItem, setCopiesByItem] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((item) => [item.id, "1"]))
  );

  const parsedCopies = items.map((item) => {
    const raw = Math.trunc(Number(copiesByItem[item.id] ?? "1"));
    return {
      itemId: item.id,
      copies: Number.isFinite(raw) && raw > 0 ? raw : 0,
    };
  });
  let totalLabels = 0;
  for (const entry of parsedCopies) {
    totalLabels += entry.copies;
  }
  const hasInvalidRow = parsedCopies.some((entry) => entry.copies < 1);

  return (
    <>
      <div className="flex max-h-80 flex-col gap-3 overflow-y-auto pr-1">
        {items.map((item) => (
          <div
            className="border-primary/14 flex items-center justify-between gap-3 border p-3"
            key={item.id}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{item.name}</p>
              <p className="text-muted-foreground font-mono text-xs">
                {item.sku} — {item.qty} in stock
              </p>
            </div>
            <div className="flex items-center gap-2">
              {item.qty > 1 ? (
                <Button
                  onClick={() =>
                    setCopiesByItem((previous) => ({
                      ...previous,
                      [item.id]: String(item.qty),
                    }))
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  All {item.qty}
                </Button>
              ) : null}
              <Field className="w-20">
                <FieldLabel
                  className="sr-only"
                  htmlFor={`qr-copies-${item.id}`}
                >
                  Copies for {item.name}
                </FieldLabel>
                <Input
                  id={`qr-copies-${item.id}`}
                  inputMode="numeric"
                  min={1}
                  onChange={(event) =>
                    setCopiesByItem((previous) => ({
                      ...previous,
                      [item.id]: event.target.value,
                    }))
                  }
                  type="number"
                  value={copiesByItem[item.id] ?? "1"}
                />
              </Field>
            </div>
          </div>
        ))}
      </div>

      <DialogFooter className="items-center sm:justify-between">
        <p className="text-muted-foreground text-xs">
          {totalLabels} label{totalLabels === 1 ? "" : "s"} total
        </p>
        <Button
          disabled={isSubmitting || hasInvalidRow || totalLabels === 0}
          onClick={() => onSubmit(parsedCopies)}
          type="button"
        >
          {isSubmitting ? "Building sheet…" : "Download"}
        </Button>
      </DialogFooter>
    </>
  );
};

export const QrSheetDialog = ({
  open,
  onOpenChange,
  items,
  isSubmitting,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: InventoryItemView[];
  isSubmitting: boolean;
  onSubmit: (selection: QrSheetSelection[]) => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Download QR labels</DialogTitle>
        <DialogDescription>
          Choose how many labels to print for each item. A bulk-counted item can
          print one numbered label per unit in stock.
        </DialogDescription>
      </DialogHeader>
      {/*
        Keyed by the ticked item set, mounted fresh every time the dialog
        opens on a different selection, so each per-item count starts at "1"
        without a `useEffect` or a ref reaching for state during render — the
        count is this component's own initial state, and a new key is what
        makes "initial" mean "just opened" rather than "first ever rendered".
      */}
      <QrSheetForm
        isSubmitting={isSubmitting}
        items={items}
        key={items.map((item) => item.id).join(",")}
        onSubmit={onSubmit}
      />
    </DialogContent>
  </Dialog>
);
