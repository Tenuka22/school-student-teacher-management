import { isSeededAccount } from "@school-student-teacher-management/auth/roles";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@school-student-teacher-management/ui/components/table";
import { useState } from "react";

import { ConfirmDialog } from "@/components/ui-patterns/confirm-dialog";
import { PageHeader } from "@/components/ui-patterns/page-header";

import { BanUserDialog } from "./ban-user-dialog";
import type { BanTarget } from "./ban-user-dialog";
import { PurgeUnverifiedDialog } from "./purge-unverified-dialog";
import { ROLES, ROLE_LABELS, toRole, useAdminUsers } from "./use-admin-users";
import type { AdminUserRow, Role } from "./use-admin-users";

const LOADING_ROWS = ["a", "b", "c", "d"];

const formatWhen = (value: Date | string | undefined): string => {
  if (!value) {
    return "—";
  }

  const date = typeof value === "string" ? new Date(value) : value;

  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
};

/**
 * The ban control for one row.
 *
 * The three institutional logins are not bannable at all: their credentials
 * come from server configuration and are re-applied on every start, so a ban
 * would either be undone or would lock the College out of its own system. The
 * server refuses it too (the `databaseHooks` in `packages/auth`), so this is
 * the visible half of one rule rather than the whole of it.
 */
const BanCell = ({
  isPending,
  onSelect,
  user,
}: {
  isPending: boolean;
  onSelect: (banned: boolean) => void;
  user: AdminUserRow;
}) => {
  if (isSeededAccount(user.username)) {
    return (
      <span
        className="text-muted-foreground text-sm font-medium"
        title="Institutional login — managed by the College environment"
      >
        Protected
      </span>
    );
  }

  if (user.banned) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => onSelect(false)}
        aria-label={`Unban ${user.name}`}
      >
        Unban
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => onSelect(true)}
      aria-label={`Ban ${user.name}`}
      className="border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive"
    >
      Ban
    </Button>
  );
};

/**
 * Picking a role only *proposes* it: the page asks for confirmation before
 * the existing mutation runs, so the control keeps showing the current role
 * until the change is confirmed and saved.
 */
