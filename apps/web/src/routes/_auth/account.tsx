import type { SessionUser } from "@school-student-teacher-management/api/context";
import { isSeededAccount } from "@school-student-teacher-management/auth/roles";
import {
  Avatar,
  AvatarFallback,
} from "@school-student-teacher-management/ui/components/avatar";
import { IconLock, IconUserPlus } from "@tabler/icons-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { AccountSessions } from "@/components/account/account-panels";
import { PasswordDialog } from "@/components/account/password-dialog";
import { getAvatarFallback } from "@/components/nav-user";
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
  <section className="border-primary/14 bg-card border px-[22px] py-4">
    <div className="flex flex-col items-center py-2 text-center">
      <span className="border-primary/30 text-primary flex size-12 items-center justify-center border">
        <IconLock className="size-5" />
      </span>
      <h2 className="font-heading text-primary mt-3 text-[19px] font-semibold">
        Password
      </h2>
      <p className="text-primary/65 mt-1.5 max-w-prose text-[13.5px]">
        {isEnvManaged
          ? "This is an institutional login. Its password is set by the College's server configuration and re-applied on every start, so it is managed outside the app."
          : `Change it with your current password, or confirm with a one-time code sent to ${email} if you cannot remember it.`}
      </p>
      <button
        type="button"
        disabled={isEnvManaged}
        onClick={() => onOpenChange(true)}
        className="border-primary/30 text-primary hover:border-primary mt-4 border px-4 py-2 text-xs font-extrabold tracking-[0.04em] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        CHANGE PASSWORD
      </button>
    </div>
  </section>
);

const ProfileSection = ({ user }: { user: SessionUser | undefined }) => (
  <section className="border-primary/14 bg-card border px-[22px] py-4">
    <ProfileHeader user={user} />
    <dl className="border-primary/14 mt-2 grid gap-x-8 gap-y-4 border-t pt-4 sm:grid-cols-2">
      {profileFields(user).map((field) => (
        <InfoField key={field.label} {...field} />
      ))}
    </dl>
  </section>
);

const ProfileHeader = ({ user }: { user: SessionUser | undefined }) => (
  <div className="flex flex-col items-center py-4 text-center">
    <Avatar className="bg-primary/10 text-primary size-20 rounded-none text-2xl font-bold">
      <AvatarFallback className="bg-primary/10 text-primary rounded-none text-2xl font-bold">
        {getAvatarFallback(user?.name ?? "?")}
      </AvatarFallback>
    </Avatar>
    <h2 className="font-heading text-primary mt-3 text-[24px] font-semibold">
      {user?.name ?? "\u2014"}
    </h2>
    <p className="text-primary/60 mt-0.5 text-sm">{user?.email ?? "\u2014"}</p>
    <span className="border-primary/30 text-primary mt-3 border px-3 py-1 text-xs font-extrabold tracking-[0.1em]">
      {(ROLE_LABELS[user?.role ?? "user"] ?? user?.role ?? "").toUpperCase()}
    </span>
  </div>
);

const InfoField = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-primary/60 text-xs font-extrabold tracking-[0.12em]">
      {label}
    </dt>
    <dd className="text-primary mt-1 text-sm">{value}</dd>
  </div>
);

const profileFields = (user: SessionUser | undefined) => [
  { label: "FULL NAME", value: user?.name ?? "\u2014" },
  { label: "EMAIL", value: user?.email ?? "\u2014" },
  { label: "USERNAME", value: user?.username ?? "\u2014" },
  {
    label: "ROLE",
    value: ROLE_LABELS[user?.role ?? "user"] ?? user?.role ?? "\u2014",
  },
  { label: "EMAIL VERIFIED", value: user?.emailVerified ? "Yes" : "Not yet" },
  {
    label: "DISPLAY NAME",
    value: user?.displayUsername ?? user?.username ?? "\u2014",
  },
];

const SwitchAccountSection = () => (
  <section className="border-primary/14 bg-card border px-[22px] py-4">
    <div className="flex flex-col items-center py-2 text-center">
      <span className="border-primary/30 text-primary flex size-12 items-center justify-center border">
        <IconUserPlus className="size-5" />
      </span>
      <h2 className="font-heading text-primary mt-3 text-[19px] font-semibold">
        Add or switch account
      </h2>
      <p className="text-primary/65 mt-1.5 max-w-prose text-[13.5px]">
        Sign in as someone else without signing out of this account &mdash;
        useful for checking a teacher&rsquo;s portal or approving a request as a
        different role. Your current session stays active, and the sign-in page
        lists every account this browser holds.
      </p>
      <Link
        to="/login"
        search={{ switch: 1 }}
        className="border-primary/30 text-primary hover:border-primary mt-4 inline-block border px-4 py-2 text-xs font-extrabold tracking-[0.04em] transition-colors"
      >
        MANAGE ACCOUNTS
      </Link>
    </div>
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
      <div>
        <h1 className="font-heading text-primary m-0 text-[38px] leading-[1.05] font-semibold">
          Account
        </h1>
        <p className="text-primary/65 mt-1.5 text-[13.5px]">
          Your profile, password and signed-in devices.
        </p>
      </div>

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
