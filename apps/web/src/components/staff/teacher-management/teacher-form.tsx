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

type FormField = keyof FormData;
type FormErrors = Partial<Record<FormField | "form", string>>;

interface TeacherFieldSectionProps {
  formId: string;
  formData: FormData;
  errors: FormErrors;
  isLoading: boolean;
  onChange: (field: FormField, value: string) => void;
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

/**
 * Every field's DOM id suffix, in one place, because three things have to agree
 * on it: the control's `id`, the `<FieldError>`'s `id`, and the focus call that
 * sends the reader to the first field that failed. They used to be three
 * hand-written template strings with the dates hyphenated and the rest not,
 * which is the shape of bug where the focus lands on nothing.
 */
const FIELD_SUFFIX: Record<FormField, string> = {
  name: "name",
  email: "email",
  nic: "nic",
  phone: "phone",
  gender: "gender",
  birthDate: "birth-date",
  teacherServiceNo: "service-number",
  staffCategory: "staff-category",
  appointmentType: "appointment-type",
  appointmentDate: "appointment-date",
  employmentStatus: "employment-status",
};

/** The order a reader meets the fields in, and therefore the focus order on a failed submit. */
const FIELD_ORDER: FormField[] = [
  "nic",
  "name",
  "email",
  "phone",
  "gender",
  "birthDate",
  "staffCategory",
  "teacherServiceNo",
  "appointmentType",
  "appointmentDate",
  "employmentStatus",
];

const FIELD_LABEL: Record<FormField, string> = {
  name: "Name",
  email: "Email",
  nic: "NIC number",
  phone: "Phone",
  gender: "Gender",
  birthDate: "Birth date",
  teacherServiceNo: "Teacher service number",
  staffCategory: "Staff category",
  appointmentType: "Appointment type",
  appointmentDate: "Appointment date",
  employmentStatus: "Employment status",
};

/**
 * The asterisk, and the word behind it.
 *
 * A bare `*` is a shape, not a word: it is announced as "asterisk" or skipped
 * entirely, so the requirement is invisible to a screen-reader user. The glyph
 * stays for the reader who is looking at it and is `aria-hidden`; the sentence
 * beside it is what is announced, and it is on every required control.
 *
 * **Which fields carry it: `name` and `nic`, and only those two.** `staff.name`
 * is `notNull` and the NIC is the login username `createStaff` issues, so both
 * are required. Email is *not*, and this form used to label it `Email *` —
 * `staffColumnRefinements` types it `optionalNullable(emailSchema)` and
 * `normalizeFormData` drops the key when it is blank, so the asterisk was
 * promising the reader a constraint the database does not have. An asterisk that
 * lies is worse than no asterisk: it teaches an office clerk to hunt for a
 * requirement that does not exist and to distrust the ones that do.
 */
const RequiredMark = () => (
  <>
    <span aria-hidden="true" className="text-destructive">
      *
    </span>
    <span className="sr-only"> (required)</span>
  </>
);

const fieldDomId = (formId: string, field: FormField) =>
  `${formId}-${FIELD_SUFFIX[field]}`;

const fieldErrorId = (formId: string, field: FormField) =>
  `${fieldDomId(formId, field)}-error`;

/**
 * A separate id for a field's hint text.
 *
 * The hint used to reuse the control's own `id`, so `aria-describedby` pointed
 * a control at *itself* — the browser resolves the reference to the form
 * control and reads its value back as its own description, and the hint text
 * was never announced at all. `-hint` keeps the two apart.
 */
const fieldHintId = (formId: string, field: FormField) =>
  `${fieldDomId(formId, field)}-hint`;

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

/**
 * The id list a control points `aria-describedby` at.
 *
 * `undefined` when there is no error and no description, because
 * `aria-describedby={undefined}` is honest about there being nothing to read,
 * whereas a dangling id reference makes some screen readers announce the
 * element's own content a second time.
 */
const describedBy = (
  formId: string,
  field: FormField,
  errors: FormErrors,
  hasDescription: boolean
) => {
  const ids = [
    hasDescription ? fieldHintId(formId, field) : null,
    errors[field] ? fieldErrorId(formId, field) : null,
  ].filter((id): id is string => Boolean(id));

  return ids.length > 0 ? ids.join(" ") : undefined;
};

/**
 * The toast that accompanies a client-side rejection.
 *
 * It names the field rather than saying "validation errors", and it counts
 * rather than saying "errors" — a form with one bad field saying "please fix
 * 4 fields" sends the reader looking for three that do not exist. A pathless
 * valibot issue has no field to name, so it falls back to the form's own
 * summary line rather than inventing one.
 */
const describeInvalidFields = (nextErrors: FormErrors): string => {
  const invalidFields = FIELD_ORDER.filter((field) => nextErrors[field]);

  if (invalidFields.length === 1) {
    const [only] = invalidFields;
    return only ? `Please fix ${FIELD_LABEL[only]}` : "Please fix the form";
  }

  if (invalidFields.length > 1) {
    return `Please fix ${invalidFields.length} fields`;
  }

  return nextErrors.form ?? "Please fix the highlighted field";
};

const TeacherBasicFields = ({
  formId,
  formData,
  errors,
  isLoading,
  onChange,
}: TeacherFieldSectionProps) => (
  <FieldSet>
    <FieldLegend>Basic information</FieldLegend>
    <FieldGroup>
      <Field data-invalid={Boolean(errors.nic)}>
        <FieldLabel htmlFor={fieldDomId(formId, "nic")}>
          NIC number <RequiredMark />
        </FieldLabel>
        <Input
          id={fieldDomId(formId, "nic")}
          value={formData.nic}
          onChange={(event) => onChange("nic", event.target.value)}
          placeholder="199912345678 or 991234567V"
          disabled={isLoading}
          required
          aria-required="true"
          aria-invalid={Boolean(errors.nic)}
          aria-describedby={describedBy(formId, "nic", errors, true)}
          autoComplete="off"
          autoCapitalize="characters"
        />
        <FieldDescription id={fieldHintId(formId, "nic")}>
          This becomes the login username, and the password is issued after the
          teacher is created.
        </FieldDescription>
        {errors.nic && (
          <FieldError id={fieldErrorId(formId, "nic")}>{errors.nic}</FieldError>
        )}
      </Field>

      <Field data-invalid={Boolean(errors.name)}>
        <FieldLabel htmlFor={fieldDomId(formId, "name")}>
          Name <RequiredMark />
        </FieldLabel>
        <Input
          id={fieldDomId(formId, "name")}
          value={formData.name}
          onChange={(event) => onChange("name", event.target.value)}
          placeholder="John Doe"
          disabled={isLoading}
          required
          aria-required="true"
          aria-invalid={Boolean(errors.name)}
          autoComplete="name"
        />
        {errors.name && (
          <FieldError id={fieldErrorId(formId, "name")}>
            {errors.name}
          </FieldError>
        )}
      </Field>

      {/*
        Optional, and labelled as such rather than with an asterisk that the
        database does not enforce. `autoComplete="email"` so a returning staff
        member's browser offers the address rather than making them type it.
      */}
      <Field data-invalid={Boolean(errors.email)}>
        <FieldLabel htmlFor={fieldDomId(formId, "email")}>Email</FieldLabel>
        <Input
          id={fieldDomId(formId, "email")}
          type="email"
          value={formData.email}
          onChange={(event) => onChange("email", event.target.value)}
          placeholder="john@school.edu.lk"
          disabled={isLoading}
          aria-invalid={Boolean(errors.email)}
          autoComplete="email"
          autoCapitalize="off"
          spellCheck={false}
        />
        <FieldDescription id={fieldHintId(formId, "email")}>
          Optional. The account is created from the NIC; an address is only for
          reaching this teacher.
        </FieldDescription>
        {errors.email && (
          <FieldError id={fieldErrorId(formId, "email")}>
            {errors.email}
          </FieldError>
        )}
      </Field>

      <Field data-invalid={Boolean(errors.phone)}>
        <FieldLabel htmlFor={fieldDomId(formId, "phone")}>Phone</FieldLabel>
        <Input
          id={fieldDomId(formId, "phone")}
          type="tel"
          value={formData.phone}
          onChange={(event) => onChange("phone", event.target.value)}
          placeholder="+947XXXXXXXX"
          disabled={isLoading}
          aria-invalid={Boolean(errors.phone)}
          aria-describedby={describedBy(formId, "phone", errors, true)}
          autoComplete="tel"
        />
        <FieldDescription id={fieldHintId(formId, "phone")}>
          Sri Lankan phone number, normalized to +94 format.
        </FieldDescription>
        {errors.phone && (
          <FieldError id={fieldErrorId(formId, "phone")}>
            {errors.phone}
          </FieldError>
        )}
      </Field>

      <Field data-invalid={Boolean(errors.gender)}>
        <FieldLabel htmlFor={fieldDomId(formId, "gender")}>Gender</FieldLabel>
        <Select
          value={formData.gender}
          onValueChange={(value) => onChange("gender", value ?? "")}
        >
          <SelectTrigger
            id={fieldDomId(formId, "gender")}
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
        {errors.gender && (
          <FieldError id={fieldErrorId(formId, "gender")}>
            {errors.gender}
          </FieldError>
        )}
      </Field>

      <Field data-invalid={Boolean(errors.birthDate)}>
        <FieldLabel htmlFor={fieldDomId(formId, "birthDate")}>
          Birth date
        </FieldLabel>
        <DatePicker
          id={fieldDomId(formId, "birthDate")}
          value={formData.birthDate}
          onChange={(isoDate) => onChange("birthDate", isoDate)}
          disabled={isLoading}
          disableFuture
        />
        {errors.birthDate && (
          <FieldError id={fieldErrorId(formId, "birthDate")}>
            {errors.birthDate}
          </FieldError>
        )}
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
      <FieldLegend>Employment information</FieldLegend>
      <FieldGroup>
        <Field data-invalid={Boolean(errors.staffCategory)}>
          <FieldLabel htmlFor={fieldDomId(formId, "staffCategory")}>
            Staff category
          </FieldLabel>
          <Select
            value={formData.staffCategory}
            onValueChange={(value) =>
              onChange("staffCategory", value ?? "teacher")
            }
          >
            <SelectTrigger
              id={fieldDomId(formId, "staffCategory")}
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
          {/*
            This field is defaulted and the schema picks its enum, so a failure
            here is a server refusal rather than something the reader typed. It
            had `data-invalid` wired up and no `FieldError`, so a real rejection
            turned the control red and said nothing about why.
          */}
          {errors.staffCategory && (
            <FieldError id={fieldErrorId(formId, "staffCategory")}>
              {errors.staffCategory}
            </FieldError>
          )}
        </Field>

        <Field data-invalid={Boolean(errors.teacherServiceNo)}>
          <FieldLabel htmlFor={fieldDomId(formId, "teacherServiceNo")}>
            Teacher service number
          </FieldLabel>
          <Input
            id={fieldDomId(formId, "teacherServiceNo")}
            value={formData.teacherServiceNo}
            onChange={(event) =>
              onChange("teacherServiceNo", event.target.value.toUpperCase())
            }
            placeholder="T0142"
            disabled={isLoading}
            aria-invalid={Boolean(errors.teacherServiceNo)}
            aria-describedby={describedBy(
              formId,
              "teacherServiceNo",
              errors,
              true
            )}
            autoComplete="off"
            autoCapitalize="characters"
          />
          <FieldDescription id={fieldHintId(formId, "teacherServiceNo")}>
            Optional. A letter T followed by three to six digits, as issued by
            the College.
          </FieldDescription>
          {errors.teacherServiceNo && (
            <FieldError id={fieldErrorId(formId, "teacherServiceNo")}>
              {errors.teacherServiceNo}
            </FieldError>
          )}
        </Field>

        <Field data-invalid={Boolean(errors.appointmentType)}>
          <FieldLabel htmlFor={fieldDomId(formId, "appointmentType")}>
            Appointment type
          </FieldLabel>
          <Select
            value={formData.appointmentType}
            onValueChange={(value) => onChange("appointmentType", value ?? "")}
          >
            <SelectTrigger
              id={fieldDomId(formId, "appointmentType")}
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
            <FieldError id={fieldErrorId(formId, "appointmentType")}>
              {errors.appointmentType}
            </FieldError>
          )}
        </Field>

        <Field data-invalid={Boolean(errors.appointmentDate)}>
          <FieldLabel htmlFor={fieldDomId(formId, "appointmentDate")}>
            Appointment date
          </FieldLabel>
          <DatePicker
            id={fieldDomId(formId, "appointmentDate")}
            value={formData.appointmentDate}
            onChange={(isoDate) => onChange("appointmentDate", isoDate)}
            disabled={isLoading}
            disableFuture
          />
          {errors.appointmentDate && (
            <FieldError id={fieldErrorId(formId, "appointmentDate")}>
              {errors.appointmentDate}
            </FieldError>
          )}
        </Field>

        <Field data-invalid={Boolean(errors.employmentStatus)}>
          <FieldLabel htmlFor={fieldDomId(formId, "employmentStatus")}>
            Employment status
          </FieldLabel>
          <Select
            value={formData.employmentStatus}
            onValueChange={(value) => onChange("employmentStatus", value ?? "")}
          >
            <SelectTrigger
              id={fieldDomId(formId, "employmentStatus")}
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
            <FieldError id={fieldErrorId(formId, "employmentStatus")}>
              {errors.employmentStatus}
            </FieldError>
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
  const [errors, setErrors] = useState<FormErrors>({});
  /**
   * The in-flight guard, and it is local rather than the `isLoading` prop.
   *
   * `isLoading` is the parent's `mutation.isPending`, which is still `false` on
   * the tick between the click and the mutation entering its pending state.
   * Two clicks in that window ran `onSubmit` twice: two `createStaff` calls,
   * two issued passwords, and on the second one a server refusal for a
   * duplicate NIC reported against a form the user had already been told had
   * succeeded. The flag is set synchronously inside the submit handler, before
   * the first `await`.
   */
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isBusy = isLoading || isSubmitting;

  /**
   * A keystroke clears the error on the field that was typed into, and only
   * that one.
   *
   * The form-level summary is deliberately left standing: it is a statement
   * about the submission as a whole, so it is the next submit that replaces it.
   * Clearing it on the first character of an unrelated field would hide the one
   * error nobody has been told about yet.
   */
  const handleChange = useCallback((field: FormField, value: string) => {
    setFormData((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
  }, []);

  /**
   * Send focus to the first field that failed, in reading order.
   *
   * Without it a failed submit was a red field and a toast: the reader had to
   * go hunting for which of eleven fields the server was unhappy about. A
   * browser only moves focus for you on a *native* validation failure, and
   * this form validates with valibot, so nothing was moving focus.
   */
  const focusFirstInvalid = (nextErrors: FormErrors) => {
    const firstInvalid = FIELD_ORDER.find((field) => nextErrors[field]);
    if (!firstInvalid) {
      return;
    }
    /*
     * `querySelector` and not `getElementById`, for the compiler rather than
     * for taste. Every id here is built from a fixed prefix and a fixed suffix
     * list (`FIELD_SUFFIX`), so there is nothing to escape.
     */
    document
      .querySelector<HTMLElement>(`#${fieldDomId(formId, firstInvalid)}`)
      ?.focus();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isBusy) {
      return;
    }

    setIsSubmitting(true);

    const schema = isEdit ? editValidationSchema() : createValidationSchema();
    const result = v.safeParse(schema, normalizeFormData(formData, isEdit));

    if (!result.success) {
      const nextErrors: FormErrors = {};
      for (const issue of result.issues) {
        const issueKey = issue.path?.[0]?.key;
        /*
          An issue whose path is not a field on this form — including the
          pathless issue, which has no key at all — is reported on the form's
          own summary line. Writing it under an unknown key instead would store
          an error that no control renders and that `focusFirstInvalid` walks
          straight past, which is how a message ends up computed and then thrown
          away.
        */
        const field = FIELD_ORDER.find((candidate) => candidate === issueKey);
        nextErrors[field ?? "form"] = friendlyValidationMessage(
          issue.message,
          issue.type
        );
      }
      setErrors(nextErrors);
      focusFirstInvalid(nextErrors);
      toast.error(describeInvalidFields(nextErrors));
      setIsSubmitting(false);
      return;
    }

    try {
      await onSubmit(result.output);
      toast.success(
        isEdit ? "Teacher updated successfully" : "Teacher created successfully"
      );
    } catch (error) {
      /*
        The dialog only closes inside `onSubmit`'s own success path, so throwing
        here is what keeps the reader's input on screen. The server's field-level
        issues are mapped back onto the controls that caused them and the first
        one is focused, for the same reason as above.
      */
      const serverFieldErrors = validationFieldErrors<FormField>(error);
      const knownFieldErrors: FormErrors = {};
      for (const field of FIELD_ORDER) {
        const message = serverFieldErrors[field];
        if (message) {
          knownFieldErrors[field] = message;
        }
      }

      if (Object.keys(knownFieldErrors).length > 0) {
        setErrors((previous) => ({ ...previous, ...knownFieldErrors }));
        focusFirstInvalid(knownFieldErrors);
        toast.error(describeInvalidFields(knownFieldErrors));
      } else {
        toast.error(
          formatApiErrorMessage(
            error,
            isEdit ? "Failed to update teacher" : "Failed to create teacher"
          )
        );
      }
    }

    setIsSubmitting(false);
  };

  const sectionProps = {
    formId,
    formData,
    errors,
    isLoading: isBusy,
    onChange: handleChange,
  };

  return (
    /*
     * `noValidate` and `required` together, deliberately.
     *
     * The `required` attributes on Name and NIC are the machine-readable half of
     * "this field is required" — they are what a screen reader announces and
     * what the browser's own validation would act on. Left enabled, they would
     * also raise the browser's unstyled, untranslated validation bubble on the
     * first empty field, in front of the valibot messages this form actually
     * wrote, and the reader would get two errors per field in two voices.
     * `noValidate` keeps the semantics and hands validation back to the schema.
     */
    <form
      id={formId}
      onSubmit={handleSubmit}
      noValidate
      aria-busy={isBusy}
      className="flex flex-col gap-6"
    >
      {/*
        A valibot issue with no path lands on the `form` key, and there used to
        be no `form` key rendered anywhere — the message was computed and then
        dropped on the floor while a toast said "Please fix validation errors".
        It is a summary line above the fields: what is wrong, and which fields.
      */}
      {errors.form ? (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/5 text-destructive border px-3 py-2 text-xs"
        >
          {errors.form}
        </p>
      ) : null}
      <TeacherBasicFields {...sectionProps} />
      <TeacherEmploymentFields {...sectionProps} />
    </form>
  );
};
