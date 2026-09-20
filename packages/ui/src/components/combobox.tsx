"use client";

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { IconCheck, IconChevronDown, IconX } from "@tabler/icons-react";
import { cn } from "cn";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "./input-group";

const Combobox = ComboboxPrimitive.Root;

const ComboboxValue = ({ ...props }: ComboboxPrimitive.Value.Props) => (
  <ComboboxPrimitive.Value data-slot="combobox-value" {...props} />
);

const ComboboxTrigger = ({
  className,
  children,
  ...props
}: ComboboxPrimitive.Trigger.Props) => (
  <ComboboxPrimitive.Trigger
    data-slot="combobox-trigger"
    className={cn("[&_svg:not([class*='size-'])]:size-4", className)}
    {...props}
  >
    {children}
    <IconChevronDown className="text-muted-foreground pointer-events-none size-4" />
  </ComboboxPrimitive.Trigger>
);

const ComboboxClear = ({
  className,
  ...props
}: ComboboxPrimitive.Clear.Props) => (
  <ComboboxPrimitive.Clear
    data-slot="combobox-clear"
    render={<InputGroupButton variant="ghost" size="icon-xs" />}
    className={cn(className)}
    {...props}
  >
    <IconX className="pointer-events-none" />
  </ComboboxPrimitive.Clear>
);

const ComboboxInput = ({
  className,
  children,
  disabled = false,
  showTrigger = true,
  showClear = false,
  ...props
}: ComboboxPrimitive.Input.Props & {
  showTrigger?: boolean;
  showClear?: boolean;
}) => (
  <InputGroup className={cn("w-auto", className)}>
    <ComboboxPrimitive.Input
      render={<InputGroupInput disabled={disabled} />}
      {...props}
    />
    <InputGroupAddon align="inline-end">
      {showTrigger && (
        <InputGroupButton
          size="icon-xs"
          variant="ghost"
          render={<ComboboxTrigger />}
          data-slot="input-group-button"
          className="group-has-data-[slot=combobox-clear]/input-group:hidden data-pressed:bg-transparent"
          disabled={disabled}
        />
      )}
      {showClear && <ComboboxClear disabled={disabled} />}
    </InputGroupAddon>
    {children}
  </InputGroup>
);

const ComboboxContent = ({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  anchor,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    "side" | "align" | "sideOffset" | "alignOffset" | "anchor"
  >) => (
  <ComboboxPrimitive.Portal>
    <ComboboxPrimitive.Positioner
      side={side}
      sideOffset={sideOffset}
      align={align}
      alignOffset={alignOffset}
      anchor={anchor}
      className="isolate z-50"
    >
      <ComboboxPrimitive.Popup
        data-slot="combobox-content"
        data-chips={!!anchor}
        className={cn(
          "group/combobox-content bg-popover text-popover-foreground ring-foreground/10 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 *:data-[slot=input-group]:border-input/30 *:data-[slot=input-group]:bg-input/30 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 relative max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) min-w-[calc(var(--anchor-width)+--spacing(7))] origin-(--transform-origin) overflow-hidden rounded-lg shadow-md ring-1 duration-100 data-[chips=true]:min-w-(--anchor-width) *:data-[slot=input-group]:m-1 *:data-[slot=input-group]:mb-0 *:data-[slot=input-group]:h-8 *:data-[slot=input-group]:shadow-none",
          className
        )}
        {...props}
      />
    </ComboboxPrimitive.Positioner>
  </ComboboxPrimitive.Portal>
);

const ComboboxList = ({
  className,
  ...props
}: ComboboxPrimitive.List.Props) => (
  <ComboboxPrimitive.List
    data-slot="combobox-list"
    className={cn(
      "no-scrollbar max-h-[min(calc(--spacing(72)---spacing(9)),calc(var(--available-height)---spacing(9)))] scroll-py-1 overflow-y-auto overscroll-contain p-1 data-empty:p-0",
      className
    )}
    {...props}
  />
);

const ComboboxItem = ({
  className,
  children,
  ...props
}: ComboboxPrimitive.Item.Props) => (
  <ComboboxPrimitive.Item
    data-slot="combobox-item"
    className={cn(
      "data-highlighted:bg-accent data-highlighted:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
      className
    )}
    {...props}
  >
    {children}
    <ComboboxPrimitive.ItemIndicator
      render={
        <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
      }
    >
      <IconCheck className="pointer-events-none" />
    </ComboboxPrimitive.ItemIndicator>
  </ComboboxPrimitive.Item>
);

const ComboboxGroup = ({
  className,
  ...props
}: ComboboxPrimitive.Group.Props) => (
  <ComboboxPrimitive.Group
    data-slot="combobox-group"
    className={cn(className)}
    {...props}
  />
);

const ComboboxLabel = ({
  className,
  ...props
}: ComboboxPrimitive.GroupLabel.Props) => (
  <ComboboxPrimitive.GroupLabel
    data-slot="combobox-label"
    className={cn("text-muted-foreground px-2 py-1.5 text-xs", className)}
    {...props}
  />
);

const ComboboxCollection = ({
  ...props
}: ComboboxPrimitive.Collection.Props) => (
  <ComboboxPrimitive.Collection data-slot="combobox-collection" {...props} />
);

const ComboboxEmpty = ({
  className,
  ...props
}: ComboboxPrimitive.Empty.Props) => (
  <ComboboxPrimitive.Empty
    data-slot="combobox-empty"
    className={cn(
      "text-muted-foreground hidden w-full justify-center py-2 text-center text-sm group-data-empty/combobox-content:flex",
      className
    )}
    {...props}
  />
);

const ComboboxSeparator = ({
  className,
  ...props
}: ComboboxPrimitive.Separator.Props) => (
  <ComboboxPrimitive.Separator
    data-slot="combobox-separator"
    className={cn("bg-border -mx-1 my-1 h-px", className)}
    {...props}
  />
);

export {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxSeparator,
  ComboboxTrigger,
  ComboboxValue,
  ComboboxClear,
};
