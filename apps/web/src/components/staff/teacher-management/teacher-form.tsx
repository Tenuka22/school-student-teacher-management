import { GENDERS } from "@school-student-teacher-management/db/constants/demographics";
import {
  APPOINTMENT_TYPES,
  EMPLOYMENT_STATUSES,
} from "@school-student-teacher-management/db/constants/teachers";
import {
  isValidNicFormat,
  NIC_FORMAT_MESSAGE,
} from "@school-student-teacher-management/db/schema/primitives";
import {
  staffInsertSchema,
  staffUpdateSchema,
} from "@school-student-teacher-management/db/schema/staff";
import type { staff } from "@school-student-teacher-management/db/schema/staff";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import { Separator } from "@school-student-teacher-management/ui/components/separator";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { DatePicker } from "@/components/date-picker";
import { RequiredMark } from "@/components/ui-patterns/required-mark";
import {
  formatApiErrorMessage,
  friendlyValidationMessage,
  validationFieldErrors,
} from "@/lib/api-error";
import { descriptionId, errorId, fieldA11y } from "@/lib/field-a11y";

type Staff = typeof staff.$inferSelect;

interface TeacherFormProps {
  formId: string;
  initialData?: Staff;
  onSubmit: (data: unknown) => Promise<void>;
  isLoading?: boolean;
  isEdit?: boolean;
}

const BADGE_NUMBER_RE = /^T\d{3,6}$/u;

/** Shown as required in the form; mirrors the create schema below. */
const REQUIRED_FIELDS = new Set<string>(["nic", "name", "email"]);

const createValidationSchema = () =>
  v.object({
    ...v.pick(staffInsertSchema, [
      "name",
      "email",
      "nic",
      "phone",
      "gender",
      "birthDate",
    ]).entries,
    /**
     * Required, and the format is the schema's own rather than a regex written
     * here.
     *
     * This file used to carry a local `NIC_RE` for exactly this check, which is a
     * second copy of a rule the database also enforces — three of them, once the
     * `staff_nic_format` CHECK counts, and the copy that is easiest to forget is
     * the one in a form. `isValidNicFormat` is the same predicate the
     * `staff.nic` column's valibot schema and the CHECK are both written from, so
     * a change to the accepted formats lands in one place.
     *
     * The empty-string case is separate and stays here: a `v.string()` piped
     * through the format check reports "Enter a valid Sri Lankan NIC: …" for a
     * field nobody has typed in, and the honest message for an empty required
     * field is that it is required.
     */
    nic: v.pipe(
      v.string(),
      v.minLength(1, "NIC is required"),
      v.check(isValidNicFormat, NIC_FORMAT_MESSAGE)
    ),
    /** Optional internal reference; no longer the login identity. */
    teacherServiceNo: v.optional(
      v.pipe(
        v.string(),
        v.regex(
          BADGE_NUMBER_RE,
          "Badge number must look like T0142 (T + 3-6 digits)"
        )
      )
    ),
  });

const editValidationSchema = () =>
  v.pick(staffUpdateSchema, [
    "name",
    "email",
    "nic",
    "phone",
    "gender",
    "birthDate",
    "appointmentType",
    "employmentStatus",
  ]);

interface FormData {
  name: string;
  email: string;
  nic: string;
  phone: string;
  gender: string;
  birthDate: string;
  teacherServiceNo: string;
  appointmentType: string;
  employmentStatus: string;
}

