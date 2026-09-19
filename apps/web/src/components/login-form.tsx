import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@school-student-teacher-management/ui/components/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import { Input } from "@school-student-teacher-management/ui/components/input";
import { IconSchool } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

export const LoginForm = () => {
  const navigate = useNavigate({ from: "/" });
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await authClient.signIn.username(
      { username, password },
      {
        onSuccess: () => {
          navigate({ to: "/dashboard" });
          toast.success("Signed in successfully");
        },
        onError: (error) => {
          toast.error(error.error.message || error.error.statusText);
        },
      }
    );
    setIsSubmitting(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await authClient.signUp.username(
      { name, username, email, password },
      {
        onSuccess: () => {
          navigate({ to: "/dashboard" });
          toast.success("Account created successfully");
        },
        onError: (error) => {
          toast.error(error.error.message || error.error.statusText);
        },
      }
    );
    setIsSubmitting(false);
  };

  const submitLabel = mode === "sign-in" ? "Sign In" : "Sign Up";
  const loadingLabel =
    mode === "sign-in" ? "Signing in..." : "Creating account...";

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <a href="/" className="flex items-center gap-2 self-center font-medium">
          <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
            <IconSchool className="size-4" />
          </div>
          My App
        </a>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">
              {mode === "sign-in" ? "Welcome back" : "Create an account"}
            </CardTitle>
            <CardDescription>
              {mode === "sign-in"
                ? "Enter your username below to login"
                : "Enter your details below to create an account"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={mode === "sign-in" ? handleSignIn : handleSignUp}>
              <FieldGroup>
                {mode === "sign-up" && (
                  <Field>
                    <FieldLabel htmlFor="name">Name</FieldLabel>
                    <Input
                      id="name"
                      placeholder="John Doe"
                      required
                      disabled={isSubmitting}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </Field>
                )}

                <Field>
                  <FieldLabel htmlFor="username">Username</FieldLabel>
                  <Input
                    id="username"
                    placeholder="johndoe"
                    required
                    disabled={isSubmitting}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </Field>

                {mode === "sign-up" && (
                  <Field>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <Input
                      id="email"
                      type="email"
                      placeholder="m@example.com"
                      required
                      disabled={isSubmitting}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </Field>
                )}

                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    required
                    disabled={isSubmitting}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>

                <Field>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        {loadingLabel}
                      </>
                    ) : (
                      submitLabel
                    )}
                  </Button>
                  <FieldDescription className="text-center">
                    {mode === "sign-in"
                      ? "Don't have an account? "
                      : "Already have an account? "}
                    <button
                      type="button"
                      onClick={() =>
                        setMode(mode === "sign-in" ? "sign-up" : "sign-in")
                      }
                      disabled={isSubmitting}
                      className="hover:text-primary underline underline-offset-4"
                    >
                      {mode === "sign-in" ? "Sign up" : "Sign in"}
                    </button>
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
