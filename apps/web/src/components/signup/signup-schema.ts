import * as v from "valibot";

export type AccountType = "user" | "teacher";

export interface FormState {
  accountType: AccountType;
  name: string;
  nic: string;
  email: string;
  phone: string;
  staffCategory: string;
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
  staffCategory: "",
  password: "",
  confirmPassword: "",
};

/** NIC validation mirrors the server schema (9 digits + V/X, or 12 digits). */
const NIC_PATTERN = /^(?<nic>\d{9}[VvXx]|\d{12})$/u;

const EMAIL_SCHEMA = v.pipe(v.string(), v.email());

/**
 * Client-side mirror of the server schema. Kept in one place so both account
 * types validate through the same branch that decides which fields are even
 * collected — a `user` is never asked for a NIC, so never fails on one.
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

  if (isTeacher && !NIC_PATTERN.test(form.nic.trim())) {
    errors.nic = "Enter a valid NIC (e.g. 199912345678 or 991234567V)";
  }

  if (isTeacher && !form.staffCategory) {
    errors.staffCategory = "Select your staff category";
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
    staffCategory: form.staffCategory as "teacher" | "officeStaff",
    password: form.password,
  };
};
