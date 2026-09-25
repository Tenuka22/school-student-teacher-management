import type { StaffListItem } from "@school-student-teacher-management/api/routers/staff/list-staff";
import { GENDERS } from "@school-student-teacher-management/db/constants/demographics";
import {
  APPOINTMENT_TYPES,
  EMPLOYMENT_STATUSES,
} from "@school-student-teacher-management/db/constants/teachers";
import {
  NIC_FORMAT_MESSAGE,
  isValidNicFormat,
} from "@school-student-teacher-management/db/schema/primitives";
import {
  STAFF_CATEGORIES,
  staffInsertSchema,
  staffUpdateSchema,
} from "@school-student-teacher-management/db/schema/staff";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@school-student-teacher-management/ui/components/field";
import { Input } from "@school-student-teacher-management/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import { Separator } from "@school-student-teacher-management/ui/components/separator";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { DatePicker } from "@/components/date-picker";
import {
  formatApiErrorMessage,
  friendlyValidationMessage,
  validationFieldErrors,
} from "@/lib/api-error";

interface TeacherFormProps {
  formId: string;
  initialData?: StaffListItem;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  isLoading?: boolean;
  isEdit?: boolean;
}

interface TeacherFieldSectionProps {
  formId: string;
  formData: FormData;
  errors: Record<string, string>;
  isLoading: boolean;
  onChange: (field: keyof FormData, value: string) => void;
}

const BADGE_NUMBER_RE = /^T\d{3,6}$/u;

const badgeNumberSchema = v.pipe(
  v.string(),
  v.regex(
    BADGE_NUMBER_RE,
    "Teacher service number must look like T0142 (T + 3-6 digits)"
  )
);

/** The `staff` table's own NIC rule, so the form cannot accept what the table refuses. */
const nicSchema = v.pipe(
  v.string(),
  v.minLength(1, "NIC is required"),
  v.check(isValidNicFormat, NIC_FORMAT_MESSAGE)
);

const createValidationSchema = () =>
  v.object({
    ...v.pick(staffInsertSchema, [
      "name",
      "email",
      "phone",
      "gender",
      "birthDate",
      "staffCategory",
      "appointmentType",
      "appointmentDate",
      "employmentStatus",
    ]).entries,
    nic: nicSchema,
    teacherServiceNo: v.optional(badgeNumberSchema),
  });

const editValidationSchema = () =>
  v.object({
    ...v.pick(staffUpdateSchema, [
      "name",
      "email",
      "phone",
      "gender",
      "birthDate",
      "staffCategory",
      "appointmentType",
      "appointmentDate",
      "employmentStatus",
    ]).entries,
    nic: nicSchema,
    teacherServiceNo: v.nullable(badgeNumberSchema),
  });

interface FormData {
  name: string;
  email: string;
  nic: string;
  phone: string;
  gender: string;
  birthDate: string;
  teacherServiceNo: string;
  staffCategory: string;
  appointmentType: string;
  appointmentDate: string;
  employmentStatus: string;
}

const OPTIONAL_FIELDS = [
  "email",
  "phone",
  "gender",
  "birthDate",
  "teacherServiceNo",
  "appointmentType",
  "appointmentDate",
  "employmentStatus",
] as const;

const textOrEmpty = (value: string | null | undefined) => value ?? "";

const getInitialFormData = (initialData?: StaffListItem): FormData => ({
  name: textOrEmpty(initialData?.name),
  email: textOrEmpty(initialData?.email),
  nic: textOrEmpty(initialData?.nic),
  phone: textOrEmpty(initialData?.phone),
  gender: textOrEmpty(initialData?.gender),
  birthDate: textOrEmpty(initialData?.birthDate),
  teacherServiceNo: textOrEmpty(initialData?.teacherServiceNo),
  staffCategory: initialData?.staffCategory ?? "teacher",
  appointmentType: textOrEmpty(initialData?.appointmentType),
  appointmentDate: textOrEmpty(initialData?.appointmentDate),
  employmentStatus: initialData?.employmentStatus ?? "active",
});

const normalizeFormData = (formData: FormData, isEdit: boolean) => {
  const normalized: Record<string, string | null> = {
    name: formData.name.trim(),
    nic: formData.nic.trim(),
    staffCategory: formData.staffCategory,
  };

  for (const field of OPTIONAL_FIELDS) {
    const value = formData[field].trim();
    if (value) {
      normalized[field] = value;
    } else if (isEdit) {
      normalized[field] = null;
    }
  }

  return normalized;
};

