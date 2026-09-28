import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { functionalUpdate } from "@tanstack/react-table";
import type {
  OnChangeFn,
  PaginationState,
  RowSelectionState,
  SortingState,
} from "@tanstack/react-table";
import { useCallback, useState } from "react";

import {
  searchToPagination,
  searchToSorting,
} from "@/components/ui-patterns/data-table/list-search";
import { useListSearchWriter } from "@/components/ui-patterns/data-table/use-list-search-writer";
import { orpc } from "@/utils/orpc";

import {
  DEFAULT_TEACHER_SORT,
  hasTeacherFilters,
  TEACHER_SORT_KEYS,
  toListTeachersInput,
  toTeachersSearchParams,
  validateTeachersSearch,
} from "./teachers-search";
import type { TeachersSearch } from "./teachers-search";

const isSortableKey = (
  value: string
): value is (typeof TEACHER_SORT_KEYS)[number] =>
  TEACHER_SORT_KEYS.some((key) => key === value);

/**
 * The register's data and its list state, which is the URL.
 *
 * `search` is the route's validated params, handed in rather than read here: this
 * hook must not import the route file, because the route imports the page and the
 * page imports this.
 *
 * The table then receives sorting and pagination **as props** and reports changes
 * through callbacks that write the URL. That is the only arrangement in which all
 * three of these are true at once, and each rules out the alternatives: the server
 * has been told (the route's `loader` turns these params into `listTeachers`'
 * input and fetches before the page is sent), the table cannot drift from the data
 * (with `manualSorting` and `manualPagination`, a sorting state the table owned
 * would reorder nothing — the rows arrive in the order the query asked for), and the
 * list survives a refresh, a shared link and the Back button.
 *
 * The row selection is the one piece of state here that is **not** in the URL: a
 * ticked row is a thing somebody is about to do, not a question about the school.
 */
export const useTeachersRegister = (search: TeachersSearch) => {
  const queryClient = useQueryClient();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const writeSearch = useListSearchWriter<TeachersSearch>(
    validateTeachersSearch,
    toTeachersSearchParams
  );

  /**
   * The list state, in the shape TanStack Table speaks — derived, never stored, so
   * there is exactly one copy of it and it is the URL.
   */
  const sorting = searchToSorting(search);
  const pagination = searchToPagination(search);

  /**
   * Every change to *what is listed* returns to the first page and drops the
   * selection: page 6 of a search that now matches four teachers is an empty
   * register, which reads as "no teachers match" and is a statement about the
   * school. Paging changes neither, because there the page is the thing being
   * changed on purpose.
   */
  const onSortingChange = useCallback<OnChangeFn<SortingState>>(
    (updater) => {
      const [column] = functionalUpdate(updater, searchToSorting(search));

      writeSearch({
        sort:
          column && isSortableKey(column.id) ? column.id : DEFAULT_TEACHER_SORT,
        dir: column?.desc ? "desc" : "asc",
        page: 1,
      });
      setRowSelection({});
    },
    [search, writeSearch]
  );

  const onPaginationChange = useCallback<OnChangeFn<PaginationState>>(
    (updater) => {
      const next = functionalUpdate(updater, searchToPagination(search));

      writeSearch(
        { page: next.pageIndex + 1, size: next.pageSize },
        { replace: false }
      );
      setRowSelection({});
    },
    [search, writeSearch]
  );

  const onRowSelectionChange = useCallback<OnChangeFn<RowSelectionState>>(
    (updater) => {
      setRowSelection(updater);
    },
    [setRowSelection]
  );

  const onSearchChange = useCallback(
    (value: string) => writeSearch({ q: value, page: 1 }),
    [writeSearch]
  );

  const onResetSearch = useCallback(() => {
    writeSearch({ q: "", page: 1 });
    setRowSelection({});
  }, [writeSearch]);

  const registerQuery = useQuery(
    orpc.staff.listTeachers.queryOptions({
      input: toListTeachersInput(search),
      /*
       * The previous page stays on screen while the next one is fetched. Without it,
       * a page change empties the register for the length of a round trip, and "no
       * teachers" is what an administrator reads in that gap.
       */
      placeholderData: keepPreviousData,
    })
  );

  return {
    teachers: registerQuery.data?.teachers,
    total: registerQuery.data?.total ?? 0,
    sorting,
    pagination,
    rowSelection,
    onSortingChange,
    onPaginationChange,
    onRowSelectionChange,
    onSearchChange,
    onResetSearch,
    hasFilters: hasTeacherFilters(search),
    isLoadingRegister: registerQuery.isPending,
    isFetchingRegister: registerQuery.isFetching,
    isErrorRegister: registerQuery.isError,
    /**
     * A partial key, so a create, an edit or a delete refreshes the page it was
     * made from *and* every other page and search in the cache. A full key would
     * refresh only the one request that happened to be in front of the administrator.
     * It also refreshes the route's `loader`, which reads the same cache entry.
     */
    invalidateRegister: useCallback(
      () =>
        queryClient.invalidateQueries({
          queryKey: orpc.staff.listTeachers.key({ type: "query" }),
        }),
      [queryClient]
    ),
    refetchRegister: registerQuery.refetch,
  };
};
