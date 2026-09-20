import { GENDERS } from "@school-student-teacher-management/db/constants/demographics";
import {
  APPOINTMENT_TYPES,
  EMPLOYMENT_STATUSES,
} from "@school-student-teacher-management/db/constants/teachers";
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

type Staff = typeof staff.$inferSelect;

interface TeacherFormProps {
  formId: string;
  initialData?: Staff;
  onSubmit: (data: unknown) => Promise<void>;
  isLoading?: boolean;
  isEdit?: boolean;
}

const createValidationSchema = () =>
  v.pick(staffInsertSchema, [
    "name",
    "email",
    "nic",
    "phone",
    "gender",
    "birthDate",
  ]);

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
        newErrors[path as string] = issue.message;
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
      toast.error(error instanceof Error ? error.message : "An error occurred");
    }
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      <FieldSet>
        <FieldLegend>Basic Information</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel>Name *</FieldLabel>
            <Input
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="John Doe"
              disabled={isLoading}
              data-invalid={errors.name ? true : undefined}
            />
            {errors.name && <FieldError>{errors.name}</FieldError>}
          </Field>

          <Field>
            <FieldLabel>Email *</FieldLabel>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              placeholder="john@school.edu.lk"
              disabled={isLoading}
              data-invalid={errors.email ? true : undefined}
            />
            {errors.email && <FieldError>{errors.email}</FieldError>}
          </Field>

          <Field>
            <FieldLabel>Phone</FieldLabel>
            <Input
              value={formData.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
              placeholder="+947XXXXXXXX"
              disabled={isLoading}
              data-invalid={errors.phone ? true : undefined}
            />
            <FieldDescription>
              Sri Lankan phone number (normalized to +94 format)
            </FieldDescription>
            {errors.phone && <FieldError>{errors.phone}</FieldError>}
          </Field>

          <Field>
            <FieldLabel>NIC</FieldLabel>
            <Input
              value={formData.nic}
              onChange={(e) => handleChange("nic", e.target.value)}
              placeholder="123456789V or 123456789012345"
              disabled={isLoading}
              data-invalid={errors.nic ? true : undefined}
            />
            <FieldDescription>
              Old format (9 digits + V) or new format (12 digits)
            </FieldDescription>
            {errors.nic && <FieldError>{errors.nic}</FieldError>}
          </Field>

          <Field>
            <FieldLabel>Gender</FieldLabel>
            <Select
              value={formData.gender}
              onValueChange={(value) => handleChange("gender", value ?? "")}
            >
              <SelectTrigger disabled={isLoading}>
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
          </Field>

          <Field>
            <FieldLabel>Birth Date</FieldLabel>
            <Input
              type="date"
              value={formData.birthDate}
              onChange={(e) => handleChange("birthDate", e.target.value)}
              disabled={isLoading}
            />
          </Field>
        </FieldGroup>
      </FieldSet>

      {isEdit && (
        <>
          <Separator />

          <FieldSet>
            <FieldLegend>Employment Information</FieldLegend>
            <FieldGroup>
              <Field>
                <FieldLabel>Appointment Type</FieldLabel>
                <Select
                  value={formData.appointmentType || ""}
                  onValueChange={(value) =>
                    handleChange("appointmentType", value || "")
                  }
                >
                  <SelectTrigger disabled={isLoading}>
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
              </Field>

              <Field>
                <FieldLabel>Employment Status</FieldLabel>
                <Select
                  value={formData.employmentStatus || ""}
                  onValueChange={(value) =>
                    handleChange("employmentStatus", value || "")
                  }
                >
                  <SelectTrigger disabled={isLoading}>
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
              </Field>
            </FieldGroup>
          </FieldSet>
        </>
      )}
    </form>
  );
};
