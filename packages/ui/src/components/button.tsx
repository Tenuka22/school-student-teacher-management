import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { IconLoader } from "@tabler/icons-react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center rounded-none border border-transparent bg-clip-padding text-xs font-medium whitespace-nowrap transition-[background-color,color,border-color,box-shadow,translate] duration-150 outline-none select-none motion-reduce:transition-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:inset-ring-1 focus-visible:inset-ring-current active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:not-data-[loading]:opacity-50 data-[loading]:cursor-wait data-[loading]:text-transparent aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/30 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // A solid fill with no edge. `secondary` and `destructive` are tinted
        // fills, so all three are separated by hue *and* by weight.
        default:
          "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-hover",
        // An edge and no fill. Distinguishable from `ghost` without relying on
        // the border colour surviving a colour-blind filter.
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground active:bg-muted aria-expanded:bg-muted aria-expanded:text-foreground",
        // A tinted fill plus an inset hairline, so it never reads as `ghost`
        // on the cream page where `bg-secondary` is almost the page colour.
        secondary:
          "bg-secondary text-secondary-foreground shadow-[inset_0_0_0_1px_var(--border)] hover:bg-muted active:bg-muted aria-expanded:bg-muted aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground active:bg-muted aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:border-destructive/50 active:bg-destructive/30 focus-visible:border-destructive/40 focus-visible:ring-destructive/30",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-none px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3 [&_[data-slot=button-spinner]]:size-3",
        sm: "h-7 gap-1 rounded-none px-2.5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-none [&_svg:not([class*='size-'])]:size-3 [&_[data-slot=button-spinner]]:size-3",
        "icon-sm": "size-7 rounded-none",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  focusableWhenDisabled,
  disabled,
  children,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    /**
     * Puts the button into its async state: it stops accepting activation (so
     * a second submit cannot reach the server), tells assistive technology the
     * region is busy, and swaps the label for a spinner of the same footprint
     * so the surrounding layout does not move. Focus is deliberately kept on
     * the button, because a submit that disables the button it was pressed
     * from would otherwise drop keyboard focus onto `<body>`.
     */
    loading?: boolean
  }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-size={size}
      data-loading={loading || undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      focusableWhenDisabled={loading ? true : focusableWhenDisabled}
      aria-busy={loading || undefined}
      {...props}
    >
      {children}
      {loading ? (
        <span
          aria-hidden="true"
          data-slot="button-spinner"
          className="pointer-events-none absolute inset-0 m-auto size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
        >
          <IconLoader className="size-full" />
        </span>
      ) : null}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
