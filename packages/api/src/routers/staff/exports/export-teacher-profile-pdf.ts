import { ORPCError } from "@orpc/server";
import {
  appointmentTypeLabel,
  employmentStatusLabel,
  genderLabel,
  qualificationDocumentStatusLabel,
} from "@school-student-teacher-management/db/constants/display";
import { teacherQualification } from "@school-student-teacher-management/db/schema/qualifications";
import {
  staff,
  staffIdSchema,
} from "@school-student-teacher-management/db/schema/staff";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { requireStaffPermission } from "../../../index";
import {
  buildPdfExport,
  formatGeneratedAt,
  pdfFooter,
} from "../../../lib/export";

const profileField = (label: string, value: string | null | undefined) => ({
  columns: [
    { text: label, bold: true, width: 140 },
    { text: value?.trim() ? value : "—" },
  ],
  margin: [0, 2, 0, 2] as [number, number, number, number],
});

/**
 * Exports one teacher's full profile (personal, employment, qualifications) as a PDF.
 *
 * The stored keys are words here for the same reason the Excel export spells
 * them out: a printed profile that reads `specifiedPeriod` and `active` tells
 * the reader what the College stores, not what it means. A blank field reads
 * "—" so the page shows which questions have no answer rather than dropping
 * the line.
 */
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

    const generatedAt = formatGeneratedAt(new Date());

    return buildPdfExport(`${record.name}-profile.pdf`, {
      content: [
        { text: record.name, style: "header" },
        { text: "Personal Information", style: "section" },
        profileField("Email", record.email),
        profileField("Phone", record.phone),
        profileField("NIC", record.nic),
        profileField("Gender", record.gender && genderLabel(record.gender)),
        profileField("Birth Date", record.birthDate),
        profileField("District", record.district),
        { text: "Employment Information", style: "section" },
        profileField(
          "Appointment Type",
          record.appointmentType && appointmentTypeLabel(record.appointmentType)
        ),
        profileField("Appointment Date", record.appointmentDate),
        profileField(
          "Employment Status",
          record.employmentStatus &&
            employmentStatusLabel(record.employmentStatus)
        ),
        profileField("Teacher Service No.", record.teacherServiceNo),
        { text: "Qualifications", style: "section" },
        qualifications.length > 0
          ? {
              ul: qualifications.map(
                (qualification) =>
                  `${qualification.qualification} — ${qualification.institution ?? "—"} (${qualificationDocumentStatusLabel(qualification.documentStatus)})`
              ),
            }
          : { text: "No qualifications on record.", italics: true },
      ],
      footer: pdfFooter(generatedAt),
      styles: {
        header: { fontSize: 20, bold: true, margin: [0, 0, 0, 12] },
        section: { fontSize: 13, bold: true, margin: [0, 14, 0, 6] },
      },
      defaultStyle: { fontSize: 10 },
    });
  });
