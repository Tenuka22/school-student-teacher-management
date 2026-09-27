import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/**
 * The tab set.
 *
 * Semantics come from `@base-ui/react` and are not re-implemented here: the list
 * is `role="tablist"`, each trigger is `role="tab"` with `aria-selected`, each
 * panel is `role="tabpanel"` with `aria-labelledby` pointing back at its tab,
 * only the selected tab is in the tab order (roving `tabindex`), and arrow keys,
 * `Home`, `End` and `Delete` move between them.
 *
 * **Deep-linking.** `value` / `defaultValue` / `onValueChange` are passed
 * straight through, so the tabs can be driven by the URL rather than by
 * component state. The inventory register does exactly that: its six views are
 * one route with a `?tab=` search param, so `value` is the param and
 * `onValueChange` writes it. Nothing in this component holds a tab selection of
 * its own, and nothing should be added that does — a second source of truth for
 * "which view is open" is exactly how a shared link stops reproducing what the
 * sender was looking at.
 */
function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-none p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

/**
 * One tab.
 *
 * The resting label is `text-foreground/70`, not the incumbent's
 * `text-foreground/60`: 60% of the brand green over the tab strip measures
 * **4.02:1**, which fails AA at 12px, and a tab label is text, not a hint. At
 * 70% it is 5.03:1 on `--muted` and 5.59:1 on the transparent `line` variant.
 * The selected tab is full `--foreground` (13.8:1), so the two states are 5:1
 * apart in luminance as well as different in fill — the selection is legible
 * without reading the colour.
 */
function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-none border border-transparent px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-foreground/70 transition-colors group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start group-data-vertical/tabs:py-[calc(--spacing(1.25))] hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "data-active:bg-background data-active:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        "motion-reduce:after:transition-none",
        className
      )}
      {...props}
    />
  )
}

/**
 * One tab's panel. Unmounted while inactive unless the caller asks for
 * `keepMounted`, so a hidden tab is not a live region and not in the tab order.
 */
function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn(
        "flex-1 text-xs/relaxed outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className
      )}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
