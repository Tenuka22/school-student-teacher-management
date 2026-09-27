import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { IconLoader } from "@tabler/icons-react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-none border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        outline:
          "border-input bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[inset_0_0_0_1px_var(--border)] hover:bg-muted active:bg-muted aria-expanded:bg-muted aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground active:bg-muted aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:border-destructive/50 active:bg-destructive/30 focus-visible:border-destructive/40 focus-visible:ring-destructive/30",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // 36px controls, 40px where the pointer is a finger. `xs` and the
        // small icon sizes stay at or above the 24px WCAG 2.5.8 minimum.
        default:
          "h-9 gap-1.5 px-3.5 pointer-coarse:h-10 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-6 gap-1 rounded-none px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 rounded-none px-2.5 text-sm pointer-coarse:h-9 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-9 pointer-coarse:size-10",
        "icon-xs": "size-6 rounded-none [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-none pointer-coarse:size-9",
        "icon-lg": "size-10",
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
