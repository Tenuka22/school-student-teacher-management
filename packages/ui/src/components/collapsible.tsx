import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"
import { cn } from "cn"

/**
 * A disclosure.
 *
 * The trigger is a real `<button>` that `@base-ui/react` gives `aria-expanded`
 * and `aria-controls`, pointing at the panel's generated id, and the panel is
 * `hidden` while closed. So the open/closed state is announced without this
 * component tracking a single thing — which is the right division of labour,
 * because a disclosure that only *looks* open is the common failure.
 *
 * The reveal is a 150ms fade and nothing more. A height animation needs
 * `overflow: hidden` on the panel, and an `overflow: hidden` ancestor is exactly
 * what clips a dropdown menu, a tooltip or a combobox list rendered inside a
 * disclosure — which is where the sidebar's year switcher and account menu live.
 * Motion is not worth a clipped menu; the state change is already in the
 * accessibility tree.
 */
function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

/**
 * The control that opens and closes the panel. Give it a name in text: a
 * chevron and the word "Toggle" tell a screen reader nothing about *what*
 * toggles.
 */
function CollapsibleTrigger({ ...props }: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />
  )
}

function CollapsibleContent({
  className,
  ...props
}: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      className={cn(
        "transition-opacity duration-150 data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:transition-none",
        className
      )}
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
