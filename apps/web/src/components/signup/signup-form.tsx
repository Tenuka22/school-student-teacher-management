import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AuthSplitLayout } from "@/components/auth-layout";
import type {
  AccountType,
  FormErrors,
  FormState,
} from "@/components/signup/signup-schema";
import {
  EMPTY_FORM,
  PASSWORD_MIN_LENGTH,
  firstInvalidField,
  toSignupPayload,
  validateSignup,
} from "@/components/signup/signup-schema";
import { SignupSuccess } from "@/components/signup/signup-success";
import { formatApiErrorMessage, validationFieldErrors } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

/**
 * A `teacher` is on the College's establishment, so the form is long and the
 * theme deepens to the formal green — a staff-facing surface. A `user` is just
 * someone with an account, so the form collapses to name, email and password
 * and the theme stays light. The palette difference is deliberate: it should
 * be obvious at a glance which kind of account is being created.
 */
const THEMES: Record<
  AccountType,
  {
    panel: string;
    form: string;
    heading: string;
    intro: string;
    submit: string;
    toggleActive: string;
    toggleIdle: string;
    toggleTextActive: string;
    toggleTextIdle: string;
  }
> = {
  teacher: {
    panel: "bg-sidebar",
    form: "text-primary-foreground",
    heading: "text-primary-foreground",
    intro: "text-primary-foreground/75",
    submit: "bg-accent text-sidebar hover:bg-accent-hover",
    toggleActive: "bg-accent text-sidebar",
    toggleIdle:
      "bg-primary-foreground/8 text-primary-foreground/70 hover:bg-primary-foreground/14",
    toggleTextActive: "text-sidebar",
    toggleTextIdle: "text-primary-foreground/70",
  },
  user: {
    panel: "bg-[#F4F6F1]",
    form: "text-primary",
    heading: "text-primary",
    intro: "text-primary/70",
    submit: "bg-success text-primary-foreground hover:bg-[#084512]",
    toggleActive: "bg-primary text-primary-foreground",
    toggleIdle: "bg-primary/6 text-primary/70 hover:bg-primary/12",
    toggleTextActive: "text-primary-foreground",
    toggleTextIdle: "text-primary/70",
  },
};

const INPUT_CLASS =
  "w-full border border-current/25 bg-white px-[15px] py-[13px] text-sm text-primary outline-none placeholder:text-primary/70 focus:border-primary focus:bg-white";

const FIELD_IDS: Record<string, string> = {
  name: "signup-name",
  nic: "signup-nic",
  email: "signup-email",
  phone: "signup-phone",
  password: "signup-password",
  confirmPassword: "signup-confirm-password",
};

/**
 * Focus the first field that needs work.
 *
 * By id rather than by a ref map: every field already carries a stable `id` for
 * its `<label for>`, so a second parallel structure of refs would have to be
 * kept in step with the labels for no benefit. Module scope, because it closes
 * over nothing — rebuilding it each render would break memoized children. Only
 * ever called from a submit handler, so `document` is available.
 */
const focusField = (field: string) => {
  document.querySelector<HTMLElement>(`#${FIELD_IDS[field]}`)?.focus();
};

const getSubmitLabel = (isTeacher: boolean, isSubmitting: boolean) => {
  if (isSubmitting) {
    return "CREATING ACCOUNT…";
  }
  return isTeacher ? "CREATE STAFF ACCOUNT" : "CREATE ACCOUNT";
};

const AccountTypeToggle = ({
  value,
  theme,
  onChange,
}: {
  value: AccountType;
  theme: (typeof THEMES)[AccountType];
  onChange: (next: AccountType) => void;
}) => (
  <fieldset className="grid grid-cols-2 gap-2">
    <legend className="sr-only">What kind of account do you need?</legend>
    {(["user", "teacher"] as const).map((type) => {
      const isActive = value === type;
      return (
        <button
          key={type}
          type="button"
          aria-pressed={isActive}
          onClick={() => onChange(type)}
          className={`px-4 py-3 text-left transition-colors ${isActive ? theme.toggleActive : theme.toggleIdle}`}
        >
          <span className="block text-[13px] font-extrabold tracking-[0.08em]">
            {type === "user" ? "GENERAL ACCOUNT" : "COLLEGE STAFF"}
          </span>
          <span
            className={`mt-1 block text-xs leading-tight ${isActive ? theme.toggleTextActive : theme.toggleTextIdle}`}
          >
            {type === "user"
              ? "Sign in with your email address"
              : "NIC number becomes your username"}
          </span>
        </button>
      );
    })}
  </fieldset>
);

