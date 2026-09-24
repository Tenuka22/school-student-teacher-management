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

  if (!user) {
    return null;
  }

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
