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
    /** Scrolls to this in-page anchor after navigating to `url`, for a group
     *  of links that all point at sections of one page rather than separate
     *  routes (e.g. "Inventory Management"'s Owned/Borrowed/Lent Out). */
    hash?: string;
    /** Selects which query-param state this item lands on, for a group of
     *  links that all point at one route's tabbed content rather than
     *  separate pages (e.g. "Inventory"'s Loans/Issues/Write-offs, each a
     *  `?tab=records&subtab=...` on the same admin inventory route). */
    search?: Record<string, string>;
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

  const isItemActive = (
    url: string,
    hash?: string,
    search?: Record<string, string>
  ) => {
    if (url === "#") {
      return false;
    }
    const pathMatches =
      currentPath === url || currentPath.startsWith(`${url}/`);
    if (!pathMatches) {
      return false;
    }
    // Several items in a group can share one `url` and differ only by
    // `hash` (e.g. "Inventory Management"'s Owned/Borrowed/Lent Out all
    // point at /teacher/$year/equipment). Without comparing the hash too,
    // all three would highlight together no matter which section is open.
    if (hash !== undefined && routerState.location.hash !== hash) {
      return false;
    }
    // Same idea for `search`: several "Inventory" links share one url and
    // differ only by which `?tab=`/`?subtab=` they set, so every key named
    // in `search` has to match the current location's, not merely be present.
    if (search === undefined) {
      return true;
    }
    const currentSearch = routerState.location.search as Record<
      string,
      unknown
    >;
    return Object.entries(search).every(
      ([key, value]) => currentSearch[key] === value
    );
  };

  // A group with nothing in it (e.g. the administrator's "My Workspace",
  // which is intentionally empty because admin can neither own nor borrow
  // equipment) renders as a bare, actionable-looking header with no rows
  // beneath it. That reads as broken, not as "nothing to show" — so the
  // whole group is skipped rather than shown empty.
  if (items.length === 0) {
    return null;
  }

  return (
    <SidebarGroup className="gap-0 px-2.5 py-0">
      <SidebarGroupLabel className="text-sidebar-foreground/40 px-2.5 pt-3.5 pb-1.5 text-xs font-extrabold tracking-[0.18em]">
        {label}
      </SidebarGroupLabel>
      <SidebarMenu className="gap-px">
        {items.map((item) => {
          const active = isItemActive(item.url, item.hash, item.search);
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
                  navigate({
                    to: item.url as never,
                    hash: item.hash,
                    search: item.search as never,
                  })
                }
              >
                <span className="flex-1 text-[13px]">{item.title}</span>
                {item.count && (
                  <span className="bg-sidebar-foreground/16 text-sidebar-foreground shrink-0 px-1.5 py-0.5 font-mono text-xs">
                    {item.count}
                  </span>
                )}
                {item.tag && (
                  <span className="border-sidebar-foreground/25 text-sidebar-foreground/50 shrink-0 border px-1.5 py-0.5 text-xs font-extrabold tracking-wider">
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