interface SignupFieldProps {
  field: keyof FormState;
  label: string;
  error?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * A labelled control with its hint and its error bound to the input, not just
 * printed near it. `aria-describedby` is what makes a screen reader read
 * "This does not look like an email address" out as part of the field rather
 * than as loose text somewhere below the form.
 */
const SignupField = ({
  field,
  label,
  error,
  hint,
  children,
}: SignupFieldProps) => {
  const id = FIELD_IDS[field];
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <div className="mb-[clamp(12px,2vh,18px)]">
      <label
        className="mb-2 block text-xs font-bold tracking-[0.16em]"
        htmlFor={id}
      >
        {label}
      </label>
      {children}
      {hint ? (
        <span className="mt-1.5 block text-xs opacity-70" id={hintId}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span
          className="text-destructive mt-1.5 block text-xs leading-relaxed"
          id={errorId}
        >
          {error}
        </span>
      ) : null}
    </div>
  );
};

/** Wires the ids `SignupField` renders so the input can reference them. */
const fieldAria = (
  field: keyof FormState,
  error?: string,
  hasHint?: boolean
) => {
  const id = FIELD_IDS[field];
  const describedBy = [
    hasHint ? `${id}-hint` : null,
    error ? `${id}-error` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    id,
    "aria-describedby": describedBy === "" ? undefined : describedBy,
    "aria-invalid": error ? true : undefined,
  } as const;
};

