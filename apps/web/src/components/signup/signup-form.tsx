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
  toSignupPayload,
  validateSignup,
} from "@/components/signup/signup-schema";
import { SignupSuccess } from "@/components/signup/signup-success";
import { formatApiErrorMessage, validationFieldErrors } from "@/lib/api-error";
import { descriptionId, errorId, fieldA11y } from "@/lib/field-a11y";
import { orpc } from "@/utils/orpc";

/**
 * There is no "Staff category" field here, and its absence is the decision.
 *
 * The form used to ask for one — a `Teacher / Office Staff` select — and it was
 * a question with exactly one reachable answer and no server behind it. Every
 * self-registration through this form is a `teacher` account, because office
 * staff deliberately have **no** self-service path: their accounts are issued by
 * an administrator, who creates the staff record and hands over the login (see
 * `signupStaff`'s own doc comment in `packages/api/src/routers/staff/signup.ts`).
 * `teacherSignupSchema` has no category field, so the value was dropped on the
 * floor — and the select was the only control in the form that was not in
 * `FormState`, which is exactly how it was found: four type errors, one control,
 * no behaviour behind it.
 *
 * A person choosing "Office Staff" here was being offered an account the College
 * does not issue by this route, and the refusal would have come much later, from
 * the approval queue, with no way back. The form asks for what a teacher sign-up
 * actually needs and nothing else.
 */

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
    panel: "bg-surface-deep",
    form: "text-primary-foreground",
    kicker: "text-accent",
    heading: "text-primary-foreground",
    intro: "text-primary-foreground/70",
    submit: "bg-accent text-surface-deep hover:bg-accent-hover",
    toggleActive: "bg-accent text-surface-deep",
    toggleIdle:
      "bg-primary-foreground/8 text-primary-foreground/70 hover:bg-primary-foreground/14",
    toggleTextActive: "text-surface-deep",
    toggleTextIdle: "text-primary-foreground/70",
  },
  user: {
    panel: "bg-[#F4F6F1]",
    form: "text-foreground",
    kicker: "text-[#0B5E1A]",
    heading: "text-foreground",
    intro: "text-muted-foreground",
    submit: "bg-[#0B5E1A] text-primary-foreground hover:bg-[#084512]",
    toggleActive: "bg-primary text-primary-foreground",
    toggleIdle: "bg-primary/6 text-muted-foreground hover:bg-primary/12",
    toggleTextActive: "text-primary-foreground",
    toggleTextIdle: "text-muted-foreground",
  },
};
const INPUT_CLASS =
  "w-full border border-input bg-white/70 px-[15px] py-[13px] text-base text-foreground outline-none placeholder:text-muted-foreground focus:bg-white focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring aria-invalid:border-destructive sm:text-[0.9375rem]";

const getSubmitLabel = (isTeacher: boolean, isSubmitting: boolean) => {
  if (isSubmitting) {
    return "Creating account…";
  }
  return isTeacher ? "Sign up as staff" : "Create account";
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
  <fieldset className="m-0 grid min-w-0 grid-cols-2 gap-2 border-0 p-0">
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
          <span className="block text-sm font-bold">
            {type === "user" ? "User" : "Teacher / staff"}
          </span>
          <span
            className={`mt-1 block text-[0.8125rem] leading-snug ${isActive ? theme.toggleTextActive : theme.toggleTextIdle}`}
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
  /** `id` of the control rendered in `children`. */
  id: string;
  label: string;
  error?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}

/** Label, control, hint and error. Pair the control with `controlA11y`. */
const SignupField = ({
  id,
  label,
  error,
  hint,
  children,
}: SignupFieldProps) => (
  <div className="mb-[clamp(12px,2vh,18px)]">
    <label htmlFor={id} className="mb-2 block text-sm font-semibold">
      {label}
    </label>
    {children}
    {hint && (
      <p id={descriptionId(id)} className="m-0 mt-1.5 text-sm opacity-80">
        {hint}
      </p>
    )}
    {error && (
      <p
        id={errorId(id)}
        role="alert"
        className="text-destructive m-0 mt-1.5 text-sm font-medium"
      >
        {error}
      </p>
    )}
  </div>
);

