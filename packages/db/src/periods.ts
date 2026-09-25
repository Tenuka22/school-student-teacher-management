export interface SchoolPeriod {
  readonly periodNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  readonly startTime: string;
  readonly endTime: string;
}

export type SchoolPeriodNumber = SchoolPeriod["periodNumber"];

export interface SchoolPeriodRange {
  readonly startPeriodNumber: SchoolPeriodNumber;
  readonly endPeriodNumber: SchoolPeriodNumber;
}

export const CODE_DEFINED_PERIODS = [
  { periodNumber: 1, startTime: "07:50", endTime: "08:25" },
  { periodNumber: 2, startTime: "08:30", endTime: "09:10" },
  { periodNumber: 3, startTime: "09:15", endTime: "09:50" },
  { periodNumber: 4, startTime: "09:50", endTime: "10:30" },
  { periodNumber: 5, startTime: "10:50", endTime: "11:30" },
  { periodNumber: 6, startTime: "11:30", endTime: "12:10" },
  { periodNumber: 7, startTime: "12:10", endTime: "12:50" },
  { periodNumber: 8, startTime: "12:50", endTime: "13:30" },
] as const satisfies readonly SchoolPeriod[];

export const DEFAULT_PRIMARY_PERIOD_RANGE = {
  startPeriodNumber: 1,
  endPeriodNumber: 4,
} as const satisfies SchoolPeriodRange;

export const DEFAULT_SECONDARY_PERIOD_RANGE = {
  startPeriodNumber: 5,
  endPeriodNumber: 8,
} as const satisfies SchoolPeriodRange;

export const getPeriodNumbers = (range: {
  readonly startPeriodNumber: number;
  readonly endPeriodNumber: number;
}) =>
  CODE_DEFINED_PERIODS.filter(
    (period) =>
      period.periodNumber >= range.startPeriodNumber &&
      period.periodNumber <= range.endPeriodNumber
  ).map((period) => period.periodNumber);

export const getDayPartPeriodNumbers = (
  dayPart: string,
  primaryRange: {
    readonly startPeriodNumber: number;
    readonly endPeriodNumber: number;
  } = DEFAULT_PRIMARY_PERIOD_RANGE,
  secondaryRange: {
    readonly startPeriodNumber: number;
    readonly endPeriodNumber: number;
  } = DEFAULT_SECONDARY_PERIOD_RANGE
): SchoolPeriodNumber[] => {
  if (dayPart === "full") {
    return [];
  }
  if (dayPart === "morning") {
    return getPeriodNumbers(primaryRange);
  }
  if (dayPart === "afternoon") {
    return getPeriodNumbers(secondaryRange);
  }
  throw new Error(`Unsupported leave day part: ${dayPart}`);
};