const PasswordField = ({
  field,
  label,
  value,
  onChange,
  error,
  hint,
  autoComplete,
  showToggle,
  showPassword,
  onToggleShow,
  disabled,
  inputRef,
}: {
  field: keyof FormState;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  autoComplete: string;
  showToggle?: boolean;
  showPassword: boolean;
  onToggleShow: () => void;
  disabled: boolean;
  inputRef?: (node: HTMLInputElement | null) => void;
}) => (
  <SignupField field={field} error={error} hint={hint} label={label}>
    <span className="relative block">
      <input
        type={showPassword ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        style={showToggle ? { paddingRight: 70 } : undefined}
        disabled={disabled}
        className={INPUT_CLASS}
        ref={inputRef}
        {...fieldAria(field, error, Boolean(hint))}
      />
      {showToggle ? (
        <button
          type="button"
          aria-pressed={showPassword}
          onClick={onToggleShow}
          className="absolute top-1/2 right-[13px] -translate-y-1/2 border-b border-current/40 text-xs font-extrabold tracking-[0.1em] opacity-70"
        >
          {showPassword ? "HIDE" : "SHOW"}
          <span className="sr-only"> password</span>
        </button>
      ) : null}
    </span>
  </SignupField>
);

interface SignupFieldsProps {
  form: FormState;
  errors: FormErrors;
  isTeacher: boolean;
  isSubmitting: boolean;
  showPassword: boolean;
  theme: (typeof THEMES)[AccountType];
  onFieldChange: (field: keyof FormState, value: string) => void;
  onToggleShowPassword: () => void;
  onSubmit: (event: React.FormEvent) => void;
}
/**
 * Every control on the sign-up form, in reading order.
 *
 * Split out of `SignupForm` so the submit logic and the field list can be
 * read separately. It owns no state: everything it renders is a prop, which
 * is what lets the parent clear one field error without discarding the rest
 * of the form.
 */
const SignupFields = ({
  form,
  errors,
  isTeacher,
  isSubmitting,
  showPassword,
  theme,
  onFieldChange,
  onToggleShowPassword,
  onSubmit,
}: SignupFieldsProps) => (
  <form noValidate onSubmit={onSubmit}>
    <SignupField field="name" error={errors.name} label="FULL NAME">
      <input
        type="text"
        value={form.name}
        onChange={(e) => onFieldChange("name", e.target.value)}
        placeholder="A. B. Perera"
        autoComplete="name"
        disabled={isSubmitting}
        className={INPUT_CLASS}
        {...fieldAria("name", errors.name)}
      />
    </SignupField>
    {isTeacher ? (
      <SignupField
        field="nic"
        error={errors.nic}
        hint={
          <>
            This becomes your <strong>username</strong> for signing in.
          </>
        }
        label="NIC NUMBER"
      >
        <input
          type="text"
          value={form.nic}
          onChange={(e) => onFieldChange("nic", e.target.value)}
          placeholder="199912345678 or 991234567V"
          autoComplete="off"
          spellCheck={false}
          disabled={isSubmitting}
          className={INPUT_CLASS}
          {...fieldAria("nic", errors.nic, true)}
        />
      </SignupField>
    ) : null}
    <SignupField
      field="email"
      error={errors.email}
      hint={
        isTeacher ? undefined : (
          <>
            This becomes your <strong>username</strong> too.
          </>
        )
      }
      label="EMAIL"
    >
      <input
        type="email"
        value={form.email}
        onChange={(e) => onFieldChange("email", e.target.value)}
        placeholder="you@example.com"
        autoComplete="email"
        disabled={isSubmitting}
        className={INPUT_CLASS}
        {...fieldAria("email", errors.email, !isTeacher)}
      />
    </SignupField>
    {isTeacher ? (
      <SignupField field="phone" error={errors.phone} label="PHONE (OPTIONAL)">
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => onFieldChange("phone", e.target.value)}
          placeholder="07X XXX XXXX"
          autoComplete="tel"
          disabled={isSubmitting}
          className={INPUT_CLASS}
          {...fieldAria("phone", errors.phone)}
        />
      </SignupField>
    ) : null}
    <PasswordField
      field="password"
      label="PASSWORD"
      value={form.password}
      onChange={(value) => onFieldChange("password", value)}
      error={errors.password}
      hint={`At least ${PASSWORD_MIN_LENGTH} characters. Choose something you have not used elsewhere.`}
      autoComplete="new-password"
      showToggle
      showPassword={showPassword}
      onToggleShow={onToggleShowPassword}
      disabled={isSubmitting}
    />
    <PasswordField
      field="confirmPassword"
      label="CONFIRM PASSWORD"
      value={form.confirmPassword}
      onChange={(value) => onFieldChange("confirmPassword", value)}
      error={errors.confirmPassword}
      autoComplete="new-password"
      showPassword={showPassword}
      onToggleShow={onToggleShowPassword}
      disabled={isSubmitting}
    />
    <button
      type="submit"
      disabled={isSubmitting}
      className={`block w-full min-w-[14rem] py-[15px] text-center text-[13.5px] font-extrabold tracking-[0.08em] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${theme.submit}`}
    >
      {getSubmitLabel(isTeacher, isSubmitting)}
    </button>
  </form>
);

