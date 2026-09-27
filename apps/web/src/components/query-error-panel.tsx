import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react";
import { useState } from "react";

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
 * It is the app's only failure surface, which is why it is also the app's
 * reference for how a failure is *written*. Three rules, all of them learned
 * the hard way from a version of this file that simply printed
 * `error.message`:
 *
 * 1. **Never a bare error string.** `formatApiErrorMessage` gets most of the
 *    way there, but `error.message` still passes through untouched for anything
 *    that is not a valibot issue, and a thrown `TypeError`, a stack trace or a
 *    raw oRPC payload is a note to a developer, not a sentence for a member of
 *    staff who was in the middle of doing their job. Text like that is
 *    recognised and demoted to a disclosure at the bottom of the panel.
 * 2. **Never swallow it either.** The rule above is about what leads, not about
 *    what is thrown away. Anything demoted or shortened is still in the panel,
 *    in full, behind "Show the full reply" — so a member of staff can copy it
 *    into a message to the office, and a bug is still diagnosable.
 * 3. **Always a way forward.** A retry when the caller can really refetch, and
 *    a page reload when it cannot. A panel that names a problem and then
 *    leaves the reader there has only half said the sentence.
 *
 * The server's own message is passed in rather than swallowed, and `onRetry`
 * must be a real refetch — a retry that re-renders the same cached failure is
 * the same lie wearing a button.
 */

/** Longest plain sentence the panel will lead with before it defers the rest. */
const HEADLINE_LIMIT = 200;

/** Replies that carry no information at all, whatever wrapped them. */
const OPAQUE_MESSAGES = new Set([
  "[object object]",
  "undefined",
  "null",
  "nan",
  "error",
  "failed",
  "{}",
  "[]",
]);

/**
 * Replies that are a developer artefact rather than a sentence: a stack frame,
 * a runtime error class, a bundler path, or a raw oRPC payload.
 *
 * Deliberately narrow. A message that merely *mentions* a URL — "could not
 * reach the server at http://intranet/rpc" — is a perfectly good sentence for a
 * member of staff, so the frame patterns key on what a stack frame actually
 * looks like (a source file with a line number, or a call site with
 * parentheses) rather than on the word "at".
 */