const TeacherBasicFields = ({
  formId,
  formData,
  errors,
  isLoading,
  onChange,
}: TeacherFieldSectionProps) => (
  <FieldSet>
    <FieldLegend>Basic Information</FieldLegend>
    <FieldGroup>
      <Field data-invalid={Boolean(errors.nic)}>
        <FieldLabel htmlFor={`${formId}-nic`}>NIC Number *</FieldLabel>
        <Input
          id={`${formId}-nic`}
          value={formData.nic}
          onChange={(event) => onChange("nic", event.target.value)}
          placeholder="199912345678 or 991234567V"
          disabled={isLoading}
          aria-invalid={Boolean(errors.nic)}
        />
        <FieldDescription>
          This becomes the login username and the password is issued after the
          teacher is created.
        </FieldDescription>
        {errors.nic && <FieldError>{errors.nic}</FieldError>}
      </Field>

      <Field data-invalid={Boolean(errors.name)}>
        <FieldLabel htmlFor={`${formId}-name`}>Name *</FieldLabel>
        <Input
          id={`${formId}-name`}
          value={formData.name}
          onChange={(event) => onChange("name", event.target.value)}
          placeholder="John Doe"
          disabled={isLoading}
          aria-invalid={Boolean(errors.name)}
        />
        {errors.name && <FieldError>{errors.name}</FieldError>}
      </Field>

      <Field data-invalid={Boolean(errors.email)}>
        <FieldLabel htmlFor={`${formId}-email`}>Email *</FieldLabel>
        <Input
          id={`${formId}-email`}
          type="email"
          value={formData.email}
          onChange={(event) => onChange("email", event.target.value)}
          placeholder="john@school.edu.lk"
          disabled={isLoading}
          aria-invalid={Boolean(errors.email)}
        />
        {errors.email && <FieldError>{errors.email}</FieldError>}
      </Field>

      <Field data-invalid={Boolean(errors.phone)}>
        <FieldLabel htmlFor={`${formId}-phone`}>Phone</FieldLabel>
        <Input
          id={`${formId}-phone`}
          value={formData.phone}
          onChange={(event) => onChange("phone", event.target.value)}
          placeholder="+947XXXXXXXX"
          disabled={isLoading}
          aria-invalid={Boolean(errors.phone)}
        />
        <FieldDescription>
          Sri Lankan phone number normalized to +94 format
        </FieldDescription>
        {errors.phone && <FieldError>{errors.phone}</FieldError>}
      </Field>

      <Field data-invalid={Boolean(errors.gender)}>
        <FieldLabel htmlFor={`${formId}-gender`}>Gender</FieldLabel>
        <Select
          value={formData.gender}
          onValueChange={(value) => onChange("gender", value ?? "")}
        >
          <SelectTrigger
            id={`${formId}-gender`}
            disabled={isLoading}
            aria-invalid={Boolean(errors.gender)}
          >
            <SelectValue placeholder="Select gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {GENDERS.map((gender) => (
                <SelectItem key={gender} value={gender}>
                  {gender === "male" ? "Male" : "Female"}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {errors.gender && <FieldError>{errors.gender}</FieldError>}
      </Field>

      <Field data-invalid={Boolean(errors.birthDate)}>
        <FieldLabel htmlFor={`${formId}-birth-date`}>Birth Date</FieldLabel>
        <DatePicker
          id={`${formId}-birth-date`}
          value={formData.birthDate}
          onChange={(isoDate) => onChange("birthDate", isoDate)}
          disabled={isLoading}
          disableFuture
        />
        {errors.birthDate && <FieldError>{errors.birthDate}</FieldError>}
      </Field>
    </FieldGroup>
  </FieldSet>
);

