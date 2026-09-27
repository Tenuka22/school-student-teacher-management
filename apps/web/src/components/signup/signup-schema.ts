import {
  NIC_FORMAT_MESSAGE,
  isValidNicFormat,
} from "@school-student-teacher-management/db/schema/primitives";
import * as v from "valibot";

export type AccountType = "user" | "teacher";

export interface FormState {
  accountType: AccountType;
  name: string;
  nic: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
}

export type FormErrors = Partial<Record<keyof FormState, string>>;

/**
 * Validation order.
 *
 * Also the focus order on failure: the first field in this list that has an
 * error is the one that receives focus, so a person who filled in three fields
 * and missed the fourth is put in front of the fourth rather than the first.
 */
export const SIGNUP_FIELD_ORDER = [
  "name",
  "nic",
  "email",
  "phone",
  "password",
  "confirmPassword",
] as const satisfies readonly (keyof FormState)[];

export const EMPTY_FORM: FormState = {
  accountType: "user",
  name: "",
  nic: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
};

const EMAIL_SCHEMA = v.pipe(v.string(), v.email());

/** 8 characters minimum, matching what the server will accept. */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Client-side mirror of the server schema. Kept in one place so both account
 * types validate through the same branch that decides which fields are even
 * collected — a `user` is never asked for a NIC, so never fails on one.
 *
 * The NIC rule is the `staff` table's own, imported rather than restated: a
 * form that accepts `123456789X` and a table that refuses it produces an
 * account with no staff record behind it.
 *
 * Every message names the problem **and** the recovery. "Invalid value" names
 * neither, and a person who cannot tell what to type next simply stops.
 */
export const validateSignup = (form: FormState): FormErrors => {
  const errors: FormErrors = {};
  const isTeacher = form.accountType === "teacher";

  if (!form.name.trim()) {
    errors.name =
      "Enter your full name — the College uses it to address you on the staff record.";
  }

  if (isTeacher && !isValidNicFormat(form.nic.trim())) {
    errors.nic = `${NIC_FORMAT_MESSAGE} Your NIC becomes your sign-in username, so it has to be the one the College holds.`;
  }

  if (!v.is(EMAIL_SCHEMA, form.email.trim())) {
    errors.email =
      "That does not look like an email address. Use the form name@domain, and check for a missing @ or a space.";
  }

  if (
    isTeacher &&
    form.phone.trim() &&
    !/^[+\d][\d\s()-]{6,}$/u.test(form.phone.trim())
  ) {
    errors.phone =
      "That does not look like a telephone number. Use digits, spaces and an optional leading +, or leave the field empty.";
  }

  if (form.password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `Use at least ${PASSWORD_MIN_LENGTH} characters. Nothing has been submitted yet, so the rest of the form is still filled in.`;
  }

  if (form.password !== form.confirmPassword) {
    errors.confirmPassword =
      "The two passwords are different. Retype the confirmation so it matches the one above.";
  }

  return errors;
};

/** The first field with an error, in reading order. */
export const firstInvalidField = (
  errors: FormErrors,
  isTeacher: boolean
): keyof FormState | null => {
  for (const field of SIGNUP_FIELD_ORDER) {
    if (field === "nic" && !isTeacher) {
      continue;
    }

    if (errors[field]) {
      return field;
    }
  }

  return null;
};

/** Builds the mutation payload for whichever account type is being created. */
export const toSignupPayload = (form: FormState) => {
  const base = { name: form.name.trim(), email: form.email.trim() };

  if (form.accountType === "user") {
    return { accountType: "user" as const, ...base, password: form.password };
  }

  return {
    accountType: "teacher" as const,
    ...base,
    nic: form.nic.trim(),
    phone: form.phone.trim() || undefined,
    password: form.password,
  };
};
