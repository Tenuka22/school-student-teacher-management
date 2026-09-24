import type { SessionUser } from "@school-student-teacher-management/api/context";
import { isSeededAccount } from "@school-student-teacher-management/auth/roles";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { AccountSessions } from "@/components/account/account-panels";
import { PasswordDialog } from "@/components/account/password-dialog";

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
  <section className="border-[#013405]/14 bg-[#fffdf6] px-[22px] py-5">
    <h2 className="font-heading text-[23px] font-semibold text-[#013405]">
      Password
    </h2>
    <p className="mt-1.5 max-w-prose text-[13px] text-[#013405]/60">
      {isEnvManaged
        ? "This is an institutional login. Its password is set by the College's server configuration and re-applied on every start, so it is managed outside the app."
        : `Change it with your current password, or confirm with a one-time code sent to ${email} if you cannot remember it.`}
    </p>
    <button
      type="button"
      disabled={isEnvManaged}
      onClick={() => onOpenChange(true)}
      className="mt-4 border border-[#013405] px-5 py-2.5 text-xs font-extrabold tracking-[0.04em] text-[#013405] transition-colors hover:bg-[#013405] hover:text-[#FFF8E7] disabled:cursor-not-allowed disabled:border-[#013405]/25 disabled:text-[#013405]/35"
    >
      CHANGE PASSWORD
    </button>
  </section>
);

const ProfileSection = ({ user }: { user: SessionUser | undefined }) => (
  <section className="border-[#013405]/14 bg-[#fffdf6] px-[22px] py-5">
    <h2 className="font-heading text-[23px] font-semibold text-[#013405]">
      Profile
    </h2>

    <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
      <div>
        <dt className="text-xs font-bold tracking-[0.12em] text-[#013405]/55">
          FULL NAME
        </dt>
        <dd className="mt-1 text-[15px] font-semibold text-[#013405]">
          {user?.name ?? "—"}
        </dd>
      </div>
      <div>
        <dt className="text-xs font-bold tracking-[0.12em] text-[#013405]/55">
          EMAIL
        </dt>
        <dd className="mt-1 text-[15px] text-[#013405]">
          {user?.email ?? "—"}
        </dd>
      </div>
      <div>
        <dt className="text-xs font-bold tracking-[0.12em] text-[#013405]/55">
          USERNAME
        </dt>
        <dd className="mt-1 font-mono text-[14px] text-[#013405]">
          {user?.username ?? "—"}
        </dd>
      </div>
      <div>
        <dt className="text-xs font-bold tracking-[0.12em] text-[#013405]/55">
          ROLE
        </dt>
        <dd className="mt-1 text-[15px] text-[#013405]">
          {ROLE_LABELS[user?.role ?? "user"] ?? user?.role}
        </dd>
      </div>
      <div>
        <dt className="text-xs font-bold tracking-[0.12em] text-[#013405]/55">
          EMAIL VERIFIED
        </dt>
        <dd className="mt-1 text-[15px] text-[#013405]">
          {user?.emailVerified ? "Yes" : "Not yet"}
        </dd>
      </div>
      <div>
        <dt className="text-xs font-bold tracking-[0.12em] text-[#013405]/55">
          DISPLAY NAME
        </dt>
        <dd className="mt-1 text-[15px] text-[#013405]">
          {user?.displayUsername ?? user?.username ?? "—"}
        </dd>
      </div>
    </dl>
  </section>
);

const SwitchAccountSection = () => (
  <section className="border-[#013405]/14 bg-[#fffdf6] px-[22px] py-5">
    <h2 className="font-heading text-[23px] font-semibold text-[#013405]">
      Add or switch account
    </h2>
    <p className="mt-1.5 max-w-prose text-[13px] text-[#013405]/60">
      Sign in as someone else without signing out of this account — useful for
      checking a teacher&rsquo;s portal or approving a request as a different
      role. Your current session stays active, and the sign-in page lists every
      account this browser holds.
    </p>
    <Link
      to="/login"
      search={{ switch: 1 }}
      className="mt-4 inline-block border border-[#013405] px-5 py-2.5 text-xs font-extrabold tracking-[0.04em] text-[#013405] transition-colors hover:bg-[#013405] hover:text-[#FFF8E7]"
    >
      MANAGE ACCOUNTS
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
      <div>
        <h1 className="font-heading m-0 text-[38px] leading-[1.05] font-semibold text-[#013405]">
          Account
        </h1>
        <p className="mt-1.5 text-[13.5px] text-[#013405]/65">
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
});
