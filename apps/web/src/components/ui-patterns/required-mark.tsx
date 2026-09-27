/**
 * Visible "Required" marker for a field label. Screen readers get the same
 * information from `aria-required` on the control, so this text is hidden
 * from them to avoid announcing it twice.
 */
export const RequiredMark = () => (
  <span
    aria-hidden="true"
    className="text-muted-foreground text-sm font-normal tracking-normal normal-case"
  >
    (required)
  </span>
);
