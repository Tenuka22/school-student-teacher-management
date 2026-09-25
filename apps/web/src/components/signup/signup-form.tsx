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
    kicker: string;
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
    kicker: "text-accent",
    heading: "text-primary-foreground",
    intro: "text-primary-foreground/70",
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
    kicker: "text-success",
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
  "w-full border border-current/22 bg-white/70 px-[15px] py-[13px] text-sm text-primary outline-none placeholder:text-primary/38 focus:border-primary focus:bg-white";

const getSubmitLabel = (isTeacher: boolean, isSubmitting: boolean) => {
  if (isSubmitting) {
    return "CREATING ACCOUNT...";
  }
  return isTeacher ? "SIGN UP AS STAFF" : "CREATE ACCOUNT";
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
    <legend className="sr-only">Account type</legend>
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
            {type === "user" ? "USER" : "TEACHER"}
          </span>
          <span
            className={`mt-1 block text-xs leading-tight ${isActive ? theme.toggleTextActive : theme.toggleTextIdle}`}
          >
            {type === "user"
              ? "Email sign-in, no staff record"
              : "NIC identity and staff access"}
          </span>
        </button>
      );
    })}
  </fieldset>
);

interface SignupFieldProps {
  label: string;
  error?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}

const SignupField = ({ label, error, hint, children }: SignupFieldProps) => (
  <label className="mb-[clamp(12px,2vh,18px)] block">
    <span className="mb-2 block text-xs font-bold tracking-[0.16em]">
      {label}
    </span>
    {children}
    {hint && <span className="mt-1.5 block text-xs opacity-60">{hint}</span>}
    {error && (
      <span className="text-destructive mt-1.5 block text-xs">{error}</span>
    )}
  </label>
);

const PasswordField = ({
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
}: {
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
}) => (
  <SignupField label={label} error={error} hint={hint}>
    <span className="relative block">
      <input
        type={showPassword ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        style={showToggle ? { paddingRight: 70 } : undefined}
        disabled={disabled}
        className={INPUT_CLASS}
      />
      {showToggle && (
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute top-1/2 right-[13px] -translate-y-1/2 border-b border-current/30 text-xs font-extrabold tracking-[0.1em] opacity-60"
        >
          {showPassword ? "HIDE" : "SHOW"}
        </button>
      )}
    </span>
  </SignupField>
);

export const SignupForm = () => {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
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
        }
        toast.error(
          formatApiErrorMessage(error, "Sign up failed. Please try again.")
        );
      },
    })
  );

  const setField = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const setAccountType = (accountType: AccountType) => {
    setForm({ ...EMPTY_FORM, accountType });
    setErrors({});
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const nextErrors = validateSignup(form);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
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
      eyebrow={isTeacher ? "FOR COLLEGE STAFF" : "GET AN ACCOUNT"}
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
            <p
              className={`text-xs font-bold tracking-[0.32em] ${theme.kicker}`}
            >
              {isTeacher ? "STAFF SIGN UP" : "SIGN UP"}
            </p>
            <h1
              className={`font-heading m-0 mt-2 text-[clamp(26px,4vh,38px)] leading-[1.05] font-semibold ${theme.heading}`}
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              {isTeacher ? "Join the College system" : "Create your account"}
            </h1>
            <p className={`mt-2 text-[13.5px] leading-[1.55] ${theme.intro}`}>
              {isTeacher
                ? "Teachers and office staff — your username will be your NIC number, so there’s nothing extra to remember."
                : "Your email address is your username. An administrator can grant staff access later if you need it."}
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <SignupField label="FULL NAME" error={errors.name}>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="A. B. Perera"
                autoComplete="name"
                disabled={isSubmitting}
                className={INPUT_CLASS}
              />
            </SignupField>

            {isTeacher && (
              <SignupField
                label="NIC NUMBER"
                error={errors.nic}
                hint={
                  <>
                    This becomes your <strong>username</strong> for signing in.
                  </>
                }
              >
                <input
                  type="text"
                  value={form.nic}
                  onChange={(e) => setField("nic", e.target.value)}
                  placeholder="199912345678 or 991234567V"
                  disabled={isSubmitting}
                  className={INPUT_CLASS}
                />
              </SignupField>
            )}

            <SignupField
              label="EMAIL"
              error={errors.email}
              hint={
                isTeacher ? undefined : (
                  <>
                    This becomes your <strong>username</strong> too.
                  </>
                )
              }
            >
              <input
                type="email"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={isSubmitting}
                className={INPUT_CLASS}
              />
            </SignupField>

            {isTeacher && (
              <SignupField label="PHONE (OPTIONAL)">
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                  placeholder="07X XXX XXXX"
                  autoComplete="tel"
                  disabled={isSubmitting}
                  className={INPUT_CLASS}
                />
              </SignupField>
            )}

            {isTeacher && (
              <p className="text-[12.5px] leading-relaxed opacity-75">
                Office staff accounts are issued by the College administrator,
                who creates the record and hands over the login. Register here
                if you are joining as a teacher.
              </p>
            )}

            <PasswordField
              label="PASSWORD"
              value={form.password}
              onChange={(value) => setField("password", value)}
              error={errors.password}
              hint="At least 8 characters."
              autoComplete="new-password"
              showToggle
              showPassword={showPassword}
              onToggleShow={() => setShowPassword((shown) => !shown)}
              disabled={isSubmitting}
            />

            <PasswordField
              label="CONFIRM PASSWORD"
              value={form.confirmPassword}
              onChange={(value) => setField("confirmPassword", value)}
              error={errors.confirmPassword}
              autoComplete="new-password"
              showPassword={showPassword}
              onToggleShow={() => setShowPassword((shown) => !shown)}
              disabled={isSubmitting}
            />

            <button
              type="submit"
              disabled={isSubmitting}
              className={`block w-full py-[15px] text-center text-[13.5px] font-extrabold tracking-[0.08em] transition-colors disabled:opacity-60 ${theme.submit}`}
            >
              {getSubmitLabel(isTeacher, isSubmitting)}
            </button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-3.5 border-t border-current/12 pt-[clamp(12px,2vh,20px)] text-[12.5px] opacity-70">
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
