import {
  account,
  user,
} from "@school-student-teacher-management/db/schema/auth";
import {
  academicYearIdSchema,
  staff,
} from "@school-student-teacher-management/db/schema/staff";
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  isNull,
  or,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import * as v from "valibot";

import type { Context } from "../../context";
import { requireStaffPermission } from "../../index";
import {
  getEligibleTeacherIds,
  getYearRosterTeacherIds,
} from "./teacher-eligibility";

type Database = Context["db"];

export interface LinkedUserState {
  id: string;
  name: string;
  email: string;
  username: string | null;
  displayUsername: string | null;
  role: string | null;
  emailVerified: boolean;
  banned: boolean;
  banReason: string | null;
  banExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LinkedAccountState {
  id: string;
  accountId: string;
  providerId: string;
  hasPasswordCredential: boolean;
  createdAt: string;
  updatedAt: string;
}

type StaffRecord = typeof staff.$inferSelect;

export type StaffListItem = Omit<StaffRecord, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
  linkedUser: LinkedUserState | null;
  linkedAccounts: LinkedAccountState[];
};

const fuzzyMatches = (haystack: string, query: string) => {
  const normalizedHaystack = haystack.toLowerCase();
  const tokens = query.toLowerCase().split(/\s+/u).filter(Boolean);
  return tokens.every((token) => normalizedHaystack.includes(token));
};

/**
 * `\` `%` `_` escaped, so a search for a service number like `TE/0042` is a
 * literal search and not a wildcard that matches every teacher in the school.
 * The escape character is doubled first, so a backslash typed by the user does
 * not turn the following `%` back into a live wildcard. Postgres' default
 * `LIKE` escape is the backslash, so no `ESCAPE` clause is needed.
 *
 * Same escape as `listTakeableItems` and `listBorrows` — see those for why it is
 * needed. Repeated rather than shared because three copies of three lines beat a
 * `lib/` import that a reader has to follow to learn what a `%` means.
 */
const escapeLikePattern = (value: string): string =>
  value.replaceAll(/[\\%_]/gu, (character) => `\\${character}`);

/**
 * The staff search, **in SQL**.
 *
 * `listStaff` filters in JavaScript after the query, which is correct for a
 * list it is going to return whole and wrong for a list it is going to page: a
 * post-filter over the returned rows searches one page and calls the answer the
 * whole register, and a count taken before the filter is a count of the wrong
 * thing. So the two procedures share the *shape* of the search — every token
 * must match at least one of the five fields, which is what `fuzzyMatches` means
 * — and not the implementation.
 */
const staffSearchPredicate = (term: string | undefined): SQL | undefined => {
  const tokens = (term ?? "").trim().split(/\s+/u).filter(Boolean);
  if (tokens.length === 0) {
    return undefined;
  }

  const perToken = tokens
    .map((token) => {
      const pattern = `%${escapeLikePattern(token)}%`;

      return or(
        ilike(staff.name, pattern),
        ilike(staff.email, pattern),
        ilike(staff.phone, pattern),
        ilike(staff.nic, pattern),
        ilike(staff.teacherServiceNo, pattern)
      );
    })
    .filter((condition): condition is SQL => condition !== undefined);

  return perToken.length > 0 ? and(...perToken) : undefined;
};

/** The columns a header may order by, mapped to what they order. */
const STAFF_SORT_COLUMNS = {
  name: staff.name,
  email: staff.email,
  employmentStatus: staff.employmentStatus,
  createdAt: staff.createdAt,
} as const;

export type StaffSortKey = keyof typeof STAFF_SORT_COLUMNS;

const staffSortKey = v.picklist([
  "name",
  "email",
  "employmentStatus",
  "createdAt",
]);

/** Bounded so a client cannot ask for the whole establishment in one page. */
const MAX_PAGE_SIZE = 200;

/** The page the teachers list shows when the URL names none. */
const DEFAULT_PAGE_SIZE = 25;

const defaultTeachingStaff = and(
  eq(staff.staffCategory, "teacher"),
  or(eq(staff.employmentStatus, "active"), isNull(staff.employmentStatus))
);

interface StaffScopeInput {
  academicYearId?: string;
  onlyPositioned?: boolean;
}

/**
 * Which staff rows this reader is asking about, before search and paging.
 *
 * One definition, because the two procedures in this file must agree about it: a
 * year-scoped roster for one and "the default teaching establishment" for the
 * other, decided once here rather than written twice.
 */
