"use client";

import {
  Card,
  CardContent,
} from "@school-student-teacher-management/ui/components/card";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import { IconBriefcase2 } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";

import { orpc } from "@/utils/orpc";

/** One count, its label, and where clicking it goes. */
const EquipmentStat = ({
  count,
  label,
  href,
}: {
  count: number;
  label: string;
  href: string;
}) => (
  <Link
    className="hover:bg-muted flex flex-1 flex-col items-start gap-1 border-l px-4 py-2 first:border-l-0 first:pl-0"
    to={href as never}
  >
    <span className="text-2xl font-semibold tabular-nums">{count}</span>
    <span className="text-muted-foreground text-xs">{label}</span>
  </Link>
);

/**
 * The three counts `my-equipment.tsx` already splits its page into — In
 * Charge, In My Hands, Lent Out — read the same way that page reads them
 * (`custody.myItems` filtered by `managerStaffId`/`custodianStaffId`, plus
 * `custody.lent`) so the dashboard number and the equipment page's own
 * sections can never disagree.
 */
export const EquipmentSummaryCard = () => {
  const { year } = useParams({ from: "/_auth/teacher/$year" });

  const myItemsQuery = useQuery(
    orpc.inventory.custody.myItems.queryOptions({ input: {} })
  );
  const lentQuery = useQuery(
    orpc.inventory.custody.lent.queryOptions({ input: {} })
  );

  if (myItemsQuery.isPending || lentQuery.isPending) {
    return (
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const items = myItemsQuery.data?.items ?? [];
  const staffId = myItemsQuery.data?.staffId ?? null;
  const inCharge = items.filter((item) => item.managerStaffId === staffId);
  const inHands = items.filter(
    (item) =>
      item.custodianStaffId === staffId && item.managerStaffId !== staffId
  );
  const lentOut = lentQuery.data?.items ?? [];

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <IconBriefcase2 className="text-muted-foreground size-5" />
          <h2 className="font-semibold">My Equipment</h2>
        </div>
        <div className="flex">
          <EquipmentStat
            count={inCharge.length}
            href={`/teacher/${year}/equipment/in-charge`}
            label="Owned"
          />
          <EquipmentStat
            count={inHands.length}
            href={`/teacher/${year}/equipment/in-hands`}
            label="In my hands"
          />
          <EquipmentStat
            count={lentOut.length}
            href={`/teacher/${year}/equipment/lent-out`}
            label="Lent out"
          />
        </div>
      </CardContent>
    </Card>
  );
};
