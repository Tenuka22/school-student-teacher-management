import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { DatePicker } from "@/components/date-picker";
import { orpc } from "@/utils/orpc";

const CANDIDATE_YEAR_SPAN = { before: 2, after: 3 } as const;

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

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      <FieldGroup>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor={`${formId}-year`}>Year</FieldLabel>
          <Select value={year} onValueChange={(v) => setYear(v ?? "")}>
            <SelectTrigger
              id={`${formId}-year`}
              className="w-full"
              disabled={isLoading}
            >
              <SelectValue placeholder="Select a year" />
            </SelectTrigger>
            <SelectContent>
              {candidateYears.map((candidate) => (
                <SelectItem
                  key={candidate}
                  value={String(candidate)}
                  disabled={existingSet.has(candidate)}
                >
                  {candidate}
                  {existingSet.has(candidate) ? " (already exists)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            Years already defined are disabled.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor={`${formId}-start`}>Start Date</FieldLabel>
          <DatePicker
            id={`${formId}-start`}
            value={startDate}
            onChange={setStartDate}
            disabled={isLoading}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={`${formId}-end`}>End Date</FieldLabel>
          <DatePicker
            id={`${formId}-end`}
            value={endDate}
            onChange={setEndDate}
            disabled={isLoading}
          />
        </Field>

        {isBootstrap && (
          <Field>
            <FieldLabel htmlFor={`${formId}-structure`}>
              Curriculum Structure Version
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
            <FieldDescription>
              Defines which subjects and baskets apply per grade. Only required
              for the very first academic year — later years reuse the most
              recent one automatically.
            </FieldDescription>
          </Field>
        )}

        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
    </form>
  );
};