const buildStaffScope = async (
  db: Parameters<typeof getYearRosterTeacherIds>[0],
  input: StaffScopeInput
): Promise<{ where: SQL | undefined; isEmpty: boolean }> => {
  const { academicYearId } = input;

  if (academicYearId !== undefined) {
    const teacherIds = input.onlyPositioned
      ? await getEligibleTeacherIds(db, academicYearId)
      : await getYearRosterTeacherIds(db, academicYearId);

    if (teacherIds.length === 0) {
      return { where: undefined, isEmpty: true };
    }

    return { where: inArray(staff.id, teacherIds), isEmpty: false };
  }

  // Without a year the list falls back to the default teaching establishment;
  // with a year the roster is the source of truth, even when it is empty.
  return {
    where:
      input.academicYearId === undefined ? defaultTeachingStaff : undefined,
    isEmpty: false,
  };
};

interface StaffQuery {
  where?: SQL;
  /** Omitted means "the server's own order", which is what `listStaff` wants. */
  orderBy?: SQL[];
  limit?: number;
  offset?: number;
}

/**
 * The one read of staff with its linked account, ordered and shaped.
 *
 * Both procedures in this file go through here, which is the point: the paged
 * list and the whole list must agree about which rows are in scope, which columns
 * come back, and how a linked `user`/`account` is folded into a staff record. Two
 * copies of a thirty-line join is two places for a column to go missing, and the
 * symptom would be a teacher whose email appears in the picker and not in the
 * register.
 */
const selectStaff = async (
  db: Database,
  query: StaffQuery
): Promise<StaffListItem[]> => {
  const base = db
    .select({
      ...getTableColumns(staff),
      linkedUserId: user.id,
      linkedUserName: user.name,
      linkedUserEmail: user.email,
      linkedUsername: user.username,
      linkedDisplayUsername: user.displayUsername,
      linkedUserRole: user.role,
      linkedEmailVerified: user.emailVerified,
      linkedBanned: user.banned,
      linkedBanReason: user.banReason,
      linkedBanExpires: user.banExpires,
      linkedUserCreatedAt: user.createdAt,
      linkedUserUpdatedAt: user.updatedAt,
      linkedAccountRecordId: account.id,
      linkedAccountId: account.accountId,
      linkedProviderId: account.providerId,
      linkedPasswordCredential: account.password,
      linkedAccountCreatedAt: account.createdAt,
      linkedAccountUpdatedAt: account.updatedAt,
    })
    .from(staff)
    .leftJoin(user, eq(staff.userId, user.id))
    .leftJoin(account, eq(account.userId, user.id))
    .where(query.where)
    .orderBy(...(query.orderBy ?? [desc(staff.createdAt)]));

  /*
   * The limit and the offset are applied only when asked for, and that is not a
   * detail: `listStaff` returns the whole establishment to twelve callers that
   * each expect all of it, so a default here would cap the teacher pickers at
   * whatever this file's cap happened to be — a picker that cannot reach the
   * fifty-first teacher is a data-loss bug, not a performance feature.
   */
  const limited = query.limit === undefined ? base : base.limit(query.limit);
  const rows = await (query.offset === undefined
    ? limited
    : limited.offset(query.offset));

  const rowsByStaffId = new Map<string, (typeof rows)[number][]>();
  for (const row of rows) {
    const staffRows = rowsByStaffId.get(row.id) ?? [];
    staffRows.push(row);
    rowsByStaffId.set(row.id, staffRows);
  }

  return [...rowsByStaffId.values()].flatMap((staffRows) => {
    const [staffRow] = staffRows;
    if (!staffRow) {
      return [];
    }

    const {
      createdAt,
      updatedAt,
      linkedUserId,
      linkedUserName,
      linkedUserEmail,
      linkedUsername,
      linkedDisplayUsername,
      linkedUserRole,
      linkedEmailVerified,
      linkedBanned,
      linkedBanReason,
      linkedBanExpires,
      linkedUserCreatedAt,
      linkedUserUpdatedAt,
      linkedAccountRecordId: _linkedAccountRecordId,
      linkedAccountId: _linkedAccountId,
      linkedProviderId: _linkedProviderId,
      linkedPasswordCredential: _linkedPasswordCredential,
      linkedAccountCreatedAt: _linkedAccountCreatedAt,
      linkedAccountUpdatedAt: _linkedAccountUpdatedAt,
      ...record
    } = staffRow;

    const linkedUser: LinkedUserState | null = linkedUserId
      ? {
          id: linkedUserId,
          name: linkedUserName ?? record.name,
          email: linkedUserEmail ?? record.email ?? "",
          username: linkedUsername,
          displayUsername: linkedDisplayUsername,
          role: linkedUserRole,
          emailVerified: linkedEmailVerified ?? false,
          banned: linkedBanned ?? false,
          banReason: linkedBanReason,
          banExpiresAt: linkedBanExpires?.toISOString() ?? null,
          createdAt:
            linkedUserCreatedAt?.toISOString() ?? createdAt.toISOString(),
          updatedAt:
            linkedUserUpdatedAt?.toISOString() ?? updatedAt.toISOString(),
        }
      : null;

    const linkedAccounts = staffRows.flatMap((linkedRow) => {
      if (
        !linkedRow.linkedAccountRecordId ||
        !linkedRow.linkedAccountId ||
        !linkedRow.linkedProviderId
      ) {
        return [];
      }

      return [
        {
          id: linkedRow.linkedAccountRecordId,
          accountId: linkedRow.linkedAccountId,
          providerId: linkedRow.linkedProviderId,
          hasPasswordCredential: Boolean(linkedRow.linkedPasswordCredential),
          createdAt:
            linkedRow.linkedAccountCreatedAt?.toISOString() ??
            createdAt.toISOString(),
          updatedAt:
            linkedRow.linkedAccountUpdatedAt?.toISOString() ??
            updatedAt.toISOString(),
        },
      ];
    });

    return [
      {
        ...record,
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
        linkedUser,
        linkedAccounts,
      },
    ];
  });
};

