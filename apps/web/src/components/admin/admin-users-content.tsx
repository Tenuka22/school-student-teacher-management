import {
  isSeededAccount,
  roleLabel,
} from "@school-student-teacher-management/auth/roles";

import { BanUserDialog } from "./ban-user-dialog";
import type { BanTarget } from "./ban-user-dialog";
import { PurgeUnverifiedDialog } from "./purge-unverified-dialog";
import { USERS_PAGE_SIZE, useAdminUsers } from "./use-admin-users";
import type { AdminUserRow } from "./use-admin-users";

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
        className="text-primary/45 text-xs font-bold"
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
        className="border-primary/30 text-primary hover:border-primary border px-3 py-1.5 text-xs font-bold transition-colors"
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
      className="border-destructive/40 text-destructive hover:border-destructive border px-3 py-1.5 text-xs font-bold transition-colors"
    >
      Ban
    </button>
  );
};

/**
 * The role a row actually holds, as a word.
 *
 * This used to be a `<select>` that could only write `teacher` or `user`, so a
 * Principal promoted through a position assignment was rendered to the
 * administrator as "User" and the same control offered a shortcut around the
 * verification, staff-record and employment checks that approval exists to
 * enforce. Promotion now happens in exactly one place: staff approval, or a
 * position assignment.
 */
