import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/**
 * The status vocabulary, in one place.
 *
 * A badge is the densest piece of state in this app — the inventory register
 * puts one on every row — and a status the colour carries alone is a status
 * half the users cannot read. So every variant here is a *fill plus a border
 * plus ink*, and the word in the badge is always the real signal. The variants
 * exist so that a state is written the same way in all twenty feature folders
 * rather than re-derived as a `className` at each call site.
 *
 * Measured against `--card` (#fffdf6), which is what a badge in a table row
 * actually sits on. The arithmetic is in `globals.css`.
 *
 * | variant      | ink              | fill              | ratio  |
 * | ------------ | ---------------- | ----------------- | ------ |
 * | `default`    | `--primary-foreground` | `--primary` | 13.27:1 |
 * | `secondary`  | `--secondary-foreground` | `--secondary` | 12.42:1 |
 * | `outline`    | `--foreground`   | none              | 13.80:1 |
 * | `ghost`      | `--foreground` on hover | `--muted`  | 12.42:1 |
 * | `link`       | `--primary`      | none              | 13.80:1 |
 * | `destructive`| `--destructive`  | `--destructive/10`| 6.29:1  |
 * | `warning`    | `--warning-ink`  | `--accent/20`     | 5.65:1  |
 * | `success`    | `--success`      | `--success/10`    | 6.78:1  |
 *
 * `warning` is the important one. It is the register's `Borrowed` state — the
 * single most important state in the product — and the fill it uses,
 * `bg-accent/20`, is exactly the ground on which `--gold` measures 3.45:1 and
 * fails AA. `--warning-ink` on that same fill is 5.65:1. Use this variant
 * rather than `text-gold`; the two tokens coexist on purpose and `--gold` is
 * not wrong everywhere, only wrong as small text.
 */
const badgeVariants = cva(
  "group/badge inline-flex h-5.5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-none border border-transparent px-2 py-0.5 text-xs font-semibold tracking-[0.01em] whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 [a]:hover:bg-destructive/20",
        /** No fill: a hairline edge and the ink. 13.80:1 on `--card`. */
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-foreground",
        /*
         * `text-foreground`, not `text-muted-foreground`: the ghost badge's own
         * hover fill is `--muted`, and muted ink on muted ground measures
         * 3.13:1 — under AA for a 12px label. Foreground on muted is 12.42:1.
         */
        ghost: "hover:bg-muted hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        /** Confirmed, in hand, returned. `--success` is not the brand green. */
        success:
          "border-success/30 bg-success/10 text-success focus-visible:ring-success/20 [a]:hover:bg-success/20",
        /**
         * Needs attention or is out on loan — the register's `Borrowed` and
         * `Under Repair`, the "At reorder level" row. The fill stays on
         * `--accent/20` because a surface can be as light as it likes; only the
         * ink has a legibility floor, and that is `--warning-ink`.
         */
        warning:
          "border-accent/50 bg-accent/20 text-warning-ink focus-visible:ring-accent/40 [a]:hover:bg-accent/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

/**
 * A status chip.
 *
 * `render` is Base UI's element swap, so a badge can become a link or a button
 * and keep the same variants. The child `<svg>` is sized at 12px automatically,
 * and a `data-icon="inline-start" | "inline-end"` wrapper tightens the matching
 * padding — which is how a badge carries an icon *as well as* the word, so the
 * state is never the colour on its own.
 */
function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
