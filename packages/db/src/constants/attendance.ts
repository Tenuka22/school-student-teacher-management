/**
 * Why one period of one teacher's day is missed.
 *
 * ## A vocabulary, and where it is stored
 *
 * `teacher_period_absence.reason` is a plain `text` column and this is a
 * *vocabulary* for filling it in, not a new column. A period-level reason is the
 * one place in attendance where free text is genuinely open — a doctor, a funeral,
 * a traffic accident on the way in — so the alternatives were a picklist-only
 * column (which cannot answer any of those) or a migration for a second column
 * that the rest of the feature would then have to thread through every read.
 *
 * **So a chosen category writes its own label into that column, and "Other" writes
 * what was typed.** The register therefore stores a sentence in every case, which
 * is what the column has always held and what a report over it can print. A
 * category that needed to be counted later can be recognised by its label — which
 * is why the labels here are short and distinct rather than chatty — and nothing
 * in the feature parses the text.
 *
 * ## "Not scheduled" is in here for a reason
 *
 * A register shows every teacher on a date, whether or not the timetable gives
 * them a period. Marking a teacher absent from a period they were never timetabled
 * for is the commonest false absence there is, and it is not an absence at all —
 * so it has a name of its own rather than being filed under "Other" or left to
 * look like a disciplinary record.
 *
 * The order is the order a register clerk reaches for them: the timetable is the
 * most common reason, then health, then the College's own business, and "Other"
 * last because reaching for it should take a second thought.
 */
export const ATTENDANCE_PERIOD_REASONS = {
  notScheduled: { label: "Not timetabled this period" },
  officialDuty: { label: "Official duty" },
  sick: { label: "Sick" },
  medical: { label: "Medical appointment" },
  meeting: { label: "Meeting or training" },
  schoolEvent: { label: "School event" },
  late: { label: "Arrived after the register" },
  other: { label: "Other" },
} as const satisfies Record<string, { label: string }>;

export type AttendancePeriodReason = keyof typeof ATTENDANCE_PERIOD_REASONS;

/** The picklist's order, which is the order the form renders. */
export const ATTENDANCE_PERIOD_REASON_KEYS = [
  "notScheduled",
  "officialDuty",
  "sick",
  "medical",
  "meeting",
  "schoolEvent",
  "late",
  "other",
] as const satisfies readonly AttendancePeriodReason[];

/**
 * The key that means "the typed text is the reason", and the only one whose
 * stored value is not one of the labels above.
 *
 * It is a single constant rather than a second flag on every option so that a
 * caller asking "is this Other?" is asking one question in one place, and so
 * that adding a category can never accidentally make it behave like Other.
 */
export const OTHER_ATTENDANCE_REASON = "other";

export const attendanceReasonLabel = (key: AttendancePeriodReason): string =>
  ATTENDANCE_PERIOD_REASONS[key].label;

/**
 * The sentence to store for a period.
 *
 * `otherText` is only read for the Other key, so a caller can pass the field's
 * value unconditionally. A chosen category with typed text on top writes
 * `label — text`, because a clerk who typed something and then picked a category
 * meant both and dropping the typed half loses the part they cared about; Other
 * with nothing typed falls back to the label rather than writing an empty string,
 * so the column is never blank on a marked absence.
 */
export const composeAttendanceReason = (
  key: AttendancePeriodReason,
  otherText = ""
): string => {
  const text = otherText.trim();
  const label = attendanceReasonLabel(key);

  if (key === OTHER_ATTENDANCE_REASON) {
    return text || label;
  }

  return text ? `${label} — ${text}` : label;
};

/**
 * The best-effort reverse: a stored reason split back into a category and any
 * typed remainder.
 *
 * Used when the dialog re-opens on a day somebody marked earlier, where the only
 * thing available is the stored sentence. It is deliberately forgiving — an
 * unmatched sentence comes back as `other` with the whole sentence as the text,
 * so a reason typed by hand before this vocabulary existed is never lost by being
 * re-opened and saved.
 */
export const parseAttendanceReason = (
  stored: string | null | undefined
): { key: AttendancePeriodReason; otherText: string } => {
  const value = stored?.trim() ?? "";

  if (value === "") {
    return { key: OTHER_ATTENDANCE_REASON, otherText: "" };
  }

  for (const key of ATTENDANCE_PERIOD_REASON_KEYS) {
    const label = attendanceReasonLabel(key);
    if (value === label) {
      return { key, otherText: "" };
    }
    if (key !== OTHER_ATTENDANCE_REASON && value.startsWith(`${label} — `)) {
      return { key, otherText: value.slice(label.length + 3) };
    }
  }

  return { key: OTHER_ATTENDANCE_REASON, otherText: value };
};
