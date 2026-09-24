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

export const ROLES = [
  "admin",
  "principal",
  "vicePrincipal",
  "teacher",
  "user",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  principal: "Principal",
  vicePrincipal: "Deputy Principal",
  teacher: "Teacher",
  user: "User",
};

/** Narrows a stored or form value to a known role, defaulting to `user`. */
export const toRole = (value: string | null | undefined): Role =>
  ROLES.includes(value as Role) ? (value as Role) : "user";

/** Which ban dialog is open: none, ban, or unban. */
export type BanDialogState = { target: BanTarget; banned: boolean } | null;

const USERS_QUERY_KEY = ["auth", "admin", "list-users"];

/**
 * Data and mutations for the users page.
 *
 * Kept out of the component so the markup reads as markup: five queries and
 * mutations in one render function is how a table turns into a maze, and the
 * cognitive-complexity budget is better spent on what the page shows.
 */
export const useAdminUsers = () => {
  const queryClient = useQueryClient();
  const [banDialog, setBanDialog] = useState<BanDialogState>(null);
  const [isPurgeOpen, setIsPurgeOpen] = useState(false);

  const usersQuery = useQuery({
    queryKey: USERS_QUERY_KEY,
    queryFn: async () => {
      const { data } = await authClient.admin.listUsers({
        query: { limit: 200, sortBy: "createdAt", sortDirection: "asc" },
      });
      return (data?.users ?? []) as unknown as AdminUserRow[];
    },
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
  };

  // The admin plugin's client type only knows Better Auth's built-in roles,
  // because the configured role set lives on the server. `teacher` is a real
  // role here, so the value is narrowed rather than dropped from the UI.
  const setRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Role }) => {
      const { error } = await authClient.admin.setRole({
        userId,
        role: role as "admin" | "user",
      });
      if (error) {
        throw new Error(error.message ?? "Failed to change role");
      }
    },
    onSuccess: async () => {
      await invalidate();
      toast.success("Role updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

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

  const purgePreviewQuery = useQuery({
    ...orpc.staff.previewUnverifiedPurge.queryOptions(),
    // Re-read on open rather than keeping a stale count, so the list in the
    // dialog is current at the moment of the decision.
    enabled: !isPurgeOpen,
  });

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

  return {
    users: usersQuery.data ?? [],
    isLoadingUsers: usersQuery.isPending,
    setRoleMutation,
    banDialog,
    setBanDialog,
    banMutation,
    isPurgeOpen,
    setIsPurgeOpen,
    purgePreview: purgePreviewQuery.data,
    isLoadingPurgePreview: purgePreviewQuery.isPending,
    purgeMutation,
  };
};