const RoleCell = ({ user }: { user: AdminUserRow }) => {
  if (isSeededAccount(user.username)) {
    return (
      <span
        className="text-primary/45 text-xs font-bold"
        title="Institutional login — its role comes from the College environment"
      >
        {roleLabel(user.role)}
      </span>
    );
  }

  return (
    <span className="text-primary inline-flex items-center gap-2 text-xs font-bold">
      {roleLabel(user.role)}
    </span>
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
  onBan,
}: {
  users: AdminUserRow[];
  isBanPending: boolean;
  onBan: (user: AdminUserRow, banned: boolean) => void;
}) => (
  <div className="border-primary/14 bg-card overflow-x-auto border">
    <table className="w-full min-w-[720px] text-left text-sm">
      <thead>
        <tr className="border-primary/14 border-b">
          <th className="text-primary/60 px-4 py-3 text-xs font-extrabold tracking-[0.12em]">
            NAME
          </th>
          <th className="text-primary/60 px-4 py-3 text-xs font-extrabold tracking-[0.12em]">
            USERNAME
          </th>
          <th className="text-primary/60 px-4 py-3 text-xs font-extrabold tracking-[0.12em]">
            CREATED
          </th>
          <th className="text-primary/60 px-4 py-3 text-xs font-extrabold tracking-[0.12em]">
            ROLE
          </th>
          <th className="text-primary/60 px-4 py-3 text-xs font-extrabold tracking-[0.12em]">
            STATUS
          </th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <tr
            className="border-primary/8 border-b last:border-b-0"
            key={user.id}
          >
            <td className="px-4 py-3">
              <span className="text-primary block font-bold">{user.name}</span>
              <span className="text-primary/55 block text-xs">
                {user.email}
                {user.emailVerified === false && (
                  <span className="text-destructive ml-2">
                    email not confirmed
                  </span>
                )}
              </span>
            </td>
            <td className="text-primary/70 px-4 py-3 font-mono text-xs">
              {user.username ?? "—"}
            </td>
            <td className="text-primary/60 px-4 py-3 text-xs">
              {formatWhen(user.createdAt)}
            </td>
            <td className="px-4 py-3">
              <RoleCell user={user} />
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
 * Page controls that say exactly which slice of the accounts is on screen.
 *
 * The table used to stop at 200 rows with nothing to indicate it, so an
 * administrator managing a larger College saw a list that looked complete.
 */
const UsersPagination = ({
  goToPage,
  page,
  pageCount,
  total,
}: {
  goToPage: (page: number) => void;
  page: number;
  pageCount: number;
  total: number;
}) => {
  if (pageCount <= 1) {
    return (
      <p className="text-primary/60 text-xs">
        {total} {total === 1 ? "account" : "accounts"}
      </p>
    );
  }

  const first = page * USERS_PAGE_SIZE + 1;
  const last = Math.min((page + 1) * USERS_PAGE_SIZE, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-primary/60 text-xs">
        Showing {first}–{last} of {total} accounts
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="border-primary/25 text-primary hover:border-primary border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-40"
          disabled={page === 0}
          onClick={() => goToPage(page - 1)}
        >
          Previous
        </button>
        <span className="text-primary/60 text-xs font-bold">
          Page {page + 1} of {pageCount}
        </span>
        <button
          type="button"
          className="border-primary/25 text-primary hover:border-primary border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-40"
          disabled={page >= pageCount - 1}
          onClick={() => goToPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
};

const UsersErrorPanel = ({ onRetry }: { onRetry: () => void }) => (
  <div className="border-destructive/30 bg-card border px-[22px] py-4">
    <p className="text-destructive text-sm font-bold">
      The account list could not be loaded
    </p>
    <p className="text-primary/65 mt-1 text-[13px]">
      The server did not return the account list. Nothing has been changed — try
      again.
    </p>
    <button
      type="button"
      className="border-primary/30 text-primary hover:border-primary mt-3 border px-3 py-1.5 text-xs font-bold transition-colors"
      onClick={onRetry}
    >
      Try again
    </button>
  </div>
);
/**
 * The list itself, in whichever state it is actually in.
 *
 * Loading, failed and empty are three different facts, and they used to collapse
 * into one: a request that 500s rendered "No accounts yet", which reads as a
 * true statement about the College and invites a deletion nobody meant.
 */
const UsersList = ({
  isError,
  isLoading,
  onRetry,
  page,
  pageCount,
  total,
  users,
  goToPage,
  onBan,
  isBanPending,
}: {
  isError: boolean;
  isLoading: boolean;
  onRetry: () => void;
  page: number;
  pageCount: number;
  total: number;
  users: AdminUserRow[];
  goToPage: (page: number) => void;
  onBan: (user: AdminUserRow, banned: boolean) => void;
  isBanPending: boolean;
}) => {
  if (isLoading) {
    return <p className="text-primary/60 text-sm">Loading users…</p>;
  }

  if (isError) {
    return <UsersErrorPanel onRetry={onRetry} />;
  }

  if (users.length === 0) {
    return (
      <p className="text-primary/60 text-sm">
        {total === 0
          ? "No accounts have been created yet."
          : "No accounts on this page."}
      </p>
    );
  }

  return (
    <>
      <UsersTable isBanPending={isBanPending} onBan={onBan} users={users} />
      <UsersPagination
        goToPage={goToPage}
        page={page}
        pageCount={pageCount}
        total={total}
      />
    </>
  );
};

const UnverifiedAccountsSection = ({
  isPending,
  onOpen,
  retentionDays,
  staleCount,
}: {
  isPending: boolean;
  onOpen: () => void;
  retentionDays: number;
  staleCount: number;
}) => (
  <section className="border-primary/14 bg-card flex flex-wrap items-center justify-between gap-4 border px-[22px] py-4">
    <div>
      <h2 className="font-heading text-primary text-[19px] font-semibold">
        Unverified accounts
      </h2>
      <p className="text-primary/60 mt-1 max-w-prose text-[13px]">
        {getStaleSummary(staleCount, retentionDays)}
      </p>
    </div>
    <button
      type="button"
      className="border-destructive/40 text-destructive hover:bg-destructive shrink-0 border px-4 py-2 text-xs font-extrabold tracking-[0.04em] transition-colors hover:text-white disabled:opacity-50"
      disabled={isPending}
      onClick={onOpen}
    >
      {staleCount === 0 ? "CHECK FOR STALE ACCOUNTS" : "CLEAN UP NOW"}
    </button>
  </section>
);

/**
 * User administration, backed by Better Auth's admin plugin.
 *
 * Roles are read-only here by design. Someone becomes a teacher through staff
 * approval, and someone gains review authority through a `staff_position` row in
 * the academic year — both of which check the things a role dropdown cannot
 * (a verified address, a staff record, a category, an employment status). The
 * three institutional logins are seeded from the environment and are not
 * bannable or re-roleable at all.
 */
export const AdminUsersContent = () => {
  const {
    users,
    totalUsers,
    page,
    pageCount,
    goToPage,
    isLoadingUsers,
    isErrorUsers,
    refetchUsers,
    banDialog,
    setBanDialog,
    banMutation,
    isPurgeOpen,
    setIsPurgeOpen,
    openPurgeDialog,
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
        <h1 className="font-heading text-primary m-0 text-[38px] leading-[1.05] font-semibold">
          Users
        </h1>
        <p className="text-primary/65 mt-1.5 text-[13.5px]">
          Every account that can sign in, and where it is in its life. A general
          account becomes a teacher through staff approval, and review authority
          comes from a position assignment in the selected year.
        </p>
      </div>

      <UnverifiedAccountsSection
        isPending={purgeMutation.isPending || isLoadingPurgePreview}
        onOpen={openPurgeDialog}
        retentionDays={retentionDays}
        staleCount={staleCount}
      />

      <UsersList
        goToPage={goToPage}
        isBanPending={banMutation.isPending}
        isError={isErrorUsers}
        isLoading={isLoadingUsers}
        onBan={openBanDialog}
        onRetry={() => {
          refetchUsers();
        }}
        page={page}
        pageCount={pageCount}
        total={totalUsers}
        users={users}
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