const RoleSelect = ({
  user,
  isPending,
  onPropose,
}: {
  user: AdminUserRow;
  isPending: boolean;
  onPropose: (role: Role) => void;
}) => {
  const current = toRole(user.role);

  return (
    <Select
      value={current}
      onValueChange={(next) => {
        const role = toRole(next);
        if (role !== current) {
          onPropose(role);
        }
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label={`Role for ${user.name}`}
        disabled={isPending}
        className="min-w-36"
      >
        <SelectValue>
          {(value: string | null) => ROLE_LABELS[toRole(value)]}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {ROLES.map((option) => (
          <SelectItem key={option} value={option}>
            {ROLE_LABELS[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const getStaleSummary = (count: number, retentionDays: number): string => {
  if (count === 0) {
    return `No account is waiting on its email confirmation. Accounts that never confirm are removed automatically after ${retentionDays} days.`;
  }

  const subject = count === 1 ? "account has" : "accounts have";

  return `${count} ${subject} gone ${retentionDays}+ days without confirming an address.`;
};

const UsersTable = ({
  users,
  isBanPending,
  isRolePending,
  onBan,
  onProposeRole,
}: {
  users: AdminUserRow[];
  isBanPending: boolean;
  isRolePending: boolean;
  onBan: (user: AdminUserRow, banned: boolean) => void;
  onProposeRole: (user: AdminUserRow, role: Role) => void;
}) => (
  <div className="border-border bg-card border">
    <Table className="min-w-180">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Name</TableHead>
          <TableHead>Username</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell className="py-3">
              <span className="text-foreground block font-semibold">
                {user.name}
              </span>
              <span className="text-muted-foreground block text-sm">
                {user.email}
                {user.emailVerified === false && (
                  <span className="text-destructive ml-2">
                    email not confirmed
                  </span>
                )}
              </span>
            </TableCell>
            <TableCell className="text-foreground/80 font-mono text-sm">
              {user.username ?? "—"}
            </TableCell>
            <TableCell className="text-muted-foreground text-xs">
              {formatWhen(user.createdAt)}
            </TableCell>
            <TableCell>
              <RoleSelect
                user={user}
                isPending={isRolePending}
                onPropose={(role) => onProposeRole(user, role)}
              />
            </TableCell>
            <TableCell>
              <BanCell
                isPending={isBanPending}
                onSelect={(banned) => onBan(user, banned)}
                user={user}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

interface RoleChange {
  user: AdminUserRow;
  from: Role;
  to: Role;
}

/**
 * User administration, backed by Better Auth's admin plugin.
 *
 * Role changes here are the counterpart to the position-driven promotion in
 * `assignPosition`: granting `admin` opens the admin workspace, while
 * leadership review authority still comes from a `staff_position` row.
 */
export const AdminUsersContent = () => {
  const {
    users,
    isLoadingUsers,
    setRoleMutation,
    banDialog,
    setBanDialog,
    banMutation,
    isPurgeOpen,
    setIsPurgeOpen,
    purgePreview,
    isLoadingPurgePreview,
    purgeMutation,
  } = useAdminUsers();
  const [roleChange, setRoleChange] = useState<RoleChange | null>(null);

  const staleCount = purgePreview?.count ?? 0;
  const retentionDays = purgePreview?.retentionDays ?? 7;

  const openBanDialog = (target: AdminUserRow, banned: boolean) =>
    setBanDialog({ target: target as BanTarget, banned });

  const confirmRoleChange = () => {
    if (!roleChange) {
      return;
    }
    // The same call the select used to make directly; only the timing moved.
    setRoleMutation.mutate(
      { userId: roleChange.user.id, role: roleChange.to },
      { onSettled: () => setRoleChange(null) }
    );
  };

  return (
    <div className="flex flex-col gap-4.5">
      <PageHeader
        eyebrow="Administration"
        title="Users"
        description="Every account that can sign in. The role decides which workspace someone lands in; leadership review authority comes from their position assignment, not from here."
      />

      <section
        aria-labelledby="unverified-heading"
        className="border-border bg-card flex flex-wrap items-center justify-between gap-4 border px-5.5 py-4"
      >
        <div>
          <h2
            id="unverified-heading"
            className="text-foreground type-section-title m-0"
          >
            Unverified accounts
          </h2>
          <p className="text-muted-foreground mt-1 max-w-prose text-sm">
            {getStaleSummary(staleCount, retentionDays)}
          </p>
        </div>
        <Button
          variant="outline"
          className="border-destructive/60 text-destructive hover:bg-destructive hover:text-destructive-foreground shrink-0 text-sm font-semibold"
          disabled={purgeMutation.isPending || isLoadingPurgePreview}
          onClick={() => setIsPurgeOpen(true)}
        >
          {staleCount === 0 ? "Check for stale accounts" : "Clean up now"}
        </Button>
      </section>

      {isLoadingUsers && (
        <div className="space-y-2" aria-busy="true">
          <span className="sr-only">Loading users…</span>
          {LOADING_ROWS.map((row) => (
            <Skeleton key={row} className="h-14 w-full" />
          ))}
        </div>
      )}

      {!isLoadingUsers && users.length === 0 && (
        <Empty className="border-border border border-dashed">
          <EmptyTitle>No accounts yet</EmptyTitle>
          <EmptyDescription>
            Accounts appear here once someone registers or is added by an
            administrator.
          </EmptyDescription>
        </Empty>
      )}

      {users.length > 0 && (
        <UsersTable
          isBanPending={banMutation.isPending}
          isRolePending={setRoleMutation.isPending}
          onBan={openBanDialog}
          onProposeRole={(user, role) =>
            setRoleChange({ user, from: toRole(user.role), to: role })
          }
          users={users}
        />
      )}

      <ConfirmDialog
        open={roleChange !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRoleChange(null);
          }
        }}
        title={
          roleChange ? `Change ${roleChange.user.name}'s role?` : "Change role?"
        }
        description={
          roleChange ? (
            <>
              From <strong>{ROLE_LABELS[roleChange.from]}</strong> to{" "}
              <strong>{ROLE_LABELS[roleChange.to]}</strong>. This changes the
              workspace they land in and what they can open the next time they
              use the system.
            </>
          ) : null
        }
        confirmLabel="Change role"
        pendingLabel="Changing role…"
        isPending={setRoleMutation.isPending}
        onConfirm={confirmRoleChange}
      />

      <BanUserDialog
        isPending={banMutation.isPending}
        isUnban={banDialog?.banned === false}
        key={banDialog?.target.id ?? "closed"}
        onConfirm={(input) => banMutation.mutate(input)}
        onOpenChange={(open) => {
          if (!open) {
            setBanDialog(null);
          }
        }}
        target={banDialog?.target ?? null}
      />

      <PurgeUnverifiedDialog
        accounts={purgePreview?.accounts ?? []}
        isPending={purgeMutation.isPending}
        onConfirm={() => purgeMutation.mutate()}
        onOpenChange={setIsPurgeOpen}
        open={isPurgeOpen}
        retentionDays={retentionDays}
      />
    </div>
  );
};
