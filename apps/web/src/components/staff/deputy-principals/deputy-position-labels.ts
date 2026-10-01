/**
 * The two deputy seats this feature manages. `principal` itself is
 * deliberately absent — the Principal's own seat is not assigned from here
 * (see `positionManagerProcedure` and the in-handler guard in
 * `assign-position.ts`), and every other `staffPosition` key (sectional
 * head, head of department, plain teacher) belongs to the teachers
 * register, not the leave-review chain this feature exists for.
 */
export const DEPUTY_POSITION_LABELS = {
  vicePrincipal: "Vice Principal",
  assistantPrincipal: "Assistant Principal",
} as const;

export type DeputyPosition = keyof typeof DEPUTY_POSITION_LABELS;

export const DEPUTY_POSITIONS = Object.keys(
  DEPUTY_POSITION_LABELS
) as DeputyPosition[];

export const isDeputyPosition = (value: string): value is DeputyPosition =>
  (DEPUTY_POSITIONS as string[]).includes(value);

export const deputyPositionLabel = (value: string): string =>
  isDeputyPosition(value) ? DEPUTY_POSITION_LABELS[value] : value;

export interface DeputyAssignment {
  id: string;
  staffId: string;
  academicYearId: string;
  position: string;
  sectionalScope: string | null;
  createdAt: string;
}

export interface StaffLite {
  id: string;
  name: string;
  email: string | null;
}
