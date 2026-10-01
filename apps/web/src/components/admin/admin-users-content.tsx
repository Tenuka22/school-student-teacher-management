import { BanUserDialog } from "./ban-user-dialog";
import { BulkBanDialog } from "./bulk-ban-dialog";
import { PurgeUnverifiedDialog } from "./purge-unverified-dialog";
import { useAdminUsers } from "./use-admin-users";
import { UsersDataTable } from "./users-data-table";
import type { UsersSearch } from "./users-search";
import type { AccountRow } from "./users-types";

const getStaleSummary = (count: number, retentionDays: number): string => {
  if (count === 0) {
    return `No account is waiting on its email confirmation. Accounts that never confirm are removed automatically after ${retentionDays} days.`;
  }

  const subject = count === 1 ? "account has" : "accounts have";

  return `${count} ${subject} gone ${retentionDays}+ days without confirming an address.`;
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
 * User administration, backed by the accounts table.
 *
 * `search` is the route's validated query string, handed down rather than read
 * here: the route owns the URL contract (`users-search.ts`) and this component
 * must not import the route file, because the route imports this one. So the
 * value arrives as a prop and every write goes back out through the hook, which
 * navigates — one copy of the list state, in the URL, and no second one here.
 *
 * Roles are read-only here by design. Someone becomes a teacher through staff
 * approval, and someone gains review authority through a `staff_position` row in
 * the academic year — both of which check the things a role dropdown cannot
 * (a verified address, a staff record, a category, an employment status). The
 * three institutional logins are seeded from the environment and are not
 * bannable at all.
 */
export const AdminUsersContent = ({ search }: { search: UsersSearch }) => {
  const {
    accounts,
    total,
    pagination,
    sorting,
    rowSelection,
    search: searchTerm,
    role,
    status,
    hasFilters,
    onSortingChange,
    onPaginationChange,
    onRowSelectionChange,
    onSearchChange,
    onRoleChange,
    onStatusChange,
    onResetFilters,
    isLoadingAccounts,
    isFetchingAccounts,
    isErrorAccounts,
    refetchAccounts,
    banDialog,
    setBanDialog,
    banMutation,
    revokeSessionsMutation,
    bulkDialog,
    setBulkDialog,
    bulkBanMutation,
    isPurgeOpen,
    setIsPurgeOpen,
    openPurgeDialog,
    purgePreview,
    isLoadingPurgePreview,
    purgeMutation,
  } = useAdminUsers(search);

  const staleCount = purgePreview?.count ?? 0;
  const retentionDays = purgePreview?.retentionDays ?? 7;

  const openBanDialog = (account: AccountRow, banned: boolean) =>
    setBanDialog({ target: account, banned });

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

      <UsersDataTable
        accounts={accounts}
        hasFilters={hasFilters}
        isBanPending={banMutation.isPending || bulkBanMutation.isPending}
        isError={isErrorAccounts}
        isFetching={isFetchingAccounts}
        isLoading={isLoadingAccounts}
        onBan={openBanDialog}
        onBulkBan={(selected, banned) =>
          setBulkDialog({ accounts: selected, banned })
        }
        onPaginationChange={onPaginationChange}
        onResetFilters={onResetFilters}
        onRetry={() => {
          refetchAccounts();
        }}
        onRevokeSessions={(account) =>
          revokeSessionsMutation.mutate({ userId: account.id })
        }
        onRoleChange={onRoleChange}
        onRowSelectionChange={onRowSelectionChange}
        onSearchChange={onSearchChange}
        onSortingChange={onSortingChange}
        onStatusChange={onStatusChange}
        pagination={pagination}
        role={role}
        rowSelection={rowSelection}
        search={searchTerm}
        sorting={sorting}
        status={status}
        total={total}
      />

      <BanUserDialog
        isPending={banMutation.isPending}
        isUnban={banDialog?.banned === false}
        key={`ban-${banDialog?.target.id ?? "closed"}`}
        onConfirm={(input) => banMutation.mutate(input)}
        onOpenChange={(open) => {
          if (!open) {
            setBanDialog(null);
          }
        }}
        target={banDialog?.target ?? null}
      />

      <BulkBanDialog
        accounts={bulkDialog?.accounts ?? []}
        isPending={bulkBanMutation.isPending}
        isUnban={bulkDialog?.banned === false}
        key={`bulk-${
          bulkDialog?.accounts.map((account) => account.id).join(",") ??
          "closed"
        }`}
        onConfirm={(input) => {
          if (bulkDialog) {
            bulkBanMutation.mutate({ accounts: bulkDialog.accounts, ...input });
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setBulkDialog(null);
          }
        }}
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
