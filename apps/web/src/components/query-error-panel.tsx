/**
 * What a read looks like when the read failed.
 *
 * Every list in this app has an empty state, and an empty state is a sentence
 * asserting a fact about the College: "No teachers yet", "No other active
 * sessions." A request that 500s, times out or is refused also produces no rows,
 * so a screen that only asks "is the list empty?" answers yes and prints that
 * sentence — a confident, well-written, false claim about the state of the
 * school. The two states are indistinguishable, so they have to be told apart
 * before either is drawn: this panel is what a failed read looks like, and the
 * empty state is only ever reached on a request that succeeded.
 *
 * The server's own message is passed in rather than swallowed, and `onRetry`
 * must be a real refetch — a retry that re-renders the same cached failure is
 * the same lie wearing a button.
 */
export const QueryErrorPanel = ({
  message,
  note,
  onRetry,
  title,
}: {
  /** The server's message, via `formatApiErrorMessage`. */
  message: string;
  /** Overrides the closing reassurance; the default suits a read. */
  note?: string;
  onRetry: () => void;
  /** What specifically could not be read. Names the subject, not the symptom. */
  title: string;
}) => (
  <div
    className="border-destructive/30 bg-card border px-[22px] py-4"
    role="alert"
  >
    <p className="text-destructive text-sm font-bold">{title}</p>
    <p className="text-primary/65 mt-1 text-[13px]">
      {message} {note ?? "Nothing has been changed — try again."}
    </p>
    <button
      type="button"
      className="border-primary/30 text-primary hover:border-primary mt-3 border px-3 py-1.5 text-xs font-bold transition-colors"
      onClick={onRetry}
    >
      Try again
    </button>
  </div>
);