/** `id` / `aria-invalid` / `aria-describedby` for a `SignupField` control. */
const controlA11y = (id: string, error?: string, hasHint = false) =>
  fieldA11y(id, { error, hasDescription: hasHint });

const PasswordField = ({
  id,
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
  id: string;
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
  <SignupField id={id} label={label} error={error} hint={hint}>
    <div className="relative">
      <input
        {...controlA11y(id, error, Boolean(hint))}
        type={showPassword ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        style={showToggle ? { paddingRight: 76 } : undefined}
        disabled={disabled}
        className={INPUT_CLASS}
      />
      {showToggle && (
        <button
          type="button"
          onClick={onToggleShow}
          aria-controls={id}
          aria-pressed={showPassword}
          aria-label={showPassword ? "Hide passwords" : "Show passwords"}
          className="absolute top-1/2 right-1.5 flex min-h-9 min-w-14 -translate-y-1/2 items-center justify-center px-2 text-sm font-semibold underline decoration-current/40 underline-offset-4 opacity-80 hover:opacity-100"
        >
          {showPassword ? "Hide" : "Show"}
        </button>
      )}
    </div>
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
      eyebrow={isTeacher ? "For College staff" : "Get an account"}
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
            <p className={`type-eyebrow ${theme.kicker}`}>
              {isTeacher ? "Staff sign-up" : "Sign up"}
            </p>
            <h1 className={`type-page-title m-0 mt-2 ${theme.heading}`}>
              {isTeacher ? "Join the College system" : "Create your account"}
            </h1>
            <p className={`type-body mt-2.5 ${theme.intro}`}>
              {isTeacher
                ? "Teachers and office staff — your username will be your NIC number, so there’s nothing extra to remember."
                : "Your email address is your username. An administrator can grant staff access later if you need it."}
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <SignupField id="signup-name" label="Full name" error={errors.name}>
              <input
                {...controlA11y("signup-name", errors.name)}
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
                id="signup-nic"
                label="NIC number"
                error={errors.nic}
                hint={
                  <>
                    This becomes your <strong>username</strong> for signing in.
                  </>
                }
              >
                <input
                  {...controlA11y("signup-nic", errors.nic, true)}
                  type="text"
                  autoComplete="off"
                  value={form.nic}
                  onChange={(e) => setField("nic", e.target.value)}
                  placeholder="e.g. 199912345678 or 991234567V"
                  disabled={isSubmitting}
                  className={INPUT_CLASS}
                />
              </SignupField>
            )}

            <SignupField
              id="signup-email"
              label="Email"
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
                {...controlA11y("signup-email", errors.email, !isTeacher)}
                type="email"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                placeholder="e.g. you@example.com"
                autoComplete="email"
                disabled={isSubmitting}
                className={INPUT_CLASS}
              />
            </SignupField>

            {isTeacher && (
              <SignupField id="signup-phone" label="PHONE (OPTIONAL)">
                <input
                  {...controlA11y("signup-phone")}
                  type="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                  placeholder="e.g. 071 234 5678"
                  autoComplete="tel"
                  disabled={isSubmitting}
                  className={INPUT_CLASS}
                />
              </SignupField>
            )}

            <PasswordField
              id="signup-password"
              label="Password"
              value={form.password}
              onChange={(value) => setField("password", value)}
              error={errors.password}
              hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
              autoComplete="new-password"
              showToggle
              showPassword={showPassword}
              onToggleShow={() => setShowPassword((shown) => !shown)}
              disabled={isSubmitting}
            />

            <PasswordField
              id="signup-confirm-password"
              label="Confirm password"
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
              className={`block w-full py-3.5 text-center text-[0.9375rem] font-bold tracking-[0.01em] transition-colors disabled:opacity-60 ${theme.submit}`}
            >
              {getSubmitLabel(isTeacher, isSubmitting)}
            </button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-3.5 border-t border-current/12 pt-[clamp(12px,2vh,20px)] text-sm opacity-75">
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
            <span className="text-xs font-bold tracking-[0.2em]">
              CERTA VIRILITER
            </span>
          </div>
        </div>
      </div>
    </AuthSplitLayout>
  );
};
