import { Toaster as Sonner, type ToasterProps } from "sonner"
import {
  IconCircleCheck,
  IconInfoCircle,
  IconAlertTriangle,
  IconAlertOctagon,
  IconLoader,
} from "@tabler/icons-react"

/**
 * The default lifetime of a toast, in milliseconds.
 *
 * Sonner's own default is 4000. Four seconds is enough for "Saved." and not
 * enough for the sentence an administrator actually needs — the name of the
 * record that could not be deleted, or the permission they are missing. 6000
 * plus a close button means the message can be read and kept.
 *
 * Errors are the case that really wants to stay: a failed mutation that
 * disappears before it is read is a failed mutation the user will run again.
 * `Toaster` cannot set a duration per type, so an error toast should be raised
 * as `toast.error(message, { duration: Infinity })` and dismissed deliberately.
 * That is a call-site decision, not one this component can make for 200 files.
 */
const TOAST_DURATION_MS = 6000

/**
 * The whole colour system a toast can be painted in, as custom properties.
 *
 * `richColors` is switched on at the call site (`<Toaster richColors />` in
 * `__root.tsx`), and that repaints each toast from a palette belonging to the
 * Sonner library. **Measured against its own light values, all four of them
 * fail WCAG AA for 12px body text:**
 *
 * | type    | sonner's text  | on sonner's bg | ratio  | AA   |
 * | ------- | -------------- | -------------- | ------ | ---- |
 * | success | `hsl(140 100% 27%)` | `hsl(143 85% 96%)`  | 4.29:1 | fail |
 * | info    | `hsl(210 92% 45%)`  | `hsl(208 100% 97%)` | 4.35:1 | fail |
 * | warning | `hsl(31 92% 45%)`   | `hsl(49 100% 97%)`  | 3.08:1 | fail |
 * | error   | `hsl(360 100% 45%)` | `hsl(359 100% 97%)` | 4.35:1 | fail |
 *
 * A 12px toast is not large text under WCAG, so 4.5:1 is the floor, and the
 * warning — the one that says "at reorder level" or "under repair" — misses it
 * by a mile. A success toast is the last thing anyone wants to be unsure about.
 *
 * So the palette is replaced wholesale, with this College's own tokens and
 * nothing borrowed. Every figure below is measured the same way, against the
 * exact ground the text sits on:
 *
 * | type    | ink             | fill                              | ratio  |
 * | ------- | --------------- | --------------------------------- | ------ |
 * | normal  | `--popover-foreground` on `--popover` | `#fffdf6`            | 13.80:1 |
 * | success | `--success`     | `--success` 10% over `--popover`   | 6.78:1 |
 * | info    | `--foreground`  | `--muted`                          | 12.42:1 |
 * | warning | `--warning-ink` | `--accent` 20% over `--popover`    | 5.65:1  |
 * | error   | `--destructive` | `--destructive` 10% over `--popover` | 6.29:1 |
 *
 * `in srgb` in the mixes is deliberate: it is plain per-channel compositing, so
 * the arithmetic in `globals.css` for `bg-accent/20` (rgb 255,238,197) is the
 * arithmetic here, and the two documents cannot drift apart. An `oklab` mix of
 * two opaque colours is a slightly different colour with no written-down
 * luminance, which is exactly how a contrast figure stops being checkable.
 *
 * `--warning-ink` rather than `--gold` for the same reason the badges use it:
 * this is small text, and gold on an amber-tinted ground is 3.45:1.
 *
 * These land on the toaster `<ol>` as inline styles, which beat the library's
 * stylesheet, so they hold whatever `richColors` is set to.
 */
const TOAST_COLORS = {
  "--normal-bg": "var(--popover)",
  "--normal-text": "var(--popover-foreground)",
  "--normal-border": "var(--border)",
  "--success-bg": "color-mix(in srgb, var(--success) 10%, var(--popover))",
  "--success-border": "color-mix(in srgb, var(--success) 30%, var(--popover))",
  "--success-text": "var(--success)",
  "--info-bg": "var(--muted)",
  "--info-border": "var(--border)",
  "--info-text": "var(--foreground)",
  "--warning-bg": "color-mix(in srgb, var(--accent) 20%, var(--popover))",
  "--warning-border": "color-mix(in srgb, var(--accent) 50%, var(--popover))",
  "--warning-text": "var(--warning-ink)",
  "--error-bg": "color-mix(in srgb, var(--destructive) 10%, var(--popover))",
  "--error-border":
    "color-mix(in srgb, var(--destructive) 30%, var(--popover))",
  "--error-text": "var(--destructive)",
  "--border-radius": "var(--radius)",
}

/**
 * Icon colour, so the type survives without `richColors`.
 *
 * The library tints the whole surface when `richColors` is on and leaves the
 * glyph in the toast's own ink when it is off. These pin the glyph either way,
 * which means the state is carried by three channels at once — hue, glyph
 * shape, and the word in the toast — and the surface colour is not load-bearing
 * for anything.
 */
const TYPE_ICON_COLORS = {
  success: "[&_[data-icon]]:[&>svg]:text-success",
  info: "[&_[data-icon]]:[&>svg]:text-foreground",
  warning: "[&_[data-icon]]:[&>svg]:text-warning-ink",
  error: "[&_[data-icon]]:[&>svg]:text-destructive",
  loading: "[&_[data-icon]]:[&>svg]:text-muted-foreground",
} as const

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      /*
       * Light, always. The product is light-only by decision — `globals.css`
       * documents that there is deliberately no dark palette — so following the
       * operating system's preference here would render Sonner's dark chrome,
       * and its dark rich-colour values, over a light-only app on any staff
       * machine set to dark.
       */
      theme="light"
      className="toaster group"
      duration={TOAST_DURATION_MS}
      /*
       * A close affordance on every toast. Auto-dismiss is a convenience, not a
       * dismissal: a message that vanishes on a timer is a message the user
       * cannot keep, cannot read twice, and cannot send to a colleague. The
       * button is Sonner's own, so it sits inside the live region and is
       * keyboard reachable — each toast is `tabIndex={0}`.
       */
      closeButton
      icons={{
        /*
         * `role="img"` with a name, not `aria-hidden`. Sonner puts the toast
         * list in an `aria-live="polite"` region and announces the whole added
         * `<li>`; with the glyph hidden the announcement is the title and
         * description and nothing says whether it succeeded or failed. Naming
         * the glyph puts the state in the announcement, and the shape is already
         * doing that work for everyone else.
         */
        success: <IconCircleCheck aria-label="Success" role="img" />,
        info: <IconInfoCircle aria-label="Information" role="img" />,
        warning: <IconAlertTriangle aria-label="Warning" role="img" />,
        error: <IconAlertOctagon aria-label="Error" role="img" />,
        loading: <IconLoader aria-label="In progress" role="img" />,
      }}
      style={TOAST_COLORS as React.CSSProperties}
      toastOptions={{
        classNames: {
          toast: "cn-toast",
          ...TYPE_ICON_COLORS,
        },
        closeButtonAriaLabel: "Dismiss notification",
      }}
      {...props}
    />
  )
}

export { Toaster }
