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

/**
 * Client-side mirror of the server schema. Kept in one place so both account
 * types validate through the same branch that decides which fields are even
 * collected — a `user` is never asked for a NIC, so never fails on one.
 *
 * The NIC rule is the `staff` table's own, imported rather than restated: a
 * form that accepts `123456789X` and a table that refuses it produces an
 * account with no staff record behind it.
 */
export const validateSignup = (form: FormState): FormErrors => {
  const errors: FormErrors = {};
  const isTeacher = form.accountType === "teacher";

  if (!form.name.trim()) {
    errors.name = "Enter your full name";
  }

  if (!v.is(EMAIL_SCHEMA, form.email.trim())) {
    errors.email = "Enter a valid email address";
  }

  if (isTeacher && !isValidNicFormat(form.nic.trim())) {
    errors.nic = NIC_FORMAT_MESSAGE;
  }

  if (form.password.length < 8) {
    errors.password = "At least 8 characters";
  }

  if (form.password !== form.confirmPassword) {
    errors.confirmPassword = "Passwords do not match";
  }

  return errors;
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
