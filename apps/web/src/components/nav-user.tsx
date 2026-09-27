"use client";

import { roleLabel } from "@school-student-teacher-management/auth/roles";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@school-student-teacher-management/ui/components/avatar";
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
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@school-student-teacher-management/ui/components/sidebar";
import {
  IconLogout,
  IconSelector,
  IconUserCircle,
  IconUserPlus,
  IconUsers,
} from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { toDeviceSessions } from "@/lib/auth-sessions";

export const getAvatarFallback = (name: string) => {
  const parts = name.split(" ");
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

export interface AccountMenuUser {
  name: string;
  email: string;
  avatar?: string;
  /**
   * The stored role, shown as its own line under the name.
   *
   * A member of staff uses a shared machine, and the sidebar's nav already
   * differs by role — the fastest way to know which workspace you are looking
   * at is to be told, rather than to infer it from the links. `roleLabel` is
   * the one place a role becomes a word, so this cannot drift from the words
   * used anywhere else. Optional because the teacher mobile app bar and
   * `account.tsx` both pass a user without one.
   */
  role?: string;
}

/**
 * The account dropdown's content: who is signed in, their account page, the
 * other accounts this browser holds, and signing out.
 *
 * Pulled out of `NavUser` so the teacher workspace's mobile app bar can offer
 * the identical menu behind a plain avatar button instead of the sidebar's
 * `SidebarMenuButton` — the two triggers look nothing alike, but the actions
 * behind them (and the account-switching state that drives them) are one
 * piece of logic, and duplicating it would let the two surfaces drift.
 *
 * `Esc`, outside click and the return of focus to the trigger are the popup
 * primitive's own behaviour (base-ui `Menu`), not something this component has
 * to re-implement or can accidentally break: every item is a real `menuitem`,
 * so the menu's own arrow-key roving focus and typeahead-selection still apply.
 */
export const UserAccountMenu = ({
  user,
  trigger,
  side = "right",
}: {
  user: AccountMenuUser;
  trigger: React.ReactElement;
  side?: "top" | "right" | "bottom" | "left";
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [switchingToken, setSwitchingToken] = useState<string | null>(null);

  // Same query key `saved-accounts.tsx` uses on the login page, so switching
  // here and switching there read one cache rather than two that can disagree
  // about which accounts this browser still holds a session for.
  const accountsQuery = useQuery({
    queryKey: ["auth", "saved-accounts"],
    queryFn: async () => {
      const { data } = await authClient.multiSession.listDeviceSessions();
      return toDeviceSessions(data);
    },
  });

  // The active account is one of the entries `listDeviceSessions` returns, not
  // a separate thing — filtering it out by email is what turns the list into
  // "the other accounts", which is the only list a switcher should offer.
  const otherAccounts = (accountsQuery.data ?? []).filter(
    (account) => account.user.email !== user.email
  );

  const handleSwitch = async (sessionToken: string) => {
    setSwitchingToken(sessionToken);

    const { error } = await authClient.multiSession.setActive({ sessionToken });

    if (error) {
      toast.error(error.message ?? "Could not switch account");
      setSwitchingToken(null);
      return;
    }

    await queryClient.invalidateQueries({
      queryKey: ["auth", "saved-accounts"],
    });
    toast.success("Signed in — reloading");
    window.location.assign("/");
  };

  const handleSignOut = async () => {
    try {
      // The better-auth client resolves with `{ error }` rather than throwing,
      // so a sign-out that was refused used to read as a sign-out that worked:
      // nothing happened, the menu closed, and the account was still signed in
      // with nothing said. The `catch` is kept for the case where the transport
      // itself fails, because both are the same failure to the person standing
      // there.
      const { error } = await authClient.signOut();

      if (error) {
        toast.error(
          error.message ??
            "Could not sign out. Try again, or close this browser tab."
        );
        return;
      }

      navigate({ to: "/login" });
    } catch {
      toast.error("Could not sign out. Try again, or close this browser tab.");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent
        align="end"
        className="border-primary/15 min-w-60 rounded-none border p-1.5 shadow-none"
        side={side}
        sideOffset={4}
      >
        {/*
          The identity block is a group *label*, not loose markup: a `role="menu"`
          may only contain `menuitem`, `group`, `separator` and `group label`, so
          a `<div>` dropped straight in was invalid content whatever it looked
          like. No avatar in here either — the trigger is the avatar, and
          repeating it wastes the width the menu needs for the email.
        */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-2">
            <span className="grid leading-tight">
              <span className="truncate text-sm font-bold">{user.name}</span>
              <span className="text-muted-foreground truncate text-xs">
                {roleLabel(user.role)}
              </span>
              <span className="text-muted-foreground truncate text-xs">
                {user.email}
              </span>
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="bg-primary/10" />
        <DropdownMenuItem
          className="cursor-pointer gap-2 rounded-none font-semibold"
          onClick={() => {
            navigate({ to: "/account" });
          }}
        >
          <IconUserCircle aria-hidden="true" className="size-4" />
          Account &amp; password
        </DropdownMenuItem>
        {otherAccounts.length > 0 && (
          <>
            <DropdownMenuSeparator className="bg-primary/10" />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-muted-foreground px-2 pt-1.5 pb-1 text-xs font-extrabold tracking-[0.1em]">
                <span className="flex items-center gap-2">
                  <IconUsers aria-hidden="true" className="size-3.5" />
                  SWITCH ACCOUNT
                </span>
              </DropdownMenuLabel>
              {otherAccounts.map((account) => (
                <DropdownMenuItem
                  key={account.session.token}
                  className="cursor-pointer gap-2 rounded-none font-semibold"
                  disabled={switchingToken !== null}
                  onClick={() => {
                    void handleSwitch(account.session.token);
                  }}
                >
                  <Avatar className="bg-primary/10 text-primary size-6 rounded-none font-bold">
                    <AvatarFallback className="bg-primary/10 text-primary rounded-none text-xs font-bold">
                      {getAvatarFallback(account.user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="grid min-w-0 flex-1 text-left leading-tight">
                    <span className="truncate text-xs font-bold">
                      {account.user.name}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      {account.user.email}
                    </span>
                  </span>
                  {switchingToken === account.session.token && (
                    <span className="text-primary shrink-0 text-xs font-extrabold tracking-[0.08em]">
                      SWITCHING
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        )}
        {/*
          A read that failed is not the same as a read that found nothing, and
          the difference is the whole point of this menu on a shared machine: a
          member who knows two accounts are signed in here would otherwise see
          no switcher at all and no reason for it. One line says what happened
          and what still works.
        */}
        {accountsQuery.isError && (
          <>
            <DropdownMenuSeparator className="bg-primary/10" />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-muted-foreground px-2 py-2 text-xs leading-relaxed font-normal">
                The other accounts on this device could not be read. Add another
                account, or sign out, to switch.
              </DropdownMenuLabel>
            </DropdownMenuGroup>
          </>
        )}
        <DropdownMenuItem
          className="cursor-pointer gap-2 rounded-none font-semibold"
          onClick={() => {
            navigate({ to: "/login", search: { switch: 1 } });
          }}
        >
          <IconUserPlus aria-hidden="true" className="size-4" />
          Add another account
        </DropdownMenuItem>
        {/*
          Separated, and the one destructive item in the menu. It ends the
          session — the account switcher above it does not — and putting it
          under the same rule as "Add another account" is how people sign out
          by accident on a shared machine in a staff room. `variant="destructive"`
          is the component's own token pairing rather than a hand-tinted class,
          and it stays 7.49:1 on the popover ground and 6.23:1 on its own hover.
        */}
        <DropdownMenuSeparator className="bg-primary/10" />
        <DropdownMenuItem
          className="cursor-pointer gap-2 rounded-none font-semibold"
          onClick={handleSignOut}
          variant="destructive"
        >
          <IconLogout aria-hidden="true" className="size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const NavUser = ({ user }: { user?: AccountMenuUser }) => {
  const { isMobile } = useSidebar();

  if (!user) {
    return null;
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <UserAccountMenu
          user={user}
          side={isMobile ? "bottom" : "right"}
          trigger={
            <SidebarMenuButton
              /*
                The visible content is a name and an email address, which is a
                poor name for a control: it never says the control is a menu.
                This does, and it still contains the visible name so the
                voice-control "click Teachers" case keeps working (WCAG 2.5.3).
              */
              aria-label={`Account menu for ${user.name}, ${roleLabel(user.role)}`}
              className="data-[state=open]:bg-sidebar-accent"
              size="lg"
            >
              <Avatar className="bg-sidebar-primary/15 text-sidebar-primary size-8 rounded-none font-bold">
                <AvatarImage alt="" src={user.avatar} />
                <AvatarFallback className="bg-sidebar-primary/15 text-sidebar-primary rounded-none font-bold">
                  {getAvatarFallback(user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left leading-tight">
                <span className="text-sidebar-foreground truncate text-[12.5px] font-bold">
                  {user.name}
                </span>
                {/* `/70` rather than `/50`: cream at half strength over the deep
                    green is 4.38:1, which is under the 4.5:1 a 12px line needs.
                    At 70% it is 7.19:1. */}
                <span className="text-sidebar-foreground/70 truncate text-xs">
                  {roleLabel(user.role)}
                </span>
              </div>
              <IconSelector
                aria-hidden="true"
                className="text-sidebar-foreground/60 ml-auto size-4"
              />
            </SidebarMenuButton>
          }
        />
      </SidebarMenuItem>
    </SidebarMenu>
  );
};
