import {
  isSeededAccount,
  roleLabel,
} from "@school-student-teacher-management/auth/roles";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import { Checkbox } from "@school-student-teacher-management/ui/components/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@school-student-teacher-management/ui/components/dropdown-menu";
import {
  IconArrowDown,
  IconArrowUp,
  IconArrowsSort,
  IconBan,
  IconCircleCheck,
  IconDotsVertical,
  IconLock,
  IconLogout,
  IconMail,
} from "@tabler/icons-react";
import { createColumnHelper } from "@tanstack/react-table";
import type { Header } from "@tanstack/react-table";
import type * as React from "react";
import { toast } from "sonner";

import type { UsersTableFeatures } from "./users-table-features";
import type { AccountRow } from "./users-types";

/**
 * The accounts table's columns, and the only cell that acts.
 *
 * ## Three decisions that are not formatting
 *
 * **The role is read-only here, and this is where that is visible.** It used to
 * be a `<select>` that could only write `teacher` or `user`, so a Principal
 * promoted through a position assignment was shown to the administrator as
 * "User", and the same control offered a shortcut around the verification,
 * staff-record and employment checks that approval exists to enforce. Promotion
 * happens in exactly one place now — staff approval, or a position assignment —
 * so the column renders a word and nothing else.
 *
 * **Ban is the one write, and it lives in a menu beside the row's name.** It
 * used to be a button in the "Status" column, which meant a column labelled
 * *status* held an action: a screen-reader user tabbing that column heard
 * "Ban, Ban, Ban" with no idea which account each belonged to. The status column
 * now says what the account *is*; the menu says what can be done to it, and it
 * is labelled with the account's name.
 *
 * **The seeded logins have no action, and the menu says why.** Their credentials
 * come from server configuration and are re-applied on every start, so a ban
 * would either be undone or lock the College out of its own system — the server
 * refuses it too (the `databaseHooks` in `packages/auth`). A disabled item that
 * names the reason is honest; a blank cell is not.
 */
const columnHelper = createColumnHelper<UsersTableFeatures, AccountRow>();

