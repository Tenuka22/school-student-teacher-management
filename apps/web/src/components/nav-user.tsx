"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@school-student-teacher-management/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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

const getAvatarFallback = (name: string) => {
  const parts = name.split(" ");
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

export const NavUser = ({
  user,
}: {
  user?: {
    name: string;
    email: string;
    avatar?: string;
  };
}) => {
  const { isMobile } = useSidebar();
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

  if (!user) {
    return null;
  }

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
      await authClient.signOut();
      navigate({ to: "/login" });
    } catch {
      toast.error("Failed to sign out");
    }
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent"
              />
            }
          >
            <Avatar className="bg-sidebar-primary/15 text-sidebar-primary size-8 rounded-none font-bold">
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback className="bg-sidebar-primary/15 text-sidebar-primary rounded-none font-bold">
                {getAvatarFallback(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left leading-tight">
              <span className="text-sidebar-foreground truncate text-[12.5px] font-bold">
                {user.name}
              </span>
              <span className="text-sidebar-foreground/50 truncate text-xs">
                {user.email}
              </span>
            </div>
            <IconSelector className="text-sidebar-foreground/50 ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="border-primary/15 min-w-60 rounded-none border p-1.5 shadow-none"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <div className="flex items-center gap-2.5 px-2 py-2">
              <Avatar className="bg-primary/10 text-primary size-9 rounded-none font-bold">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="bg-primary/10 text-primary rounded-none font-bold">
                  {getAvatarFallback(user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-bold">{user.name}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {user.email}
                </span>
              </div>
            </div>
            <DropdownMenuSeparator className="bg-primary/10" />
            <DropdownMenuItem
              className="cursor-pointer gap-2 rounded-none font-semibold"
              onClick={() => {
                navigate({ to: "/account" });
              }}
            >
              <IconUserCircle className="size-4" />
              Account &amp; password
            </DropdownMenuItem>
            {otherAccounts.length > 0 && (
              <>
                <DropdownMenuSeparator className="bg-primary/10" />
                <div className="text-muted-foreground flex items-center gap-2 px-2 pt-1.5 pb-1 text-xs font-extrabold tracking-[0.1em]">
                  <IconUsers className="size-3.5" />
                  SWITCH ACCOUNT
                </div>
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
              </>
            )}
            <DropdownMenuItem
              className="cursor-pointer gap-2 rounded-none font-semibold"
              onClick={() => {
                navigate({ to: "/login", search: { switch: 1 } });
              }}
            >
              <IconUserPlus className="size-4" />
              Add another account
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive hover:bg-destructive/8 cursor-pointer gap-2 rounded-none font-semibold"
              onClick={handleSignOut}
            >
              <IconLogout className="size-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};
