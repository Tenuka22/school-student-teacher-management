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
import { IconLogout, IconSelector, IconUserCircle } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

/* oxlint-disable react-doctor/only-export-components -- avatar-initials helper shared by both the sidebar trigger below and the account menu it renders */
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
}

/**
 * The account dropdown's own content \u2014 profile summary, "Account &
 * password", "Log out" \u2014 detached from the sidebar-specific trigger that
 * `NavUser` wraps it in below. The teacher workspace's mobile top bar needs
 * the identical menu behind a different trigger (a bare avatar button, not a
 * full `SidebarMenuButton` row), so the menu itself is the reusable unit and
 * each caller supplies its own `trigger`.
 */
export const UserAccountMenu = ({
  user,
  side,
  trigger,
}: {
  user: AccountMenuUser;
  side: "bottom" | "right";
  trigger: React.ReactNode;
}) => {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
      navigate({ to: "/login" });
    } catch {
      toast.error("Failed to sign out");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger as React.ReactElement} />
      <DropdownMenuContent
        className="border-primary/15 min-w-60 rounded-none border p-1.5 shadow-none"
        side={side}
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
            <span className="truncate text-sm font-semibold">{user.name}</span>
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
        <DropdownMenuItem
          className="text-destructive hover:bg-destructive/8 cursor-pointer gap-2 rounded-none font-semibold"
          onClick={handleSignOut}
        >
          <IconLogout className="size-4" />
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
              size="lg"
              className="data-[state=open]:bg-sidebar-accent"
            >
              <Avatar className="bg-sidebar-primary/15 text-sidebar-primary size-8 rounded-none font-bold">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="bg-sidebar-primary/15 text-sidebar-primary rounded-none font-bold">
                  {getAvatarFallback(user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left leading-tight">
                <span className="text-sidebar-foreground truncate text-sm font-semibold">
                  {user.name}
                </span>
                <span className="text-sidebar-muted-foreground truncate text-xs">
                  {user.email}
                </span>
              </div>
              <IconSelector className="text-sidebar-muted-foreground ml-auto size-4" />
            </SidebarMenuButton>
          }
        />
      </SidebarMenuItem>
    </SidebarMenu>
  );
};
