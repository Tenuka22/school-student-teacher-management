import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { useListSearchWriter } from "@/components/ui-patterns/data-table/use-list-search-writer";
import { PageHeader } from "@/components/ui-patterns/page-header";
import { orpc } from "@/utils/orpc";

import { ApproveTeacherDialog } from "./approve-teacher-dialog";
import type { TeacherRequest } from "./approve-teacher-dialog";
import { TeacherRequestsDataTable } from "./teacher-requests-data-table";
import {
  toTeacherRequestsSearchParams,
  validateTeacherRequestsSearch,
} from "./teacher-requests-search";
import type { TeacherRequestsSearch } from "./teacher-requests-search";

/**
 * People waiting on a staffing decision. The Principal and the administrator
 * approve; the server enforces that (`approveTeacherRequest` rejects anyone
 * else), so this view is only a convenience, never the gate. Approving opens
 * a review dialog first — see `ApproveTeacherDialog`.
 *
 * ## Why this is a table and not two lists
 *
 * It used to be two hand-rolled sections — "Ready to review" above, "Awaiting
 * email verification" below — each row its own `<li>` with a button. The split
 * named one of the four reasons the server refuses, so the other three sat in
 * the "ready" pile with a button that always failed, and neither section could
 * be searched, sorted or filtered. One list with a status column and a status
 * filter answers the same question in one screenful, and the reason a row cannot
 * be acted on is on the row.
 *
 * `search` is the route's validated query string, handed down rather than read
 * here: the route owns the URL contract (`teacher-requests-search.ts`) and this
 * component must not import the route file, because the route imports this one.
 * Every write goes back out through `useListSearchWriter`, which navigates — one
 * copy of the queue's view state, in the URL, and no second one here.
 */
export const TeacherRequestsContent = ({
  search,
}: {
  search: TeacherRequestsSearch;
}) => {
  const queryClient = useQueryClient();
  const [reviewing, setReviewing] = useState<TeacherRequest | null>(null);

  const write = useListSearchWriter(
    validateTeacherRequestsSearch,
    toTeacherRequestsSearchParams
  );

  const requestsQuery = useQuery(orpc.staff.listTeacherRequests.queryOptions());

  const approveMutation = useMutation(
    orpc.staff.approveTeacherRequest.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        setReviewing(null);
        toast.success("Approved — they are now a teacher");
      },
      onError: (error: Error) => {
        toast.error(error.message);
      },
    })
  );

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHeader
        eyebrow="Leadership"
        title="Teacher requests"
        description={
          <>
            Accounts that asked for staff access. Check the person is on the
            College establishment, then approve — that grants the{" "}
            <strong>teacher</strong> role.
          </>
        }
      />

      <TeacherRequestsDataTable
        isApproving={approveMutation.isPending}
        isError={requestsQuery.isError}
        isFetching={requestsQuery.isFetching}
        isLoading={requestsQuery.isPending}
        onRetry={() => {
          void requestsQuery.refetch();
        }}
        onReview={setReviewing}
        onSearchChange={(patch) => {
          write(patch);
        }}
        requests={requestsQuery.data}
        search={search}
      />

      <ApproveTeacherDialog
        isPending={approveMutation.isPending}
        onApprove={(userId) => approveMutation.mutate({ userId })}
        onOpenChange={(open) => {
          if (!open) {
            setReviewing(null);
          }
        }}
        request={reviewing}
      />
    </div>
  );
};
