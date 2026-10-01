"use client";

/**
 * The stock quick actions: "Receive stock" and "Remove from stock", the two
 * counter movements that belong to no lifecycle.
 *
 * Transfers, Disposals and the Asset register each used to share one "Stock
 * movements" mega-page — one heading, one "Records" tab, three lifecycle tabs
 * stacked under it, and the two Ledgers tables at the foot of all three. A
 * reader who opened any one of them got the other two whether they asked for
 * it or not, and the sidebar's three separate links ("Transfers", "Disposals",
 * an asset register of its own) all landed on the same crowded screen with a
 * different tab pre-selected. `inventory-page.tsx` now gives each of those
 * three sidebar links — plus the Ledgers view — its own real page, built like
 * the Register pane is: one heading, one description, the one panel that
 * belongs to it.
 *
 * What is still shared is this: `stockIn` and `stockOut` both change
 * `inventoryItem.qty` directly, with no queue and no signature, and neither
 * belongs to any one lifecycle — which is why this used to be dropped into
 * Transfers, Disposals and the Asset register's own headers alike. **It no
 * longer is.** Editing an item's own quantity is the Register page's job, not
 * a record page's, so `RegisterPaneHeader` in `inventory-page.tsx` builds its
 * own copy of the same two buttons rather than reaching for this component.
 * `DisposalsPane` is the one caller left here, kept because a clerk
 * raising a write-off is frequently the same clerk who just found the count
 * was wrong and needs to correct it before or after raising the certificate.
 * Transfers and the Asset register do not offer it at all any more.
 *
 * **The second button is "Remove from stock", not "Write off stock".** The
 * Disposals page is a two-stage certificate that a principal has to sign — a
 * clerk destroying a projector was pressing a primary button labelled with the
 * same word as the request queue one page away, and the irreversible
 * single-call route was the one wearing the primary style. The description
 * under the pair says which needs no approval, because "no approval" is the
 * whole difference between them and a verb is not enough to convey it.
 */
import { Button } from "@school-student-teacher-management/ui/components/button";
import { IconPackage, IconPackageOff } from "@tabler/icons-react";
import { useState } from "react";

import {
  StockInDialog,
  StockOutDialog,
} from "@/components/staff/inventory/stock-dialogs";

export interface StockQuickActionsProps {
  /**
   * Lifted out rather than kept as private state, so `DisposalsPane` — this
   * component's one remaining caller — can decide when the dialog opens
   * instead of this component deciding for it.
   */
  isStockInOpen: boolean;
  onStockInOpenChange: (open: boolean) => void;
}

export const StockQuickActions: React.FC<StockQuickActionsProps> = ({
  isStockInOpen,
  onStockInOpenChange,
}) => {
  const [isStockOutOpen, setIsStockOutOpen] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => onStockInOpenChange(true)}
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
        <span className="font-medium">Disposals</span> page instead, which waits
        for a second signature before any stock moves.
      </p>

      <StockInDialog open={isStockInOpen} onOpenChange={onStockInOpenChange} />
      <StockOutDialog open={isStockOutOpen} onOpenChange={setIsStockOutOpen} />
    </div>
  );
};
