/**
 * The shape the administrator's home page renders, and the one formatter it
 * needs.
 *
 * Kept apart from the panels so that module exports components only: a file
 * that mixes components and helpers breaks React Fast Refresh in development.
 */

export interface AdminOverview {
  year: {
    year: number;
    startDate: string | null;
    endDate: string | null;
  } | null;
  teachers: { roster: number; withoutPeriods: number };
  classes: { total: number; withoutHomeroom: number; withoutTimetable: number };
  timetable: {
    assigned: number;
    capacity: number;
    conflicts: number;
    periodsPerDay: number;
    teachingDays: number;
  };
  leave: { awaitingDeputy: number; awaitingPrincipal: number };
  requests: { awaitingApproval: number; awaitingVerification: number };
}

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short" });

/** "1 Jan 2027 – 31 Dec 2027", or an honest note when no range was recorded. */
export const formatAcademicYearRange = (
  startDate: string | null,
  endDate: string | null
): string => {
  if (!startDate || !endDate) {
    return "no date range recorded";
  }

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startDate} – ${endDate}`;
  }

  return `${start.getDate()} ${MONTH.format(start)} ${start.getFullYear()} – ${end.getDate()} ${MONTH.format(end)} ${end.getFullYear()}`;
};
