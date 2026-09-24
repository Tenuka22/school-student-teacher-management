import { isSeededAccount } from "@school-student-teacher-management/auth/roles";

import { BanUserDialog } from "./ban-user-dialog";
import type { BanTarget } from "./ban-user-dialog";
import { PurgeUnverifiedDialog } from "./purge-unverified-dialog";
import { ROLES, ROLE_LABELS, toRole, useAdminUsers } from "./use-admin-users";
import type { AdminUserRow, Role } from "./use-admin-users";

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
        className="text-xs font-bold text-[#013405]/45"
        title="Institutional login — managed by the College environment"
      >
        Protected
      </span>
    );
  }

  if (user.banned) {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={() => onSelect(false)}
        className="border border-[#013405]/30 px-3 py-1.5 text-xs font-bold text-[#013405] transition-colors hover:border-[#013405]"
      >
        Unban
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => onSelect(true)}
      className="border border-[#A51919]/40 px-3 py-1.5 text-xs font-bold text-[#A51919] transition-colors hover:border-[#A51919]"
    >
      Ban
    </button>
  );
};

const RoleSelect = ({
  isPending,
  onChange,
  role,
}: {
  isPending: boolean;
  onChange: (role: Role) => void;
  role: string | null | undefined;
}) => (
  <select
    className="border border-[#013405]/22 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#013405]"
    disabled={isPending}
    onChange={(event) => onChange(toRole(event.target.value))}
    value={toRole(role)}
  >
    {ROLES.map((option) => (
      <option key={option} value={option}>
        {ROLE_LABELS[option]}
      </option>
    ))}
  </select>
);

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
  onRole,
}: {
  users: AdminUserRow[];
  isBanPending: boolean;
  isRolePending: boolean;
  onBan: (user: AdminUserRow, banned: boolean) => void;
  onRole: (userId: string, role: Role) => void;
}) => (
  <div className="overflow-x-auto border border-[#013405]/14 bg-[#fffdf6]">
    <table className="w-full min-w-[720px] text-left text-sm">
      <thead>
        <tr className="border-b border-[#013405]/14">
          <th className="px-4 py-3 text-xs font-extrabold tracking-[0.12em] text-[#013405]/60">
            NAME
          </th>
          <th className="px-4 py-3 text-xs font-extrabold tracking-[0.12em] text-[#013405]/60">
            USERNAME
          </th>
          <th className="px-4 py-3 text-xs font-extrabold tracking-[0.12em] text-[#013405]/60">
            CREATED
          </th>
          <th className="px-4 py-3 text-xs font-extrabold tracking-[0.12em] text-[#013405]/60">
            ROLE
          </th>
          <th className="px-4 py-3 text-xs font-extrabold tracking-[0.12em] text-[#013405]/60">
            STATUS
          </th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <tr
            className="border-b border-[#013405]/8 last:border-b-0"
            key={user.id}
          >
            <td className="px-4 py-3">
              <span className="block font-bold text-[#013405]">
                {user.name}
              </span>
              <span className="block text-xs text-[#013405]/55">
                {user.email}
                {user.emailVerified === false && (
                  <span className="ml-2 text-[#A51919]">
                    email not confirmed
                  </span>
                )}
              </span>
            </td>
            <td className="px-4 py-3 font-mono text-xs text-[#013405]/70">
              {user.username ?? "—"}
            </td>
            <td className="px-4 py-3 text-xs text-[#013405]/60">
              {formatWhen(user.createdAt)}
            </td>
            <td className="px-4 py-3">
              <RoleSelect
                isPending={isRolePending}
                onChange={(role) => onRole(user.id, role)}
                role={user.role}
              />
            </td>
            <td className="px-4 py-3">
              <BanCell
                isPending={isBanPending}
                onSelect={(banned) => onBan(user, banned)}
                user={user}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

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

  const staleCount = purgePreview?.count ?? 0;
  const retentionDays = purgePreview?.retentionDays ?? 7;

  const openBanDialog = (target: AdminUserRow, banned: boolean) =>
    setBanDialog({ target: target as BanTarget, banned });

  return (
    <div className="flex flex-col gap-[18px]">
      <div>
        <h1 className="font-heading m-0 text-[38px] leading-[1.05] font-semibold text-[#013405]">
          Users
        </h1>
        <p className="mt-1.5 text-[13.5px] text-[#013405]/65">
          Every account that can sign in. The role decides which workspace
          someone lands in; leadership review authority comes from their
          position assignment, not from here.
        </p>
      </div>

      <section className="flex flex-wrap items-center justify-between gap-4 border border-[#013405]/14 bg-[#fffdf6] px-[22px] py-4">
        <div>
          <h2 className="font-heading text-[19px] font-semibold text-[#013405]">
            Unverified accounts
          </h2>
          <p className="mt-1 max-w-prose text-[13px] text-[#013405]/60">
            {getStaleSummary(staleCount, retentionDays)}
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 border border-[#A51919]/40 px-4 py-2 text-xs font-extrabold tracking-[0.04em] text-[#A51919] transition-colors hover:bg-[#A51919] hover:text-white disabled:opacity-50"
          disabled={purgeMutation.isPending || isLoadingPurgePreview}
          onClick={() => setIsPurgeOpen(true)}
        >
          {staleCount === 0 ? "CHECK FOR STALE ACCOUNTS" : "CLEAN UP NOW"}
        </button>
      </section>

      {isLoadingUsers && (
        <p className="text-sm text-[#013405]/60">Loading users…</p>
      )}

      {!isLoadingUsers && users.length === 0 && (
        <p className="text-sm text-[#013405]/60">No accounts yet.</p>
      )}

      {users.length > 0 && (
        <UsersTable
          isBanPending={banMutation.isPending}
          isRolePending={setRoleMutation.isPending}
          onBan={openBanDialog}
          onRole={(userId, role) => setRoleMutation.mutate({ userId, role })}
          users={users}
        />
      )}

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
