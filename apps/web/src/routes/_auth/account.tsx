import type { SessionUser } from "@school-student-teacher-management/api/context";
import { isSeededAccount } from "@school-student-teacher-management/auth/roles";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { AccountSessions } from "@/components/account/account-panels";
import { PasswordDialog } from "@/components/account/password-dialog";
import { PageHeader } from "@/components/ui-patterns/page-header";
import { pageHead } from "@/lib/page-title";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  principal: "Principal",
  vicePrincipal: "Deputy Principal",
  teacher: "Teacher",
  user: "User",
};

const PasswordSection = ({
  email,
  isEnvManaged,
  onOpenChange,
}: {
  email: string;
  isEnvManaged: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username?: string | null;
}) => (
  <section className="border-border bg-card border px-5.5 py-5">
    <h2 className="text-foreground type-section-title">Password</h2>
    <p className="text-muted-foreground type-body mt-1.5 max-w-prose">
      {isEnvManaged
        ? "This is an institutional login. Its password is set by the College's server configuration and re-applied on every start, so it is managed outside the app."
        : `Change it with your current password, or confirm with a one-time code sent to ${email} if you cannot remember it.`}
    </p>
    <button
      type="button"
      disabled={isEnvManaged}
      onClick={() => onOpenChange(true)}
      className="border-primary text-foreground hover:bg-primary hover:text-primary-foreground disabled:border-input disabled:text-muted-foreground mt-4 border px-5 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed"
    >
      Change password
    </button>
  </section>
);

const ProfileSection = ({ user }: { user: SessionUser | undefined }) => (
  <section className="border-border bg-card border px-5.5 py-5">
    <h2 className="text-foreground type-section-title">Profile</h2>

    <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
      <div>
        <dt className="text-muted-foreground text-sm font-medium">Full name</dt>
        <dd className="text-foreground type-body mt-0.5 font-semibold">
          {user?.name ?? "—"}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-sm font-medium">Email</dt>
        <dd className="text-foreground type-body mt-0.5">
          {user?.email ?? "—"}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-sm font-medium">Username</dt>
        <dd className="text-foreground mt-0.5 font-mono text-sm">
          {user?.username ?? "—"}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-sm font-medium">Role</dt>
        <dd className="text-foreground type-body mt-0.5">
          {ROLE_LABELS[user?.role ?? "user"] ?? user?.role}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-sm font-medium">
          Email verified
        </dt>
        <dd className="text-foreground type-body mt-0.5">
          {user?.emailVerified ? "Yes" : "Not yet"}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-sm font-medium">
          Display name
        </dt>
        <dd className="text-foreground type-body mt-0.5">
          {user?.displayUsername ?? user?.username ?? "—"}
        </dd>
      </div>
    </dl>
  </section>
);

const SwitchAccountSection = () => (
  <section className="border-border bg-card border px-5.5 py-5">
    <h2 className="text-foreground type-section-title">
      Add or switch account
    </h2>
    <p className="text-muted-foreground type-body mt-1.5 max-w-prose">
      Sign in as someone else without signing out of this account — useful for
      checking a teacher&rsquo;s portal or approving a request as a different
      role. Your current session stays active, and the sign-in page lists every
      account this browser holds.
    </p>
    <Link
      to="/login"
      search={{ switch: 1 }}
      className="border-primary text-foreground hover:bg-primary hover:text-primary-foreground mt-4 inline-block border px-5 py-2.5 text-sm font-semibold transition-colors"
    >
      Manage accounts
    </Link>
  </section>
);

const AccountPage = () => {
  const { session } = Route.useRouteContext();
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);

  // The client-side session type drops the `username` plugin's additional
  // fields, but they are genuinely on the wire (see packages/auth).
  const user = session?.user as SessionUser | undefined;
  const isEnvManaged = isSeededAccount(user?.username);

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHeader
        eyebrow="Your account"
        title="Account"
        description={<>Your profile, password and signed-in devices.</>}
      />

      <ProfileSection user={user} />

      <PasswordSection
        email={user?.email ?? ""}
        isEnvManaged={isEnvManaged}
        onOpenChange={setIsPasswordOpen}
        open={isPasswordOpen}
        username={user?.username}
      />
      <SwitchAccountSection />

      <AccountSessions />

      <PasswordDialog
        email={user?.email ?? ""}
        onOpenChange={setIsPasswordOpen}
        open={isPasswordOpen}
        username={user?.username}
      />
    </div>
  );
};

export const Route = createFileRoute("/_auth/account")({
  component: AccountPage,
  head: () => pageHead("Account"),
});