export const listStaff = requireStaffPermission("read")
  .input(
    v.optional(
      v.object({
        search: v.optional(v.string()),
        academicYearId: v.optional(academicYearIdSchema),
        onlyPositioned: v.optional(v.boolean()),
      })
    )
  )
  .handler(async ({ input, context }) => {
    const scope = await buildStaffScope(context.db, {
      academicYearId: input?.academicYearId,
      onlyPositioned: input?.onlyPositioned,
    });

    if (scope.isEmpty) {
      return [];
    }

    const mapped = await selectStaff(context.db, { where: scope.where });

    const search = input?.search?.trim();
    if (!search) {
      return mapped;
    }

    return mapped.filter((row) =>
      fuzzyMatches(
        [row.name, row.email, row.nic, row.phone, row.teacherServiceNo]
          .filter(Boolean)
          .join(" "),
        search
      )
    );
  });

/**
 * The teaching establishment, one page of it, searched and ordered in SQL.
 *
 * ## Why this is not `listStaff` with a `limit`
 *
 * `listStaff` has twelve callers and every one of them wants *all* of it: the
 * class-assignment teacher picker, the timetable teacher picker, the admin
 * sidebar's count, the class tab's teacher column. A `limit` added to a
 * procedure those callers share would silently cap the pickers — a teacher picker
 * that shows the first fifty teachers and no way to reach the fifty-first is a
 * data-loss bug wearing a performance feature. So the paged read is a second
 * procedure over the same scope helper, and `listStaff` keeps its contract.
 *
 * What the page on screen needs and the whole list cannot give it: a search that
 * is applied **before** the page is taken, an order the server chose, and a
 * total counted by the same `WHERE` as the page. All three of those are
 * statements about the establishment, and a post-filter over fifty returned rows
 * is a statement about the fifty.
 */
export const listTeachers = requireStaffPermission("read")
  .input(
    v.object({
      search: v.optional(v.string()),
      academicYearId: v.optional(academicYearIdSchema),
      onlyPositioned: v.optional(v.boolean()),
      sortBy: v.optional(staffSortKey, "name"),
      sortDirection: v.optional(v.picklist(["asc", "desc"]), "asc"),
      /** Zero-based, as TanStack Table counts pages. */
      page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
      pageSize: v.optional(
        v.pipe(
          v.number(),
          v.integer(),
          v.minValue(5),
          v.maxValue(MAX_PAGE_SIZE)
        ),
        25
      ),
    })
  )
  .handler(async ({ input, context }) => {
    const page = input.page ?? 0;
    const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
    const scope = await buildStaffScope(context.db, input);

    if (scope.isEmpty) {
      return { teachers: [], total: 0, page, pageSize };
    }

    const search = staffSearchPredicate(input.search);
    const where = search ? and(scope.where, search) : scope.where;

    // The total is counted by the same `WHERE` as the page, so the number in the
    // footer and the rows above it cannot disagree. Counting the establishment and
    // filtering the page would report a list of a hundred teachers when eleven
    // matched.
    const [counted] = await context.db
      .select({ total: count() })
      .from(staff)
      .where(where);
    const total = counted?.total ?? 0;

    const sortColumn = STAFF_SORT_COLUMNS[input.sortBy ?? "name"];
    const bySortKey =
      (input.sortDirection ?? "asc") === "desc"
        ? desc(sortColumn)
        : asc(sortColumn);

    const teachers = await selectStaff(context.db, {
      where,
      // `id` breaks ties, so a page boundary cannot land between two teachers who
      // share a name and reorder them between requests.
      orderBy: [bySortKey, asc(staff.id)],
      limit: pageSize,
      offset: page * pageSize,
    });

    return { teachers, total, page, pageSize };
  });