const TeacherEmploymentFields = ({
  formId,
  formData,
  errors,
  isLoading,
  onChange,
}: TeacherFieldSectionProps) => (
  <>
    <Separator />
    <FieldSet>
      <FieldLegend>Employment Information</FieldLegend>
      <FieldGroup>
        <Field data-invalid={Boolean(errors.staffCategory)}>
          <FieldLabel htmlFor={`${formId}-staff-category`}>
            Staff Category
          </FieldLabel>
          <Select
            value={formData.staffCategory}
            onValueChange={(value) =>
              onChange("staffCategory", value ?? "teacher")
            }
          >
            <SelectTrigger
              id={`${formId}-staff-category`}
              disabled={isLoading}
              aria-invalid={Boolean(errors.staffCategory)}
            >
              <SelectValue placeholder="Select staff category" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {STAFF_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category === "teacher" ? "Teacher" : "Office Staff"}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field data-invalid={Boolean(errors.teacherServiceNo)}>
          <FieldLabel htmlFor={`${formId}-service-number`}>
            Teacher Service Number
          </FieldLabel>
          <Input
            id={`${formId}-service-number`}
            value={formData.teacherServiceNo}
            onChange={(event) =>
              onChange("teacherServiceNo", event.target.value.toUpperCase())
            }
            placeholder="T0142"
            disabled={isLoading}
            aria-invalid={Boolean(errors.teacherServiceNo)}
          />
          {errors.teacherServiceNo && (
            <FieldError>{errors.teacherServiceNo}</FieldError>
          )}
        </Field>

        <Field data-invalid={Boolean(errors.appointmentType)}>
          <FieldLabel htmlFor={`${formId}-appointment-type`}>
            Appointment Type
          </FieldLabel>
          <Select
            value={formData.appointmentType}
            onValueChange={(value) => onChange("appointmentType", value ?? "")}
          >
            <SelectTrigger
              id={`${formId}-appointment-type`}
              disabled={isLoading}
              aria-invalid={Boolean(errors.appointmentType)}
            >
              <SelectValue placeholder="Select appointment type" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(APPOINTMENT_TYPES).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {errors.appointmentType && (
            <FieldError>{errors.appointmentType}</FieldError>
          )}
        </Field>

        <Field data-invalid={Boolean(errors.appointmentDate)}>
          <FieldLabel htmlFor={`${formId}-appointment-date`}>
            Appointment Date
          </FieldLabel>
          <DatePicker
            id={`${formId}-appointment-date`}
            value={formData.appointmentDate}
            onChange={(isoDate) => onChange("appointmentDate", isoDate)}
            disabled={isLoading}
            disableFuture
          />
          {errors.appointmentDate && (
            <FieldError>{errors.appointmentDate}</FieldError>
          )}
        </Field>

        <Field data-invalid={Boolean(errors.employmentStatus)}>
          <FieldLabel htmlFor={`${formId}-employment-status`}>
            Employment Status
          </FieldLabel>
          <Select
            value={formData.employmentStatus}
            onValueChange={(value) => onChange("employmentStatus", value ?? "")}
          >
            <SelectTrigger
              id={`${formId}-employment-status`}
              disabled={isLoading}
              aria-invalid={Boolean(errors.employmentStatus)}
            >
              <SelectValue placeholder="Select employment status" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(EMPLOYMENT_STATUSES).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {errors.employmentStatus && (
            <FieldError>{errors.employmentStatus}</FieldError>
          )}
        </Field>
      </FieldGroup>
    </FieldSet>
  </>
);

export const TeacherForm = ({
  formId,
  initialData,
  onSubmit,
  isLoading = false,
  isEdit = false,
}: TeacherFormProps) => {
  const [formData, setFormData] = useState<FormData>(() =>
    getInitialFormData(initialData)
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = useCallback((field: keyof FormData, value: string) => {
    setFormData((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: "" }));
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const schema = isEdit ? editValidationSchema() : createValidationSchema();
    const result = v.safeParse(schema, normalizeFormData(formData, isEdit));

    if (!result.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of result.issues) {
        const issueKey = issue.path?.[0]?.key;
        const path = typeof issueKey === "string" ? issueKey : "form";
        nextErrors[path] = friendlyValidationMessage(issue.message, issue.type);
      }
      setErrors(nextErrors);
      toast.error("Please fix validation errors");
      return;
    }

    try {
      await onSubmit(result.output);
      toast.success(
        isEdit ? "Teacher updated successfully" : "Teacher created successfully"
      );
    } catch (error) {
      const fieldErrors = validationFieldErrors<keyof FormData>(error);
      if (Object.keys(fieldErrors).length > 0) {
        setErrors((previous) => ({ ...previous, ...fieldErrors }));
      }
      toast.error(
        formatApiErrorMessage(
          error,
          isEdit ? "Failed to update teacher" : "Failed to create teacher"
        )
      );
    }
  };

  const sectionProps = {
    formId,
    formData,
    errors,
    isLoading,
    onChange: handleChange,
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-6">
      <TeacherBasicFields {...sectionProps} />
      <TeacherEmploymentFields {...sectionProps} />
    </form>
  );
};
