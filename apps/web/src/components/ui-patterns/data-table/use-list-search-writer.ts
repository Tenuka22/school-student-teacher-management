import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

/**
 * The one place a list's search params are written.
 *
 * Shared because it is the same for every list and it is easy to get subtly wrong
 * three times in three slightly different ways: a literal `search` object drops the
 * params the page does not own (a sibling page's tab, the year), no `replace` turns
 * a search box into one Back entry per letter, and a write that forgets to re-parse
 * the previous value stacks a patch on top of a hand-edited URL.
 *
 * The read is *not* here, deliberately. A surface either takes its validated params
 * as a prop from its own route (which is what the accounts list does, because the
 * route file and the page would otherwise import each other) or reads them with
 * `useSearch({ strict: false })` (which is what the equipment pages do). Both
 * produce the same object this hook writes back.
 */
export const useListSearchWriter = <TSearch extends object>(
  validate: (raw: Record<string, unknown>) => TSearch,
  toParams: (search: TSearch) => Record<string, string | undefined>
) => {
  const navigate = useNavigate();

  /**
   * A functional `search` update, so the params this list does not own survive.
   *
   * `replace` is the default and paging is the exception, because the two have
   * opposite histories: a search term is committed on a timer as somebody types and
   * must not leave one Back step per letter, while a page is a place somebody was at
   * and expects Back to return them to.
   *
   * The previous value is re-parsed rather than trusted, so a patch written on top
   * of a hand-edited URL produces a valid one.
   */
  return useCallback(
    (patch: Partial<TSearch>, options?: { replace?: boolean }) => {
      void navigate({
        search: ((previous: Record<string, unknown>) =>
          toParams({
            ...validate(previous),
            ...patch,
          })) as never,
        replace: options?.replace ?? true,
      });
    },
    [navigate, toParams, validate]
  );
};
