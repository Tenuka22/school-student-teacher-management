import { CODE_DEFINED_PERIODS } from "@school-student-teacher-management/db/periods";
import { academicYearIdSchema } from "@school-student-teacher-management/db/schema/staff";
import * as v from "valibot";

import { requireAssignmentPermission } from "../../../index";

/**
 * List all period configurations for a given academic year.
 * Returns 8 periods (1–8) with start/end times.
 */
export const listPeriodConfig = requireAssignmentPermission("read")
  .input(
    v.object({
      academicYearId: academicYearIdSchema,
    })
  )
  .handler(() => CODE_DEFINED_PERIODS);
