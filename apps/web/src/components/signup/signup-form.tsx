"use client";

import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Card,
  CardContent,
} from "@school-student-teacher-management/ui/components/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import { Input } from "@school-student-teacher-management/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

const STAFF_CATEGORY_OPTIONS = [
  { value: "teacher", label: "Teacher" },
  { value: "officeStaff", label: "Office Staff" },
] as const;

interface FormState {
  name: string;
  nic: string;
  email: string;
  phone: string;
  staffCategory: string;
  password: string;
  confirmPassword: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  nic: "",
  email: "",
  phone: "",
  staffCategory: "",
  password: "",
  confirmPassword: "",
};

/**NIC validation mirrors the server schema (9 digits + V/X, or 12 digits). */
const NIC_PATTERN = /^(?<nic>\d{9}[VvXx]|\d{12})$/u;

/**
 * Staff self-service sign-up. The **username is generated automatically**
 * from the NIC — the member never picks one — and is revealed once after
 * successful sign-up.
 */
export const SignupForm = () => {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<
    Partial<Record<keyof FormState, string>>
  >({});
  const [createdUsername, setCreatedUsername] = useState("");

  const signupMutation = useMutation(
    orpc.staff.signupStaff.mutationOptions({
      onSuccess: (data) => {
        setCreatedUsername(data.username);
      },
      onError: (error: Error) => {
        toast.error(error.message);
      },
    })
  );

  const setField = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const nextErrors: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) {
      nextErrors.name = "Enter your full name";
    }
    if (!NIC_PATTERN.test(form.nic.trim())) {
      nextErrors.nic = "Enter a valid NIC (e.g. 199912345678 or 991234567V)";
    }
    if (!form.email.includes("@")) {
      nextErrors.email = "Enter a valid email address";
    }
    if (!form.staffCategory) {
      nextErrors.staffCategory = "Select your staff category";
    }
    if (form.password.length < 8) {
      nextErrors.password = "At least 8 characters";
    }
    if (form.password !== form.confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    signupMutation.mutate({
      name: form.name.trim(),
      nic: form.nic.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      staffCategory: form.staffCategory as "teacher" | "officeStaff",
      password: form.password,
    });
  };

  if (createdUsername) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardContent className="space-y-4 p-8 text-center">
          <h1 className="font-heading text-3xl font-semibold">
            Account created
          </h1>
          <p className="text-muted-foreground text-sm">
            Your username is your NIC number. Sign in with it and your password.
          </p>
          <div className="bg-muted mx-auto w-fit rounded-md px-6 py-3 font-mono text-2xl font-bold tracking-wide">
            {createdUsername || "—"}
          </div>
          <Button
            className="w-full"
            onClick={() => {
              window.location.assign("/login");
            }}
          >
            Go to Sign In
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardContent className="p-8">
        <h1 className="font-heading text-3xl font-semibold">Staff Sign Up</h1>
        <p className="text-muted-foreground mt-2 mb-6 text-sm">
          Teachers and office staff — create your account. Your username will be
          your NIC number.
        </p>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="signup-name">Full name</FieldLabel>
              <Input
                id="signup-name"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="A. B. Perera"
                required
              />
              {errors.name && <FieldError>{errors.name}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="signup-nic">NIC number</FieldLabel>
              <Input
                id="signup-nic"
                value={form.nic}
                onChange={(e) => setField("nic", e.target.value)}
                placeholder="199912345678 or 991234567V"
                required
              />
              <FieldDescription>
                This becomes your <strong>username</strong> for signing in.
              </FieldDescription>
              {errors.nic && <FieldError>{errors.nic}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="signup-email">Email</FieldLabel>
              <Input
                id="signup-email"
                type="email"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                placeholder="you@example.com"
                required
              />
              {errors.email && <FieldError>{errors.email}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="signup-phone">Phone (optional)</FieldLabel>
              <Input
                id="signup-phone"
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
                placeholder="07X XXX XXXX"
              />
            </Field>

            <Field>
              <FieldLabel>Staff category</FieldLabel>
              <Select
                value={form.staffCategory}
                onValueChange={(value) =>
                  setField("staffCategory", value ?? "")
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {STAFF_CATEGORY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.staffCategory && (
                <FieldError>{errors.staffCategory}</FieldError>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="signup-password">Password</FieldLabel>
              <Input
                id="signup-password"
                type="password"
                value={form.password}
                onChange={(e) => setField("password", e.target.value)}
                required
              />
              <FieldDescription>At least 8 characters.</FieldDescription>
              {errors.password && <FieldError>{errors.password}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="signup-confirm">Confirm password</FieldLabel>
              <Input
                id="signup-confirm"
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setField("confirmPassword", e.target.value)}
                required
              />
              {errors.confirmPassword && (
                <FieldError>{errors.confirmPassword}</FieldError>
              )}
            </Field>

            <Button
              type="submit"
              className="w-full"
              disabled={signupMutation.isPending}
            >
              {signupMutation.isPending ? "Creating account..." : "Sign Up"}
            </Button>

            <p className="text-muted-foreground text-center text-sm">
              Already have an account?{" "}
              <Link to="/login" className="text-primary underline">
                Sign in
              </Link>
            </p>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
};
