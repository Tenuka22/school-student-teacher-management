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
  desc,
  eq,
  getTableColumns,
  inArray,
  isNull,
  or,
} from "drizzle-orm";
import * as v from "valibot";

import { requireStaffPermission } from "../../index";
import {
  getEligibleTeacherIds,
  getYearRosterTeacherIds,
} from "./teacher-eligibility";

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

const defaultTeachingStaff = and(
  eq(staff.staffCategory, "teacher"),
  or(eq(staff.employmentStatus, "active"), isNull(staff.employmentStatus))
);

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
    const academicYearId = input?.academicYearId;

    let teacherIds: string[] | null = null;
    if (academicYearId !== undefined) {
      teacherIds = input?.onlyPositioned
        ? await getEligibleTeacherIds(context.db, academicYearId)
        : await getYearRosterTeacherIds(context.db, academicYearId);
    }

    if (teacherIds?.length === 0) {
      return [];
    }

    // Without a year the list falls back to the default teaching establishment;
    // with a year the roster is the source of truth, even when it is empty.
    let where: ReturnType<typeof inArray> | undefined;
    if (teacherIds) {
      where = inArray(staff.id, teacherIds);
    } else if (academicYearId === undefined) {
      where = defaultTeachingStaff;
    }

    const rows = await context.db
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
      .where(where)
      .orderBy(desc(staff.createdAt));

    const rowsByStaffId = new Map<string, (typeof rows)[number][]>();
    for (const row of rows) {
      const staffRows = rowsByStaffId.get(row.id) ?? [];
      staffRows.push(row);
      rowsByStaffId.set(row.id, staffRows);
    }

    const mapped = [...rowsByStaffId.values()].flatMap((staffRows) => {
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