const getInitials = (name: string) =>
  name
    .replace(/^(?<prefix>Mr\.|Mrs\.|Ms\.|Dr\.)\s*/iu, "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** The date a column shows, in the words it shows it in. */
export const formatAccountDate = (value: string): string => {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
};

/**
 * The direction glyph, and the fact that it is `aria-hidden`.
 *
 * The direction is already announced — through `aria-sort` on the `<th>`, which
 * the table sets from this same state — so putting it in the accessible name as
 * well would say it twice. The glyph is for the reader looking at the table; the
 * `title` on the button is for the mouse, and it says what the *next* click will
 * do, which is the only question a sort control is ever asked.
 */
const SortGlyph: React.FC<{ sorted: false | "asc" | "desc" }> = ({
  sorted,
}) => {
  if (sorted === "asc") {
    return <IconArrowUp aria-hidden="true" className="size-3.5" />;
  }

  if (sorted === "desc") {
    return <IconArrowDown aria-hidden="true" className="size-3.5" />;
  }

  return (
    <IconArrowsSort
      aria-hidden="true"
      className="text-muted-foreground size-3.5 opacity-60"
    />
  );
};

/**
 * The `title` on a sort control, **derived from the current state**.
 *
 * It says what the next click will do, which is the only question a sort control
 * is ever asked, and it changes when the state does: a fixed string reads
 * correctly once and then lies for the rest of the session.
 */
const sortHint = (sorted: false | "asc" | "desc", label: string): string => {
  const what = label.toLowerCase();

  if (sorted === "asc") {
    return `Sorted by ${what}, A to Z. Activate to sort Z to A.`;
  }

  if (sorted === "desc") {
    return `Sorted by ${what}, Z to A. Activate to sort A to Z.`;
  }

  return `Not sorted by ${what}. Activate to sort A to Z.`;
};

/**
 * A header that is also the sort control for its column.
 *
 * The name comes from `columnMeta` rather than from `column.id`, because the two
 * disagree on the column an administrator reads most: the id is `createdAt` and
 * the name is "Created". A menu or a tooltip that offers `createdAt` is a list of
 * implementation details wearing a control's clothes.
 *
 * Two states per column and no third: the button toggles ascending and
 * descending, and *un*sorting is a thing this table does not offer, because the
 * server's order (`createdAt` ascending) is already the first thing on the page
 * and there is nothing for a third click to go back to.
 *
 * Generic in the column's value type because each accessor column has its own —
 * `Header<…, string>` for the name and `Header<…, string | null>` for the login,
 * and neither is the `Header<…, unknown>` a non-generic prop would declare.
 */
const SortableHeader = <TValue,>({
  header,
}: {
  header: Header<UsersTableFeatures, AccountRow, TValue>;
}) => {
  const label = header.column.columnDef.meta?.label ?? header.column.id;
  const sorted = header.column.getIsSorted();

  return (
    <button
      type="button"
      className="hover:text-foreground -ml-2 flex h-8 items-center gap-1.5 px-2 text-left transition-colors"
      onClick={() => header.column.toggleSorting(sorted !== "asc")}
      title={sortHint(sorted, label)}
    >
      {label}
      <SortGlyph sorted={sorted} />
    </button>
  );
};

export interface UserColumnOptions {
  /** Opens the ban dialog for one account, in the direction asked for. */
  onBan: (user: AccountRow, banned: boolean) => void;
  /** Ends every session the account has, on every device. */
  onRevokeSessions: (user: AccountRow) => void;
  /** True while a ban is in flight, which is the only write on this screen. */
  isBanPending: boolean;
}

/**
 * The one item that changes access, which is a different thing in each of the
 * account's three states.
 *
 * A function rather than a nested ternary in the markup, so that all three
 * sentences are readable side by side — and so the reason a seeded account has
 * no action is *in* the branch that refuses, not in a comment above it.
 */
const banActionItem = (
  user: AccountRow,
  seeded: boolean,
  onBan: (user: AccountRow, banned: boolean) => void
): React.ReactNode => {
  if (seeded) {
    return (
      <DropdownMenuItem disabled>
        <IconLock aria-hidden="true" />
        Institutional login — cannot be banned
      </DropdownMenuItem>
    );
  }

  if (user.banned) {
    return (
      <DropdownMenuItem onClick={() => onBan(user, false)}>
        <IconCircleCheck aria-hidden="true" />
        Unban account
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem variant="destructive" onClick={() => onBan(user, true)}>
      <IconBan aria-hidden="true" />
      Ban account
    </DropdownMenuItem>
  );
};

/**
 * The row's actions, named for the row.
 *
 * The `aria-label` on the trigger is what makes the menu usable: nine rows of
 * identical dots are nine controls that all read "More actions", and a
 * screen-reader user tabbing down the column learns nothing until they open one.
 *
 * The width is explicit because the shared popup sizes itself to its anchor, and
 * this anchor is a 32px icon button: a menu holding "Institutional login —
 * cannot be banned" was wrapping that sentence across four lines in a 190px box.
 * `min-w` rather than `w` for the same reason — the base sets `w-(--anchor-width)`
 * on the same element, and a second `w-` would be a fight over one property.
 */
const RowActions: React.FC<{
  user: AccountRow;
  isBanPending: boolean;
  onBan: (user: AccountRow, banned: boolean) => void;
  onRevokeSessions: (user: AccountRow) => void;
}> = ({ user, isBanPending, onBan, onRevokeSessions }) => {
  const seeded = isSeededAccount(user.username);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Account actions for ${user.name}`}
            disabled={isBanPending}
          />
        }
      >
        <IconDotsVertical aria-hidden="true" className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-64 [&_[data-slot=dropdown-menu-item]]:whitespace-nowrap"
      >
        {/*
          The account's name is a group label, and base-ui's group label is a
          *group* part: rendered straight into the popup it throws
          `MenuGroupContext is missing`. The group is also the right shape here,
          because the items under it belong to the name above them.
        */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
          {banActionItem(user, seeded, onBan)}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {/*
          The two actions that are not about access, and neither is a write to
          the account. They are here because they are what an administrator
          reaches for when something has gone wrong with an account and the
          answer is not to close it.
        */}
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => {
              void navigator.clipboard.writeText(user.email);
              toast.success("Email address copied");
            }}
          >
            <IconMail aria-hidden="true" />
            Copy email address
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isBanPending || user.banned === true}
            onClick={() => onRevokeSessions(user)}
          >
            <IconLogout aria-hidden="true" />
            Sign out on every device
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/**
 * What an account's state is, as a word.
 *
 * Three states and no fourth, because the column is doing one job: can this
 * account sign in, and has it proved it can. A banned account cannot; an
 * unconfirmed one can, and is marked as such because those are the accounts the
 * cleanup above this table exists to find.
 */
const StatusCell: React.FC<{ user: AccountRow }> = ({ user }) => {
  if (isSeededAccount(user.username)) {
    return (
      <Badge variant="outline" title="Seeded from the College environment">
        <IconLock aria-hidden="true" />
        Institutional
      </Badge>
    );
  }

  if (user.banned) {
    return (
      <Badge variant="destructive" title={user.banReason ?? undefined}>
        Banned
      </Badge>
    );
  }

  if (user.emailVerified === false) {
    return <Badge variant="warning">Email not confirmed</Badge>;
  }

  return <Badge variant="success">Active</Badge>;
};

/**
 * The columns, in reading order.
 *
 * A function rather than a module constant because two cells close over the ban
 * callback: a constant would either capture the first render's callback forever
 * or need a React context to stay correct. The result is a plain object graph, so
 * rebuilding it when the callback changes costs nothing.
 */
export const buildUserColumns = ({
  onBan,
  onRevokeSessions,
  isBanPending,
}: UserColumnOptions) =>
  columnHelper.columns([
    columnHelper.display({
      id: "select",
      meta: { label: "Select" },
      header: ({ table }) => (
        <Checkbox
          aria-label="Select every account on this page"
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onCheckedChange={(checked) =>
            table.toggleAllPageRowsSelected(checked)
          }
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={`Select ${row.original.name}`}
          checked={row.getIsSelected()}
          onCheckedChange={(checked) => row.toggleSelected(checked)}
        />
      ),
      // Neither sorting nor hiding, and for the same reason: this column is not
      // data, so ordering by it means nothing, and hiding it would remove the
      // only way to select a row.
      enableSorting: false,
      enableHiding: false,
    }),

    columnHelper.accessor("name", {
      meta: { label: "Name" },
      header: ({ header }) => <SortableHeader header={header} />,
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center text-xs font-semibold"
          >
            {getInitials(row.original.name)}
          </span>
          <span className="min-w-0">
            <span className="block max-w-[32ch] truncate font-semibold">
              {row.original.name}
            </span>
            <span className="text-muted-foreground block max-w-[32ch] truncate text-xs">
              {row.original.email}
            </span>
          </span>
        </div>
      ),
    }),

    columnHelper.accessor("username", {
      meta: { label: "Username" },
      // Read-only, and **not sortable**: `listAccounts` orders by name, email,
      // role and created date. A fifth `ORDER BY` branch for a column most
      // administrators never read is not worth a header button that claims to do
      // something, so this header is a label.
      enableSorting: false,
      cell: ({ getValue }) => {
        const username = getValue();

        return username ? (
          <span className="font-mono text-xs">{username}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    }),

    columnHelper.accessor("role", {
      meta: { label: "Role" },
      header: ({ header }) => <SortableHeader header={header} />,
      cell: ({ getValue }) => (
        <span className="text-primary inline-flex items-center text-xs font-bold">
          {roleLabel(getValue())}
        </span>
      ),
    }),

    columnHelper.display({
      id: "status",
      meta: { label: "Status" },
      cell: ({ row }) => <StatusCell user={row.original} />,
      // Not sortable, deliberately: this column mixes three different columns
      // into one, and sorting it would produce a half-ordered column that reads
      // as a ranking.
      enableSorting: false,
    }),

    columnHelper.accessor("createdAt", {
      meta: { label: "Created" },
      header: ({ header }) => <SortableHeader header={header} />,
      cell: ({ getValue }) => (
        <span className="text-muted-foreground text-xs">
          {formatAccountDate(getValue())}
        </span>
      ),
    }),

    columnHelper.display({
      id: "actions",
      meta: { label: "Actions" },
      cell: ({ row }) => (
        <div className="flex justify-end">
          <RowActions
            user={row.original}
            isBanPending={isBanPending}
            onBan={onBan}
            onRevokeSessions={onRevokeSessions}
          />
        </div>
      ),
      enableSorting: false,
    }),
  ]);