const DEVELOPER_REPLY =
  /\.[cm]?[jt]sx?:\d+(?::\d+)?|\bat\s[\w$.<>[\]]+\s*\(|\bnode_modules\b|\b(?:Type|Range|Reference|Syntax|URI|Network|Axios)Error\b|\bunhandled(?:rejection)?\b|^[[{]|\bcode:\s*["']?[A-Z_]{4,}/u;

const collapse = (raw: string): string => raw.replaceAll(/\s+/gu, " ").trim();

/**
 * Whether the server said something a member of staff could be shown.
 *
 * The length floor is deliberately low — 8 characters, so "Not found." and
 * "Forbidden." are sentences and are led with — and exists only to catch the
 * terse status strings that carry no English at all: `Err 500`, `EACCES`,
 * `null`. Those are caught by `OPAQUE_MESSAGES` or fall under the floor, and
 * either way they end up in the disclosure rather than as the panel's headline.
 */
const isReadable = (text: string): boolean =>
  text.length >= 8 &&
  !OPAQUE_MESSAGES.has(text.toLowerCase()) &&
  !DEVELOPER_REPLY.test(text);

/**
 * Trim to whole sentences rather than mid-word, so a cut panel never ends on
 * "the leave queue could not be loa…".
 */
const toHeadline = (text: string): string => {
  if (text.length <= HEADLINE_LIMIT) {
    return text;
  }
  const clipped = text.slice(0, HEADLINE_LIMIT);
  const stops = [". ", "! ", "? "]
    .map((stop) => clipped.lastIndexOf(stop))
    .filter((index) => index > HEADLINE_LIMIT / 2);
  const lastStop = stops.length > 0 ? Math.max(...stops) : -1;
  const kept = lastStop > -1 ? clipped.slice(0, lastStop + 1) : clipped;
  return `${kept.trimEnd()}…`;
};

/**
 * Run a caller's refetch and report progress, whatever shape it returns.
 *
 * The `catch` is load-bearing, not a swallow. A rejected refetch is not a new
 * failure to invent a sentence for: the query has already recorded it, and the
 * panel it is about to replace is the thing that will re-render with the new
 * message. Letting it escape would put an unhandled rejection in the console of
 * every member of staff who clicks "Try again" on a network that is down.
 *
 * A caller that returns nothing — the current nine, all of which write
 * `void query.refetch()` — gets the busy state for a microtask and is
 * unaffected; a caller that returns the promise keeps the button honest for the
 * length of the request.
 */
const runRetry = async (
  onRetry: () => unknown,
  setBusy: (busy: boolean) => void
) => {
  setBusy(true);
  try {
    await onRetry();
  } catch {
    // Owned by the query, which re-renders this panel or removes it.
  } finally {
    setBusy(false);
  }
};

/** The recovery when there is no refetch to offer: start the page over. */
const reloadThePage = () => {
  window.location.reload();
};

export const QueryErrorPanel = ({
  isRetrying,
  message,
  note,
  onRetry,
  title,
}: {
  /**
   * Whether a retry is in flight. Pass the query's `isFetching` and the button
   * stays honest; a returned promise from `onRetry` gets the same state without
   * it. Left out, the button still works and simply does not report progress.
   */
  isRetrying?: boolean;
  /** The server's message, via `formatApiErrorMessage`. */
  message: string;
  /** Overrides the closing reassurance; the default suits a read. */
  note?: string;
  /**
   * A real refetch. Optional, and the type allows a promise so that
   * `onRetry={() => query.refetch()}` is enough to get the busy state; the
   * existing callers that write `void query.refetch()` keep working untouched.
   * With no refetch to offer, the panel falls back to reloading the page, which
   * is a slower recovery but an honest one.
   */
  onRetry?: () => unknown;
  /** What specifically could not be read. Names the subject, not the symptom. */
  title: string;
}) => {
  const [awaiting, setAwaiting] = useState(false);

  const busy = awaiting || Boolean(isRetrying);
  const full = collapse(message ?? "");
  const readable = isReadable(full);
  const headline = readable ? toHeadline(full) : "";
  /** The reply is there but cannot be shown as a sentence; say so, and show it. */
  const reasonIsUnreadable = !readable && full.length > 0;
  // Whatever is not being led with is still here, in full, for the reader to copy.
  const detail = full === headline ? "" : full;

  return (
    <div
      aria-busy={busy}
      className="border-destructive/30 bg-card border px-[22px] py-4"
      role="alert"
    >
      <div className="flex items-start gap-2.5">
        <IconAlertTriangle
          aria-hidden="true"
          className="text-destructive mt-px size-4 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="text-destructive text-sm font-bold">{title}</p>
          {headline ? (
            <p className="text-primary/75 mt-1 text-[13px] leading-relaxed">
              {headline}
            </p>
          ) : null}
          {reasonIsUnreadable ? (
            <p className="text-primary/75 mt-1 text-[13px] leading-relaxed">
              The reason came back in a form that cannot be read as a sentence.
              The reply itself is below.
            </p>
          ) : null}
          <p className="text-primary/70 mt-1 text-[13px] leading-relaxed">
            {note ?? "Nothing has been changed — try again."}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        {onRetry ? (
          <button
            aria-busy={busy}
            className="border-primary/40 text-primary hover:border-primary hover:bg-primary/5 inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-60"
            disabled={busy}
            onClick={() => {
              void runRetry(onRetry, setAwaiting);
            }}
            type="button"
          >
            <IconRefresh
              aria-hidden="true"
              className="size-3.5 motion-safe:animate-spin"
            />
            {busy ? "Trying again…" : "Try again"}
          </button>
        ) : (
          <button
            className="border-primary/40 text-primary hover:border-primary hover:bg-primary/5 inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-bold transition-colors"
            onClick={reloadThePage}
            type="button"
          >
            <IconRefresh aria-hidden="true" className="size-3.5" />
            Reload the page
          </button>
        )}

        {detail ? (
          <details className="text-primary/70 min-w-0 text-[12.5px]">
            <summary className="cursor-pointer font-semibold">
              Show the full reply
            </summary>
            <p className="border-primary/25 mt-1.5 border-l-2 pl-2.5 break-words">
              {detail}
            </p>
          </details>
        ) : null}
      </div>
    </div>
  );
};
