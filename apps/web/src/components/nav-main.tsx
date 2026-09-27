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
import { useNavigate, useRouterState } from "@tanstack/react-router";

/**
 * How the current page says so.
 *
 * `aria-current="page"` is the only part of this that a screen-reader user can
 * perceive — everything else below is colour and weight, and colour is the part
 * that fails in sunlight, in a projector, and for the colleagues who need it.
 * It is the same choice `TeacherTabLink` makes, and for the same reason: a
 * `Link` would decide `aria-current` from its own prefix matching, which would
 * light every ancestor of the current path at once.
 *
 * The row is filled with the sidebar's own foreground (`--sidebar-foreground`,
 * cream) rather than marked with a coloured rule. On the deep green ground that
 * is 13.27:1 in both directions — the fill against the sidebar, and the deep
 * green label against the fill — where a translucent overlay over green tops
 * out around 1.6:1 and cannot be told apart from a hover. It is also one
 * selection treatment instead of a bar, a tint and a weight, which is what
 * "one vocabulary, screen to screen" costs when a shell has twenty rows in it.
 *
 * The `!` suffix is load-bearing rather than defensive: the base
 * `SidebarMenuButton` ships its own `data-active:` and `hover:` background
 * utilities, and a data variant or a `:hover` selector outranks a plain class on
 * specificity. These two states are owned here, not by the component default.
 */
const activeRowClass =
  "bg-sidebar-foreground! text-sidebar-primary-foreground! font-semibold hover:bg-sidebar-foreground!";

const restingRowClass =
  "text-sidebar-foreground/85 font-medium hover:bg-sidebar-foreground/10! hover:text-sidebar-foreground!";

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
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const navigateTo = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();

  // The mobile sidebar is a sheet over the page; close it once a link is
  // followed so the destination isn't hidden behind it.
  const navigate: typeof navigateTo = (opts) => {
    if (isMobile) {
      setOpenMobile(false);
    }
    return navigateTo(opts);
  };

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
      {/*
        `/60` rather than `/40`. The section name is the only thing telling a
        member of staff which of five groups they are in, and at 12px
        extrabold it is small text, so it needs 4.5:1: cream at 40% over the
        deep green is 3.31:1, at 60% it is 5.66:1.

        It is a `div`, not a heading. A heading here would put a second `<h2>`
        level in every page's outline, above whatever the page itself leads
        with, and the shell is not allowed to own the page's heading order.
      */}
      <SidebarGroupLabel className="text-sidebar-foreground/60 px-2.5 pt-3.5 pb-1.5 text-xs font-extrabold tracking-[0.18em]">
        {label}
      </SidebarGroupLabel>
      {/*
        `aria-label` on the list is what names each group to a screen reader;
        the visible label above is a `div`, so it contributes nothing but
        pixels. `SidebarMenu` is a `<ul>`, so this is a real grouped list of
        destinations, not a stack of unlabelled links.
      */}
      <SidebarMenu aria-label={label} className="gap-px">
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
              {/*
                `isActive` is deliberately not passed. It would put
                `data-active` on the button, whose `data-active:` background
                utilities outrank anything set here — and `aria-current` below
                already carries the state for anything that is not looking at
                pixels, so `isActive` would only be a second answer to the same
                question.
              */}
              <SidebarMenuButton
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? `${activeRowClass} py-2.5 pl-2.25`
                    : `${restingRowClass} py-2.5 pl-2.25`
                }
                disabled={item.disabled}
                tooltip={item.title}
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
                  <span
                    className={
                      active
                        ? "bg-sidebar-primary-foreground/12 text-sidebar-primary-foreground shrink-0 px-1.5 py-0.5 font-mono text-xs"
                        : "bg-sidebar-foreground/16 text-sidebar-foreground shrink-0 px-1.5 py-0.5 font-mono text-xs"
                    }
                  >
                    {item.count}
                  </span>
                )}
                {item.tag && (
                  <span
                    className={
                      active
                        ? "border-sidebar-primary-foreground/40 text-sidebar-primary-foreground shrink-0 border px-1.5 py-0.5 text-xs font-extrabold tracking-wider"
                        : "border-sidebar-foreground/30 text-sidebar-foreground/60 shrink-0 border px-1.5 py-0.5 text-xs font-extrabold tracking-wider"
                    }
                  >
                    {item.tag}
                  </span>
                )}
              </SidebarMenuButton>
              {item.items?.length ? (
                <>
                  {/*
                    `base-ui`'s trigger sets `aria-expanded` and `aria-controls`
                    itself, so the disclosure state is announced without this
                    component tracking it. The name has to come from somewhere
                    though, and a chevron plus the word "Toggle" told a screen
                    reader nothing about *what* toggles; the chevron itself is
                    decoration on a control that already carries a state.
                  */}
                  <CollapsibleTrigger
                    render={
                      <SidebarMenuAction className="aria-expanded:rotate-90" />
                    }
                  >
                    <IconChevronRight aria-hidden="true" />
                    <span className="sr-only">{`${item.title} submenu`}</span>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.items?.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.title}>
                          {/*
                            Rendered as a real `<button>`: `SidebarMenuSubButton`
                            defaults to an `<a>` with no `href`, which is not a
                            link and is not focusable, so the whole submenu was
                            unreachable by keyboard.
                          */}
                          <SidebarMenuSubButton
                            aria-current={
                              isItemActive(subItem.url) ? "page" : undefined
                            }
                            className={
                              isItemActive(subItem.url)
                                ? "bg-sidebar-foreground! text-sidebar-primary-foreground! font-semibold"
                                : "text-sidebar-foreground/85 font-medium"
                            }
                            onClick={() => {
                              navigate({ to: subItem.url as never });
                            }}
                            render={
                              <button
                                aria-label={subItem.title}
                                type="button"
                              />
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
