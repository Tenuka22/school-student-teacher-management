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

const POSITION_OPTIONS = [
  { value: "principal", label: "Principal" },
  { value: "vicePrincipal", label: "Deputy Principal (Vice Principal)" },
  { value: "assistantPrincipal", label: "Deputy Principal (Assistant)" },
] as const;

interface FormState {
  name: string;
  nic: string;
  email: string;
  phone: string;
  position: string;
  setupCode: string;
  password: string;
  confirmPassword: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  nic: "",
  email: "",
  phone: "",
  position: "",
  setupCode: "",
  password: "",
  confirmPassword: "",
};

const NIC_PATTERN = /^(?<nic>\d{9}[VvXx]|\d{12})$/u;

/**
 * Leadership sign-up (Principal / Deputy Principal). Gated by a shared
 * setup code from the server env, so the page cannot be used by outsiders.
 */
export const LeadershipSignupForm = () => {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<
    Partial<Record<keyof FormState, string>>
  >({});
  const [createdUsername, setCreatedUsername] = useState("");

  const signupMutation = useMutation(
    orpc.staff.signupLeadership.mutationOptions({
      onSuccess: (data) => {
        setCreatedUsername(data.username);
        if (!data.positionLinked) {
          toast.warning(
            "No current academic year — the leadership position is not linked yet"
          );
        }
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
    if (!form.position) {
      nextErrors.position = "Select your position";
    }
    if (!form.setupCode.trim()) {
      nextErrors.setupCode = "Enter the setup code from the system owner";
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
      position: form.position as
        | "principal"
        | "vicePrincipal"
        | "assistantPrincipal",
      setupCode: form.setupCode.trim(),
      password: form.password,
    });
  };

  if (createdUsername) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardContent className="space-y-4 p-8 text-center">
          <h1 className="font-heading text-3xl font-semibold">
            Leadership account created
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
        <h1 className="font-heading text-3xl font-semibold">
          Leadership Sign Up
        </h1>
        <p className="text-muted-foreground mt-2 mb-6 text-sm">
          For the Principal and Deputy Principals only. Requires the shared
          setup code.
        </p>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="lead-name">Full name</FieldLabel>
              <Input
                id="lead-name"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                required
              />
              {errors.name && <FieldError>{errors.name}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="lead-nic">NIC number</FieldLabel>
              <Input
                id="lead-nic"
                value={form.nic}
                onChange={(e) => setField("nic", e.target.value)}
                placeholder="199912345678 or 991234567V"
                required
              />
              {errors.nic && <FieldError>{errors.nic}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="lead-email">Email</FieldLabel>
              <Input
                id="lead-email"
                type="email"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                required
              />
              {errors.email && <FieldError>{errors.email}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="lead-phone">Phone (optional)</FieldLabel>
              <Input
                id="lead-phone"
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel>Position</FieldLabel>
              <Select
                value={form.position}
                onValueChange={(value) => setField("position", value ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select position" />
                </SelectTrigger>
                <SelectContent>
                  {POSITION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.position && <FieldError>{errors.position}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="lead-code">Setup code</FieldLabel>
              <Input
                id="lead-code"
                type="password"
                value={form.setupCode}
                onChange={(e) => setField("setupCode", e.target.value)}
                required
              />
              <FieldDescription>
                Shared secret distributed to school leadership.
              </FieldDescription>
              {errors.setupCode && <FieldError>{errors.setupCode}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="lead-password">Password</FieldLabel>
              <Input
                id="lead-password"
                type="password"
                value={form.password}
                onChange={(e) => setField("password", e.target.value)}
                required
              />
              <FieldDescription>At least 8 characters.</FieldDescription>
              {errors.password && <FieldError>{errors.password}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="lead-confirm">Confirm password</FieldLabel>
              <Input
                id="lead-confirm"
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
              Regular staff?{" "}
              <Link to="/signup" className="text-primary underline">
                Use the staff sign-up
              </Link>
            </p>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
};