const getInitialFormData = (initialData?: Staff): FormData => ({
  name: initialData?.name || "",
  email: initialData?.email || "",
  nic: initialData?.nic || "",
  phone: initialData?.phone || "",
  gender: initialData?.gender || "",
  birthDate: initialData?.birthDate || "",
  teacherServiceNo: initialData?.teacherServiceNo || "",
  appointmentType: initialData?.appointmentType || "",
  employmentStatus: initialData?.employmentStatus || "",
});

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
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const schema = isEdit ? editValidationSchema() : createValidationSchema();
    const result = v.safeParse(schema, formData);

    if (!result.success) {
      const newErrors: Record<string, string> = {};
      for (const issue of result.issues) {
        const path = issue.path?.[0]?.key || "form";
        newErrors[path as string] = friendlyValidationMessage(
          issue.message,
          issue.type
        );
      }

      setErrors(newErrors);
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
        setErrors((prev) => ({ ...prev, ...fieldErrors }));
      }
      toast.error(
        formatApiErrorMessage(
          error,
          isEdit ? "Failed to update teacher" : "Failed to create teacher"
        )
      );
    }
  };

  const a11y = (field: keyof FormData, hasDescription = false) =>
    fieldA11y(`${formId}-${field}`, {
      error: errors[field],
      hasDescription,
      required: REQUIRED_FIELDS.has(field),
    });

  const renderError = (field: keyof FormData) =>
    errors[field] ? (
      <FieldError id={errorId(`${formId}-${field}`)}>
        {errors[field]}
      </FieldError>
    ) : null;

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      <FieldSet>
        <FieldLegend>Basic information</FieldLegend>
        <FieldGroup>
          <Field data-invalid={Boolean(errors.teacherServiceNo)}>
            <FieldLabel htmlFor={`${formId}-teacherServiceNo`}>
              Badge number
            </FieldLabel>
            <Input
              {...a11y("teacherServiceNo", true)}
              value={formData.teacherServiceNo}
              onChange={(e) =>
                handleChange("teacherServiceNo", e.target.value.toUpperCase())
              }
              placeholder="e.g. T0142"
              autoComplete="off"
              disabled={isLoading}
            />
            <FieldDescription id={descriptionId(`${formId}-teacherServiceNo`)}>
              Optional internal service number. The login username is the NIC
              below.
            </FieldDescription>
            {renderError("teacherServiceNo")}
          </Field>

          <Field data-invalid={Boolean(errors.nic)}>
            <FieldLabel htmlFor={`${formId}-nic`}>
              NIC number <RequiredMark />
            </FieldLabel>
            <Input
              {...a11y("nic", true)}
              value={formData.nic ?? ""}
              onChange={(e) => handleChange("nic", e.target.value)}
              placeholder="e.g. 199912345678 or 991234567V"
              autoComplete="off"
              disabled={isLoading}
            />
            <FieldDescription id={descriptionId(`${formId}-nic`)}>
              The NIC is the teacher&apos;s login username. They sign in with it
              and the password you issue.
            </FieldDescription>
            {renderError("nic")}
          </Field>

          <Field data-invalid={Boolean(errors.name)}>
            <FieldLabel htmlFor={`${formId}-name`}>
              Full name <RequiredMark />
            </FieldLabel>
            <Input
              {...a11y("name")}
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="e.g. Nimal Perera"
              autoComplete="off"
              disabled={isLoading}
            />
            {renderError("name")}
          </Field>

          <Field data-invalid={Boolean(errors.email)}>
            <FieldLabel htmlFor={`${formId}-email`}>
              Email <RequiredMark />
            </FieldLabel>
            <Input
              {...a11y("email")}
              type="email"
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              placeholder="e.g. nimal@school.edu.lk"
              autoComplete="off"
              disabled={isLoading}
            />
            {renderError("email")}
          </Field>

          <Field data-invalid={Boolean(errors.phone)}>
            <FieldLabel htmlFor={`${formId}-phone`}>Phone</FieldLabel>
            <Input
              {...a11y("phone", true)}
              type="tel"
              inputMode="tel"
              value={formData.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
              placeholder="e.g. +94771234567"
              autoComplete="off"
              disabled={isLoading}
            />
            <FieldDescription id={descriptionId(`${formId}-phone`)}>
              Sri Lankan number; it is saved in +94 format.
            </FieldDescription>
            {renderError("phone")}
          </Field>

          <Field data-invalid={Boolean(errors.gender)}>
            <FieldLabel htmlFor={`${formId}-gender`}>Gender</FieldLabel>
            <Select
              value={formData.gender}
              onValueChange={(value) => handleChange("gender", value ?? "")}
            >
              <SelectTrigger {...a11y("gender")} disabled={isLoading}>
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                {GENDERS.map((gender) => (
                  <SelectItem key={gender} value={gender}>
                    {gender === "male" ? "Male" : "Female"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {renderError("gender")}
          </Field>

          <Field data-invalid={Boolean(errors.birthDate)}>
            <FieldLabel htmlFor="birthDate">Date of birth</FieldLabel>
            <DatePicker
              id="birthDate"
              value={formData.birthDate}
              onChange={(isoDate) => handleChange("birthDate", isoDate)}
              disabled={isLoading}
              disableFuture
            />
            {errors.birthDate ? (
              <FieldError>{errors.birthDate}</FieldError>
            ) : null}
          </Field>
        </FieldGroup>
      </FieldSet>

      {isEdit && (
        <>
          <Separator />

          <FieldSet>
            <FieldLegend>Employment information</FieldLegend>
            <FieldGroup>
              <Field data-invalid={Boolean(errors.appointmentType)}>
                <FieldLabel htmlFor={`${formId}-appointmentType`}>
                  Appointment type
                </FieldLabel>
                <Select
                  value={formData.appointmentType || ""}
                  onValueChange={(value) =>
                    handleChange("appointmentType", value || "")
                  }
                >
                  <SelectTrigger
                    {...a11y("appointmentType")}
                    disabled={isLoading}
                  >
                    <SelectValue placeholder="Select appointment type" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(APPOINTMENT_TYPES).map(
                      ([key, { label }]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
                {renderError("appointmentType")}
              </Field>

              <Field data-invalid={Boolean(errors.employmentStatus)}>
                <FieldLabel htmlFor={`${formId}-employmentStatus`}>
                  Employment status
                </FieldLabel>
                <Select
                  value={formData.employmentStatus || ""}
                  onValueChange={(value) =>
                    handleChange("employmentStatus", value || "")
                  }
                >
                  <SelectTrigger
                    {...a11y("employmentStatus")}
                    disabled={isLoading}
                  >
                    <SelectValue placeholder="Select employment status" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EMPLOYMENT_STATUSES).map(
                      ([key, { label }]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
                {renderError("employmentStatus")}
              </Field>
            </FieldGroup>
          </FieldSet>
        </>
      )}
    </form>
  );
};
