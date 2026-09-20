import { ORPCError } from "@orpc/server";
import { teacherQualification } from "@school-student-teacher-management/db/schema/qualifications";
import {
  staff,
  staffIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { requireStaffPermission } from "../../../index";
import { buildPdfExport } from "../../../lib/export";

const profileField = (label: string, value: string | null | undefined) => ({
  columns: [
    { text: label, bold: true, width: 140 },
    { text: value?.trim() ? value : "—" },
  ],
  margin: [0, 2, 0, 2] as [number, number, number, number],
});

/** Exports one teacher's full profile (personal, employment, qualifications) as a PDF. */
export const exportTeacherProfilePdf = requireStaffPermission("read")
  .input(v.object({ id: staffIdSchema }))
  .handler(async ({ input, context }) => {
    const [record] = await context.db
      .select()
      .from(staff)
      .where(eq(staff.id, input.id));

    if (!record) {
      throw new ORPCError("NOT_FOUND", { message: "Staff member not found" });
    }

    const qualifications = await context.db
      .select()
      .from(teacherQualification)
      .where(eq(teacherQualification.staffId, input.id));

    return buildPdfExport(
      `${record.name.replaceAll(/\s+/gu, "-")}-profile.pdf`,
      {
        content: [
          { text: record.name, style: "header" },
          { text: "Personal Information", style: "section" },
          profileField("Email", record.email),
          profileField("Phone", record.phone),
          profileField("NIC", record.nic),
          profileField("Gender", record.gender),
          profileField("Birth Date", record.birthDate),
          profileField("District", record.district),
          { text: "Employment Information", style: "section" },
          profileField("Appointment Type", record.appointmentType),
          profileField("Appointment Date", record.appointmentDate),
          profileField("Employment Status", record.employmentStatus),
          profileField("Teacher Service No.", record.teacherServiceNo),
          { text: "Qualifications", style: "section" },
          qualifications.length > 0
            ? {
                ul: qualifications.map(
                  (qualification) =>
                    `${qualification.qualification} — ${qualification.institution ?? "N/A"} (${qualification.documentStatus})`
                ),
              }
            : { text: "No qualifications on record.", italics: true },
        ],
        styles: {
          header: { fontSize: 20, bold: true, margin: [0, 0, 0, 12] },
          section: { fontSize: 13, bold: true, margin: [0, 14, 0, 6] },
        },
        defaultStyle: { fontSize: 10 },
      }
    );
  });
