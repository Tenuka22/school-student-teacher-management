import type { SessionUser } from "@school-student-teacher-management/api/context";
import { isSeededAccount } from "@school-student-teacher-management/auth/roles";
import {
  Avatar,
  AvatarFallback,
} from "@school-student-teacher-management/ui/components/avatar";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@school-student-teacher-management/ui/components/card";
import { Separator } from "@school-student-teacher-management/ui/components/separator";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { AccountSessions } from "@/components/account/account-panels";
import { PasswordDialog } from "@/components/account/password-dialog";
import { getAvatarFallback } from "@/components/nav-user";
import { pageSeo } from "@/functions/get-site-origin";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  principal: "Principal",
  vicePrincipal: "Deputy Principal",
  teacher: "Teacher",
  "teacher-requester": "Awaiting staff approval",
  user: "User",
};

/** One labelled fact in the profile grid. */
const ProfileFact = ({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) => (
  <div>
    <dt className="text-muted-foreground text-xs font-bold tracking-[0.1em]">
      {label}
    </dt>
    <dd className={`mt-1 text-[15px] ${mono ? "font-mono text-sm" : ""}`}>
      {value}
    </dd>
  </div>
);

/**
 * The account's one identity card: avatar, name, email and role up top,
 * followed by the two facts (username, display name) that aren't already
 * shown there. A separate "Profile" card used to repeat name, email, role
 * and verification a second time in a `dl` underneath this exact header —
 * one card that says a thing once reads as an account; two that say it twice
 * read as a form nobody proofread.
 */
const ProfileCard = ({ user }: { user: SessionUser | undefined }) => {
  const roleLabel = ROLE_LABELS[user?.role ?? "user"] ?? user?.role;
  const isVerified = Boolean(user?.emailVerified);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar className="bg-primary text-primary-foreground size-16 rounded-none text-xl font-bold">
            <AvatarFallback className="bg-primary text-primary-foreground rounded-none text-xl font-bold">
              {getAvatarFallback(user?.name ?? "?")}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading truncate text-2xl font-semibold">
              {user?.name ?? "—"}
            </h2>
            <p className="text-muted-foreground truncate text-sm">
              {user?.email ?? "—"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge>{roleLabel}</Badge>
            <Badge variant={isVerified ? "secondary" : "destructive"}>
              {isVerified ? "Verified" : "Unverified"}
            </Badge>
          </div>
        </div>

        <Separator className="my-5" />

        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <ProfileFact label="Username" mono value={user?.username ?? "—"} />
          <ProfileFact
            label="Display name"
            value={user?.displayUsername ?? user?.username ?? "—"}
          />
        </dl>
      </CardContent>
    </Card>
  );
};

const PasswordSection = ({
  email,
  isEnvManaged,
  triggerRef,
  onOpenChange,
}: {
  email: string;
  isEnvManaged: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onOpenChange: (open: boolean) => void;
}) => (
  <Card>
    <CardHeader>
      <CardTitle>
        <h2 className="m-0 text-base font-medium">Password</h2>
      </CardTitle>
      <CardDescription>
        {isEnvManaged
          ? "This is an institutional login. Its password is set by the College's server configuration and re-applied on every start, so it is managed outside the app."
          : `Change it with your current password, or confirm with a one-time code sent to ${email} if you cannot remember it.`}
      </CardDescription>
    </CardHeader>
    <CardContent>
      <Button
        disabled={isEnvManaged}
        onClick={() => onOpenChange(true)}
        ref={triggerRef}
        variant="outline"
      >
        Change password
      </Button>
    </CardContent>
  </Card>
);

const SwitchAccountSection = () => (
  <Card>
    <CardHeader>
      <CardTitle>
        <h2 className="m-0 text-base font-medium">Add or switch account</h2>
      </CardTitle>
      <CardDescription>
        Sign in as someone else without signing out of this account — useful for
        checking a teacher&rsquo;s portal or approving a request as a different
        role. Your current session stays active, and the sign-in page lists
        every account this browser holds.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <Button
        variant="outline"
        render={<Link search={{ switch: 1 }} to="/login" />}
      >
        Manage accounts
      </Button>
    </CardContent>
  </Card>
);

const AccountPage = () => {
  const { session } = Route.useRouteContext();
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const passwordTrigger = useRef<HTMLButtonElement>(null);

  // The client-side session type drops the `username` plugin's additional
  // fields, but they are genuinely on the wire (see packages/auth).
  const user = session?.user as SessionUser | undefined;
  const isEnvManaged = isSeededAccount(user?.username);

  return (
    <main className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-3xl font-semibold md:text-4xl">
          Account
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Your profile, password and signed-in devices.
        </p>
      </div>

      <ProfileCard user={user} />

      <PasswordSection
        email={user?.email ?? ""}
        isEnvManaged={isEnvManaged}
        onOpenChange={setIsPasswordOpen}
        triggerRef={passwordTrigger}
      />
      <SwitchAccountSection />

      <AccountSessions />

      <PasswordDialog
        email={user?.email ?? ""}
        onOpenChange={setIsPasswordOpen}
        open={isPasswordOpen}
        returnFocusTo={passwordTrigger}
        username={user?.username}
      />
    </main>
  );
};

export const Route = createFileRoute("/_auth/account")({
  component: AccountPage,
  head: ({ matches }) =>
    pageSeo({
      matches,
      path: "/account",
      title: "Your account",
      description:
        "Your profile, password and the devices signed in to your account.",
      noindex: true,
    }),
});
