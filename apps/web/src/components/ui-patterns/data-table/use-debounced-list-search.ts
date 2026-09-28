import { useEffect, useEffectEvent, useState } from "react";

/**
 * Long enough that a fast typist is not firing a request per character, short
 * enough that the list feels like it answered. The default for every list.
 *
 * The reason is the network. Committing the term changes the query key, the route's
 * `loader` re-runs, and nothing in the app sequences those requests — so an earlier
 * response can land after a later one and repaint the list with the rows for a term
 * the user has already finished typing. Holding the term for 300 ms collapses a
 * typed word into one request and removes the race with it.
 */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * The search box's two values, kept apart.
 *
 * `draft` is what is in the box and changes on every keystroke; `value` is what the
 * server was actually asked for and lives in the URL. They must not be the same
 * variable: repainting the box from the committed value while somebody is halfway
 * through replacing a term makes the term they are typing disappear under the caret.
 *
 * Re-synced **during render** rather than in an effect, which is what the
 * "committed value changed" case needs — a shared link, a Back button, a "clear
 * filters" button. An effect would paint one frame showing the previous term while
 * the list is already filtered by the new one, and a search box showing something
 * the list is not filtered by looks exactly like a search that failed.
 */
export const useDebouncedListSearch = (
  value: string,
  onCommit: (next: string) => void,
  delayMs: number = SEARCH_DEBOUNCE_MS
) => {
  const [draft, setDraft] = useState(value);
  const [committed, setCommitted] = useState(value);

  if (value !== committed) {
    setCommitted(value);
    setDraft(value);
  }

  /**
   * `onCommit` is read through an effect event so the timer is not torn down and
   * restarted on every re-render with a new callback identity. Restarting on every
   * render would mean the timer never fires on a busy page — the search would stop
   * working, intermittently.
   */
  const commit = useEffectEvent((next: string) => {
    onCommit(next);
  });

  useEffect(() => {
    if (draft === value) {
      return;
    }

    const timeout = setTimeout(() => commit(draft), delayMs);
    return () => clearTimeout(timeout);
  }, [delayMs, draft, value]);

  return { draft, setDraft };
};