export const SignupForm = () => {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [createdUsername, setCreatedUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isTeacher = form.accountType === "teacher";
  const theme = THEMES[form.accountType];

  const signupMutation = useMutation(
    orpc.staff.signupStaff.mutationOptions({
      onSuccess: (data) => {
        setCreatedUsername(data.username);
      },
      onError: (error: Error) => {
        const fieldErrors = validationFieldErrors<keyof FormState>(error);
        if (Object.keys(fieldErrors).length > 0) {
          setErrors((prev) => ({ ...prev, ...fieldErrors }));
          setFormError(
            "The College server rejected part of this form. The fields it named are marked below — everything you typed is still here, so correct those and send it again."
          );
          const first = firstInvalidField(fieldErrors, isTeacher);
          if (first) {
            focusField(first);
          }
        } else {
          setFormError(
            `${formatApiErrorMessage(
              error,
              "The College server did not accept the registration."
            )} Nothing was created and nothing you typed has been lost — try again in a moment, and if it keeps failing tell an administrator.`
          );
        }
        toast.error(
          formatApiErrorMessage(
            error,
            "Registration failed. Your details are still on screen — try again."
          )
        );
      },
    })
  );

  const setField = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setFormError(null);
  };

  const setAccountType = (accountType: AccountType) => {
    setForm({ ...EMPTY_FORM, accountType });
    setErrors({});
    setFormError(null);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const nextErrors = validateSignup(form);
    setErrors(nextErrors);
    setFormError(null);

    const first = firstInvalidField(nextErrors, isTeacher);
    if (first) {
      setFormError(
        "Nothing was sent. Correct the field marked below — everything else you typed is still filled in."
      );
      focusField(first);
      return;
    }

    setIsSubmitting(true);
    signupMutation.mutate(toSignupPayload(form), {
      onSettled: () => setIsSubmitting(false),
    });
  };

  if (createdUsername) {
    return (
      <SignupSuccess
        heading={isTeacher ? "Staff account created" : "Account created"}
        message={
          isTeacher
            ? "Sign in with this username — your NIC — and the password you just chose."
            : "Sign in with your email address and the password you just chose."
        }
        username={createdUsername}
        crossLinkTo="/login"
        crossLinkText="Already have an account?"
        crossLinkLabel="Sign in"
        layoutTitle={isTeacher ? "Staff account created" : "Account created"}
      />
    );
  }

  return (
    <AuthSplitLayout
      eyebrow={isTeacher ? "FOR COLLEGE STAFF" : "GENERAL ACCOUNT"}
      title={isTeacher ? "Staff registration" : "Create an account"}
      subtitle={
        isTeacher
          ? "Your College details, verified by the administration before you get teacher access."
          : "One email, one password — no College records needed."
      }
    >
      <div className={theme.panel}>
        <div
          className={`flex flex-col gap-[clamp(14px,2.4vh,24px)] p-[clamp(20px,3.2vh,34px)_clamp(18px,2.6vw,32px)] ${theme.form}`}
        >
          <AccountTypeToggle
            value={form.accountType}
            theme={theme}
            onChange={setAccountType}
          />

          <div>
            <h1
              className={`font-heading m-0 text-[clamp(26px,4vh,38px)] leading-[1.05] font-semibold ${theme.heading}`}
            >
              {isTeacher ? "Register as College staff" : "Create your account"}
            </h1>
            <p className={`mt-2 text-[13.5px] leading-[1.55] ${theme.intro}`}>
              {isTeacher
                ? "Teachers and teaching assistants: your username will be your NIC number, so there is nothing extra to remember. Office staff accounts are issued by an administrator instead."
                : "Your email address is your username. An administrator can grant staff access later if you need it."}
            </p>
          </div>

          {formError ? (
            <p
              className="border-destructive bg-destructive/8 text-destructive m-0 border p-3 text-[12.5px] leading-[1.5]"
              role="alert"
            >
              {formError}
            </p>
          ) : null}

          <SignupFields
            errors={errors}
            form={form}
            isSubmitting={isSubmitting}
            isTeacher={isTeacher}
            onFieldChange={setField}
            onSubmit={handleSubmit}
            onToggleShowPassword={() => setShowPassword((shown) => !shown)}
            showPassword={showPassword}
            theme={theme}
          />

          <div className="flex flex-wrap items-center justify-between gap-3.5 border-t border-current/15 pt-[clamp(12px,2vh,20px)] text-[12.5px] opacity-75">
            <span>
              Already have an account?{" "}
              <Link
                search={{ switch: 1 }}
                to="/login"
                className="font-bold underline underline-offset-2"
              >
                Sign in
              </Link>
            </span>
            <span className="font-bold tracking-[0.18em] opacity-60">
              CERTA VIRILITER
            </span>
          </div>
        </div>
      </div>
    </AuthSplitLayout>
  );
};

/** Shown while the route's `beforeLoad` resolves the session. */
export const SignupSkeleton = () => (
  <div
    aria-busy="true"
    aria-live="polite"
    className="flex min-h-dvh items-center justify-center bg-[#FFF8E7] px-[clamp(20px,4vw,52px)] py-10"
  >
    <span className="sr-only">Checking your session…</span>
    <div className="w-full max-w-[28rem]">
      <div className="h-10 w-56 bg-[#013405]/15" />
      <div className="mt-8 flex flex-col gap-5">
        <div className="h-3 w-24 bg-[#013405]/12" />
        <div className="h-11 w-full bg-[#013405]/12" />
        <div className="h-3 w-24 bg-[#013405]/12" />
        <div className="h-11 w-full bg-[#013405]/12" />
        <div className="h-3 w-24 bg-[#013405]/12" />
        <div className="h-11 w-full bg-[#013405]/12" />
        <div className="mt-2 h-12 w-full bg-[#013405]/20" />
      </div>
    </div>
  </div>
);
