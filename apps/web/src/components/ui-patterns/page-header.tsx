import type { ReactNode } from "react";

interface PageHeaderProps {
  /** Short uppercase context label above the title, e.g. "Staff management". */
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Page-level actions (buttons/links). They wrap below the title on narrow screens. */
  actions?: ReactNode;
}

/**
 * The one page heading used across the signed-in app: eyebrow, `<h1>`,
 * optional description and an actions slot.
 *
 * Typography comes from the `type-*` roles in the UI package's globals.css:
 * Cormorant for the title, Manrope for everything around it.
 */
export const PageHeader = ({
  eyebrow,
  title,
  description,
  actions,
}: PageHeaderProps) => (
  <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
    <div className="min-w-0 flex-1 basis-80">
      {eyebrow ? (
        <p className="text-gold-text type-eyebrow m-0">{eyebrow}</p>
      ) : null}
      <h1 className="text-foreground type-page-title m-0 mt-1.5">{title}</h1>
      {description ? (
        <p className="text-muted-foreground type-body m-0 mt-2 max-w-prose">
          {description}
        </p>
      ) : null}
    </div>
    {actions ? (
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    ) : null}
  </header>
);
