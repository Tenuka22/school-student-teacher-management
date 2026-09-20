import { staff } from "@school-student-teacher-management/db/schema/staff";
import { desc } from "drizzle-orm";
import * as v from "valibot";

import { requireStaffPermission } from "../../index";

/**
 * Lightweight fuzzy match: every whitespace-separated token in the query
 * must appear as a substring somewhere in the candidate's searchable text.
 * Order-independent and case-insensitive
 * so "john doe" and "doe john"
 * both match "John Doe"; no trigram extension required.
 */
const fuzzyMatches = (haystack: string, query: string) => {
  const normalizedHaystack = haystack.toLowerCase();
  const tokens = query.toLowerCase().split(/\s+/u).filter(Boolean);
  return tokens.every((token) => normalizedHaystack.includes(token));
};

export const listStaff = requireStaffPermission("read")
  .input(v.optional(v.object({ search: v.optional(v.string()) })))
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select()
      .from(staff)
      .orderBy(desc(staff.createdAt));

    const mapped = rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      nic: row.nic,
      phone: row.phone,
      gender: row.gender,
      birthDate: row.birthDate,
      portraitFileId: row.portraitFileId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));

    const search = input?.search?.trim();
    if (!search) {
      return mapped;
    }

    return mapped.filter((row) =>
      fuzzyMatches(
        [row.name, row.email, row.nic, row.phone].filter(Boolean).join(" "),
        search
      )
    );
  });
