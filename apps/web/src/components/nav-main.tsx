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
  useSidebar,
} from "@school-student-teacher-management/ui/components/sidebar";
import { IconChevronRight } from "@tabler/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";

const ITEM_BASE =
  "rounded-none border-l-[3px] py-2.5 pl-2.25 font-semibold focus-visible:ring-2 focus-visible:ring-sidebar-ring";
const ITEM_ACTIVE = `${ITEM_BASE} bg-sidebar-foreground/[0.14] border-sidebar-primary text-sidebar-foreground`;
const ITEM_IDLE = `${ITEM_BASE} border-transparent text-sidebar-foreground/85 hover:bg-sidebar-foreground/[0.08] hover:text-sidebar-foreground`;
const ITEM_UNAVAILABLE = `${ITEM_BASE} border-transparent text-sidebar-muted-foreground cursor-not-allowed hover:bg-transparent`;

interface NavItem {
  title: string;
  url: string;
  icon?: React.ReactNode;
  isActive?: boolean;
  /** Not built yet. Stays focusable so screen-reader users can discover it. */
  disabled?: boolean;
  tag?: string;
  count?: string;
  items?: {
    title: string;
    url: string;
  }[];
}

const ItemContent = ({ item }: { item: NavItem }) => (
  <>
    <span className="flex-1">{item.title}</span>
    {item.count && (
      <span className="bg-sidebar-foreground/16 text-sidebar-foreground shrink-0 px-1.5 py-0.5 text-xs font-semibold tabular-nums">
        {item.count}
      </span>
    )}
    {item.tag && (
      <span
        aria-hidden="true"
        className="border-sidebar-foreground/25 text-sidebar-muted-foreground shrink-0 border px-1.5 py-0.5 text-xs font-semibold tracking-[0.06em] uppercase"
      >
        {item.tag}
      </span>
    )}
    {item.disabled && <span className="sr-only">(coming soon)</span>}
  </>
);

export const NavMain = ({
  label = "Platform",
  items,
}: {
  label?: string;
  items: NavItem[];
}) => {
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  });
  const { isMobile, setOpenMobile } = useSidebar();

  const isItemActive = (url: string) => {
    if (url === "#") {
      return false;
    }
    return currentPath === url || currentPath.startsWith(`${url}/`);
  };

  // The mobile sidebar is a sheet over the page; close it once a link is
  // followed so the destination isn't hidden behind it.
  const handleNavigate = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <SidebarGroup className="gap-0 px-2.5 py-0">
      <SidebarGroupLabel className="px-2.5 pt-3.5 pb-1.5">
        {label}
      </SidebarGroupLabel>
      <SidebarMenu className="gap-px">
        {items.map((item) => {
          const active = isItemActive(item.url);
          const unavailable = item.disabled || item.url === "#";

          return (
            <Collapsible
              key={item.title}
              defaultOpen={
                item.isActive ||
                item.items?.some((subItem) => isItemActive(subItem.url))
              }
              render={<SidebarMenuItem />}
            >
              {unavailable ? (
                <SidebarMenuButton
                  tooltip={item.title}
                  aria-disabled="true"
                  className={ITEM_UNAVAILABLE}
                >
                  <ItemContent item={item} />
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton
                  tooltip={item.title}
                  isActive={active}
                  className={active ? ITEM_ACTIVE : ITEM_IDLE}
                  render={
                    <Link
                      to={item.url as never}
                      aria-current={active ? "page" : undefined}
                      onClick={handleNavigate}
                    />
                  }
                >
                  <ItemContent item={item} />
                </SidebarMenuButton>
              )}
              {item.items?.length ? (
                <>
                  <CollapsibleTrigger
                    render={
                      <SidebarMenuAction className="aria-expanded:rotate-90" />
                    }
                  >
                    <IconChevronRight />
                    <span className="sr-only">Show {item.title} pages</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.items?.map((subItem) => {
                        const subActive = isItemActive(subItem.url);
                        return (
                          <SidebarMenuSubItem key={subItem.title}>
                            <SidebarMenuSubButton
                              isActive={subActive}
                              render={
                                <Link
                                  to={subItem.url as never}
                                  aria-current={subActive ? "page" : undefined}
                                  onClick={handleNavigate}
                                />
                              }
                            >
                              <span>{subItem.title}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}
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
