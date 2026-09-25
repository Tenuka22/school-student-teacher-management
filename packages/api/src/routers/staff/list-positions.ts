import {
  POSITION_TYPES,
  SECTIONAL_SCOPES,
} from "@school-student-teacher-management/db/constants/positions";
import {
  academicYearIdSchema,
  staffIdSchema,
  staffPosition,
} from "@school-student-teacher-management/db/schema/staff";
import { and, desc, eq } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../index";

export const listPositions = adminProcedure
  .input(
    v.optional(
      v.object({
        academicYearId: v.optional(academicYearIdSchema),
        staffId: v.optional(staffIdSchema),
      })
    )
  )
  .handler(async ({ context, input }) => {
    const conditions = [];
    if (input?.academicYearId) {
      conditions.push(eq(staffPosition.academicYearId, input.academicYearId));
    }
    if (input?.staffId) {
      conditions.push(eq(staffPosition.staffId, input.staffId));
    }

    const assignments =
      conditions.length === 0
        ? []
        : await context.db
            .select()
            .from(staffPosition)
            .where(and(...conditions))
            .orderBy(desc(staffPosition.createdAt));

    return {
      positions: Object.entries(POSITION_TYPES).map(([key, value]) => ({
        key,
        name: value.name,
        category: value.category,
      })),
      sectionalScopes: [...SECTIONAL_SCOPES],
      assignments: assignments.map((assignment) => ({
        id: assignment.id,
        staffId: assignment.staffId,
        academicYearId: assignment.academicYearId,
        position: assignment.position,
        sectionalScope: assignment.sectionalScope,
        createdAt: assignment.createdAt.toISOString(),
      })),
    };
  });
