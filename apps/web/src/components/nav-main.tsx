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
    icon?: React.ReactNode;
    isActive?: boolean;
    disabled?: boolean;
    tag?: string;
    count?: string;
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
    <SidebarGroup className="gap-0 px-2.5 py-0">
      <SidebarGroupLabel className="text-sidebar-foreground/40 px-2.5 pt-3.5 pb-1.5 text-xs font-extrabold tracking-[0.18em]">
        {label}
      </SidebarGroupLabel>
      <SidebarMenu className="gap-px">
        {items.map((item) => {
          const active = isItemActive(item.url);
          return (
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
                isActive={active}
                disabled={item.disabled}
                className={
                  active
                    ? "bg-sidebar-foreground/[0.14] border-sidebar-foreground text-sidebar-foreground rounded-none border-l-[3px] py-2.5 pl-2.25 font-semibold"
                    : "text-sidebar-foreground/85 rounded-none border-l-[3px] border-transparent py-2.5 pl-2.25 font-semibold hover:bg-transparent"
                }
                onClick={() =>
                  !item.disabled &&
                  item.url !== "#" &&
                  navigate({ to: item.url as never })
                }
              >
                <span className="flex-1 text-[13px]">{item.title}</span>
                {item.count && (
                  <span className="bg-sidebar-foreground/16 text-sidebar-foreground shrink-0 px-1.5 py-0.5 font-mono text-[10px]">
                    {item.count}
                  </span>
                )}
                {item.tag && (
                  <span className="border-sidebar-foreground/25 text-sidebar-foreground/50 shrink-0 border px-1.5 py-0.5 text-[8.5px] font-extrabold tracking-widest">
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
                            onClick={() =>
                              navigate({ to: subItem.url as never })
                            }
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
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
};
