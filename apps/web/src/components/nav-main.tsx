import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@school-student-teacher-management/ui/components/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@school-student-teacher-management/ui/components/sidebar";
import { IconChevronRight } from "@tabler/icons-react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

export const NavMain = ({
  label = "Platform",
  items,
}: {
  label?: string;
  items: {
    title: string;
    url: string;
    icon: React.ReactNode;
    isActive?: boolean;
    disabled?: boolean;
    tag?: string;
    items?: {
      title: string;
      url: string;
    }[];
  }[];
}) => {
  const navigate = useNavigate();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const isItemActive = (url: string) => {
    if (url === "#") {
      return false;
    }
    return currentPath === url || currentPath.startsWith(`${url}/`);
  };

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-sidebar-foreground/40 text-xs font-extrabold tracking-[0.18em]">
        {label}
      </SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <Collapsible
            key={item.title}
            defaultOpen={
              item.isActive ||
              item.items?.some((subItem) => isItemActive(subItem.url))
            }
            render={<SidebarMenuItem />}
          >
            <SidebarMenuButton
              tooltip={item.title}
              isActive={isItemActive(item.url)}
              disabled={item.disabled}
              className={isItemActive(item.url) ? "bg-sidebar-accent" : ""}
              onClick={() =>
                !item.disabled &&
                item.url !== "#" &&
                navigate({ to: item.url as never })
              }
            >
              {item.icon}
              <span className="flex-1">{item.title}</span>
              {item.tag && (
                <span className="border-sidebar-foreground/25 text-sidebar-foreground/50 shrink-0 border px-1.5 py-0.5 text-[8.5px] font-extrabold tracking-[0.1em]">
                  {item.tag}
                </span>
              )}
            </SidebarMenuButton>
            {item.items?.length ? (
              <>
                <CollapsibleTrigger
                  render={
                    <SidebarMenuAction className="aria-expanded:rotate-90" />
                  }
                >
                  <IconChevronRight />
                  <span className="sr-only">Toggle</span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items?.map((subItem) => (
                      <SidebarMenuSubItem key={subItem.title}>
                        <SidebarMenuSubButton
                          isActive={isItemActive(subItem.url)}
                          onClick={() => navigate({ to: subItem.url as never })}
                        >
                          <span>{subItem.title}</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </>
            ) : null}
          </Collapsible>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
};
