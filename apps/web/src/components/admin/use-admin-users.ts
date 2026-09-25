import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

import type { BanTarget } from "./ban-user-dialog";

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  username?: string | null;
  role?: string | null;
  banned?: boolean | null;
  banReason?: string | null;
  emailVerified?: boolean | null;
  createdAt: Date | string;
}

/** Which ban dialog is open: none, ban, or unban. */
export type BanDialogState = { target: BanTarget; banned: boolean } | null;

const USERS_QUERY_KEY = ["auth", "admin", "list-users"];

/**
 * How many accounts one page of the table holds.
 *
 * This used to be a bare `limit: 200` with no `total` and no paging, so a
 * College with more than 200 accounts saw a list that silently stopped and a
 * heading that claimed it was "every account that can sign in".
 */
export const USERS_PAGE_SIZE = 50;

/**
 * Data and mutations for the users page.
 *
 * Kept out of the component so the markup reads as markup: five queries and
 * mutations in one render function is how a table turns into a maze, and the
 * cognitive-complexity budget is better spent on what the page shows.
 *
 * Roles are deliberately read-only here. A role promotes someone into a
 * workspace, but the checks that belong with that — a verified address, a staff
 * record, a category, an employment status — are the approval service's job
 * (`teacher-requests.ts`), and leadership review authority comes from a
 * `staff_position` row rather than from this table.
 */
export const useAdminUsers = () => {
  const queryClient = useQueryClient();
  const [banDialog, setBanDialog] = useState<BanDialogState>(null);
  const [isPurgeOpen, setIsPurgeOpen] = useState(false);
  const [page, setPage] = useState(0);

  const usersQuery = useQuery({
    queryKey: [...USERS_QUERY_KEY, page],
    queryFn: async () => {
      const { data } = await authClient.admin.listUsers({
        query: {
          limit: USERS_PAGE_SIZE,
          offset: page * USERS_PAGE_SIZE,
          sortBy: "createdAt",
          sortDirection: "asc",
        },
      });

      return {
        users: (data?.users ?? []) as unknown as AdminUserRow[],
        total: data?.total ?? 0,
      };
    },
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
  };

  const banMutation = useMutation({
    mutationFn: async ({
      userId,
      banned,
      reason,
    }: {
      userId: string;
      banned: boolean;
      reason: string;
    }) => {
      const { error } = banned
        ? await authClient.admin.banUser({ userId, banReason: reason })
        : await authClient.admin.unbanUser({ userId });
      if (error) {
        throw new Error(error.message ?? "Failed to update user");
      }
    },
    onSuccess: async (_, variables) => {
      await invalidate();
      setBanDialog(null);
      toast.success(variables.banned ? "Account banned" : "Account unbanned");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const purgePreviewQuery = useQuery(
    orpc.staff.previewUnverifiedPurge.queryOptions()
  );

  /**
   * Re-read the purge preview at the moment of the decision, so the count in
   * the dialog describes the accounts about to be deleted rather than whatever
   * was true when the page loaded.
   */
  const openPurgeDialog = () => {
    setIsPurgeOpen(true);
    void purgePreviewQuery.refetch();
  };

  const purgeMutation = useMutation(
    orpc.staff.purgeUnverified.mutationOptions({
      onSuccess: async (result) => {
        await Promise.all([invalidate(), purgePreviewQuery.refetch()]);
        setIsPurgeOpen(false);
        toast.success(
          `Removed ${result.removed} unverified account${result.removed === 1 ? "" : "s"}`
        );
      },
      onError: (error: Error) => {
        toast.error(error.message);
      },
    })
  );

  const total = usersQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));

  return {
    users: usersQuery.data?.users ?? [],
    totalUsers: total,
    page,
    pageCount,
    goToPage: setPage,
    isLoadingUsers: usersQuery.isPending,
    isErrorUsers: usersQuery.isError,
    errorUsers: usersQuery.error as Error | null,
    refetchUsers: usersQuery.refetch,
    banDialog,
    setBanDialog,
    banMutation,
    isPurgeOpen,
    setIsPurgeOpen,
    openPurgeDialog,
    purgePreview: purgePreviewQuery.data,
    isLoadingPurgePreview: purgePreviewQuery.isPending,
    purgeMutation,
  };
};
