import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@school-student-teacher-management/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import { IconCheck, IconLock } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarMonths, format, parseISO } from "date-fns";
import { useMemo, useRef, useState } from "react";

import { DatePicker } from "@/components/date-picker";
import { orpc } from "@/utils/orpc";

const CANDIDATE_YEAR_SPAN = { before: 2, after: 3 } as const;

const defaultRangeForYear = (year: number) => ({
  startDate: `${year}-01-01`,
  endDate: `${year}-12-31`,
});

export interface AcademicYearFormSubmitData {
  year: number;
  startDate: string;
  endDate: string;
  structureVersionKey?: string;
}

interface AcademicYearFormProps {
  formId: string;
  existingYears: number[];
  referenceYear: number;
  isLoading?: boolean;
  /** True when no academic year exists yet — requires an explicit curriculum
   * structure version since there is no prior year to default from. */
  isBootstrap?: boolean;
  onSubmit: (data: AcademicYearFormSubmitData) => Promise<void>;
  onError?: (message: string) => void;
}

export const AcademicYearForm = ({
  formId,
  existingYears,
  referenceYear,
  isLoading = false,
  isBootstrap = false,
  onSubmit,
  onError,
}: AcademicYearFormProps) => {
  const [year, setYear] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [structureVersionKey, setStructureVersionKey] = useState("");
  const [error, setError] = useState("");
  const datesTouched = useRef(false);

  const handleSelectYear = (candidate: number) => {
    setYear(String(candidate));
    if (!datesTouched.current) {
      const suggested = defaultRangeForYear(candidate);
      setStartDate(suggested.startDate);
      setEndDate(suggested.endDate);
    }
  };

  const structureVersionsQuery = useQuery({
    ...orpc.staff.listStructureVersions.queryOptions(),
    enabled: isBootstrap,
  });

  const structureVersions = (structureVersionsQuery.data || []) as {
    key: string;
    description: string;
  }[];

  const existingSet = useMemo(() => new Set(existingYears), [existingYears]);

  const candidateYears = useMemo(() => {
    const years: number[] = [];
    for (
      let y = referenceYear - CANDIDATE_YEAR_SPAN.before;
      y <= referenceYear + CANDIDATE_YEAR_SPAN.after;
      y += 1
    ) {
      years.push(y);
    }
    return years;
  }, [referenceYear]);

  const setFormError = (message: string) => {
    setError(message);
    onError?.(message);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!year) {
      setFormError("Select a year");
      return;
    }
    if (!(startDate && endDate)) {
      setFormError("Start date and end date are required");
      return;
    }
    if (startDate >= endDate) {
      setFormError("Start date must be before end date");
      return;
    }
    if (isBootstrap && !structureVersionKey) {
      setFormError("Select a curriculum structure version");
      return;
    }

    try {
      await onSubmit({
        year: Number(year),
        startDate,
        endDate,
        structureVersionKey: isBootstrap ? structureVersionKey : undefined,
      });
    } catch (submitError) {
      setFormError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to create academic year"
      );
    }
  };

  const selectedVersion = structureVersions.find(
    (v) => v.key === structureVersionKey
  );

  const durationLabel = useMemo(() => {
    if (!(startDate && endDate) || startDate >= endDate) {
      return null;
    }
    const months = differenceInCalendarMonths(
      parseISO(endDate),
      parseISO(startDate)
    );
    return `Runs ${months} month${months === 1 ? "" : "s"} — ${format(
      parseISO(startDate),
      "d MMM yyyy"
    )} to ${format(parseISO(endDate), "d MMM yyyy")}`;
  }, [startDate, endDate]);

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      <FieldGroup>
        <Field data-invalid={!!error}>
          <FieldTitle id={`${formId}-year-label`} className="font-medium">
            Academic year
          </FieldTitle>
          <fieldset
            aria-labelledby={`${formId}-year-label`}
            aria-describedby={`${formId}-year-description`}
            className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0"
          >
            {candidateYears.map((candidate) => {
              const exists = existingSet.has(candidate);
              const isSelected = year === String(candidate);
              return (
                <Button
                  key={candidate}
                  type="button"
                  aria-pressed={isSelected}
                  variant={isSelected ? "default" : "outline"}
                  disabled={isLoading || exists}
                  onClick={() => handleSelectYear(candidate)}
                  className="min-w-20 flex-1 basis-20 gap-1.5 font-mono"
                >
                  {isSelected && <IconCheck className="size-3.5" />}
                  {exists && <IconLock className="size-3.5" />}
                  {candidate}
                </Button>
              );
            })}
          </fieldset>
          <FieldDescription id={`${formId}-year-description`}>
            Years already defined are locked. Picking a year suggests a
            Jan&ndash;Dec term below — adjust the dates if yours differs.
          </FieldDescription>
        </Field>

        <Field>
          <FieldTitle className="font-medium">Term duration</FieldTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <FieldLabel htmlFor={`${formId}-start`}>Start date</FieldLabel>
              <DatePicker
                id={`${formId}-start`}
                value={startDate}
                onChange={(v) => {
                  datesTouched.current = true;
                  setStartDate(v);
                }}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel htmlFor={`${formId}-end`}>End date</FieldLabel>
              <DatePicker
                id={`${formId}-end`}
                value={endDate}
                onChange={(v) => {
                  datesTouched.current = true;
                  setEndDate(v);
                }}
                disabled={isLoading}
              />
            </div>
          </div>
          {durationLabel && (
            <FieldDescription
              aria-live="polite"
              className="text-primary font-medium"
            >
              {durationLabel}
            </FieldDescription>
          )}
        </Field>

        {isBootstrap && (
          <Field>
            <FieldLabel htmlFor={`${formId}-structure`}>
              Curriculum structure version
            </FieldLabel>
            <Select
              value={structureVersionKey}
              onValueChange={(v) => setStructureVersionKey(v ?? "")}
            >
              <SelectTrigger
                id={`${formId}-structure`}
                className="w-full"
                disabled={isLoading || structureVersionsQuery.isLoading}
              >
                <SelectValue placeholder="Select a structure version" />
              </SelectTrigger>
              <SelectContent>
                {structureVersions.map((version) => (
                  <SelectItem key={version.key} value={version.key}>
                    {version.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedVersion && (
              <div className="bg-accent/10 border-accent/30 flex items-start gap-2 border p-3 text-sm">
                <IconCheck className="text-primary mt-0.5 size-4 shrink-0" />
                <span>{selectedVersion.description}</span>
              </div>
            )}
            <FieldDescription>
              Defines which subjects and baskets apply per grade. Only required
              for the very first academic year — later years reuse the most
              recent one automatically.
            </FieldDescription>
          </Field>
        )}

        {error && (
          <div className="border-destructive/30 bg-destructive/5 border p-3">
            <FieldError id={`${formId}-error`}>{error}</FieldError>
          </div>
        )}
      </FieldGroup>
    </form>
  );
};
