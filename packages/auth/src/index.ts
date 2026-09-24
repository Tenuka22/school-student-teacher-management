import type { Database } from "@school-student-teacher-management/db";
import * as schema from "@school-student-teacher-management/db/schema/auth";
import { betterAuth } from "better-auth";
import type { BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import {
  admin as adminPlugin,
  emailOTP,
  multiSession,
  username,
} from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { sendAuthEmail } from "./email";
import { assertOtpSendAllowed, recordOtpSend } from "./otp-throttle";
import {
  ac,
  admin,
  isSeededAccount,
  principal,
  teacher,
  teacherRequester,
  user,
  vicePrincipal,
} from "./permissions";

export {
  ac,
  admin,
  isAdminRole,
  isLeadershipRole,
  isSeededAccount,
  isStaffRole,
  needsVerification,
  principal,
  teacher,
  teacherRequester,
  user,
  vicePrincipal,
  ADMIN_ROLES,
  LEADERSHIP_ROLES,
  STAFF_ROLES,
} from "./permissions";
export type {
  AdminRole,
  AppAccessControl,
  LeadershipRole,
  StaffRole,
} from "./permissions";
export {
  createStaffCredential,
  usernameForNic,
  ensureBootstrapUsers,
  internalEmailForUsername,
  leadershipRoleForPosition,
  purgeUnverifiedAccounts,
  LEADERSHIP_ROLE_BY_POSITION,
  PRINCIPAL_POSITION,
  DEPUTY_PRINCIPAL_POSITION,
  UNVERIFIED_ACCOUNT_TTL_MS,
  ADMIN_EMAIL,
  PRINCIPAL_EMAIL,
  DEPUTY_PRINCIPAL_EMAIL,
  ADMIN_USERNAME,
  PRINCIPAL_USERNAME,
  DEPUTY_PRINCIPAL_USERNAME,
} from "./admin";
export type { SeededLeadershipRole } from "./admin";
export {
  assertOtpSendAllowed,
  clearOtpHistory,
  getOtpCooldownMs,
  recordOtpSend,
} from "./otp-throttle";
export type { OtpPurpose } from "./otp-throttle";

// Re-exported so API code can reason about leadership without reaching into
// the db package directly.
export { LEADERSHIP_POSITION_KEYS } from "@school-student-teacher-management/db/constants/positions";

/**
 * Runtime auth configuration.
 *
 * Only passwords and display names live here. The login usernames are fixed
 * constants (`admin`, `principal`, `deputy-principal`) and the seeded accounts
 * have no staff identity, so no NIC is involved — see `./admin`.
 */
export interface AuthConfig {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  PRINCIPAL_PASSWORD: string;
  PRINCIPAL_NAME?: string;
  DEPUTY_PRINCIPAL_PASSWORD: string;
  DEPUTY_PRINCIPAL_NAME?: string;
  ADMIN_PASSWORD: string;
  ADMIN_NAME?: string;
}

export const AUTH_COOKIE_PREFIX = "school-student-teacher-management";

/**
 * Better Auth's default username validator only accepts letters, digits,
 * dots and underscores — which would reject usernames like
 * "deputy-principal". Allow hyphens too (still strict: no spaces, no
 * leading/trailing punctuation, 3–30 chars enforced by the plugin).
 */
const isAllowedUsername = (candidate: string) =>
  /^[a-z0-9_.-]+$/u.test(candidate);

type AuthEmailType =
  | "sign-in"
  | "email-verification"
  | "forget-password"
  | "change-email";

const AUTH_EMAIL_SUBJECTS: Record<AuthEmailType, string> = {
  "sign-in": "Your sign-in code",
  "email-verification": "Verify your email address",
  "forget-password": "Reset your password",
  "change-email": "Confirm your new email address",
};

const AUTH_EMAIL_BODIES: Record<AuthEmailType, (otp: string) => string> = {
  "sign-in": (otp) => `Your sign-in code is ${otp}. It expires in 10 minutes.`,
  "email-verification": (otp) =>
    `Use this code to verify your email address: ${otp}`,
  "forget-password": (otp) =>
    `Use this code to choose a new password: ${otp}. It expires in 10 minutes. If you did not ask to reset your password, you can ignore this.`,
  "change-email": (otp) =>
    `Use this code to confirm your new email address: ${otp}`,
};

const buildAuthOptions = (
  env: AuthConfig,
  database: Database
): BetterAuthOptions => ({
  database: drizzleAdapter(database, {
    provider: "pg",
    schema,
  }),
  trustedOrigins: [env.BETTER_AUTH_URL],
  advanced: {
    cookiePrefix: AUTH_COOKIE_PREFIX,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false,
      },
    },
  },
  emailAndPassword: { enabled: true },
  // The three institutional logins are configuration, not accounts an
  // administrator may manage: their password is re-applied on every boot, so
  // banning one would either be silently undone or lock the College out of
  // its own system. Enforced here rather than in the UI, because the admin
  // plugin's endpoint is reachable directly and a hidden button is not a
  // boundary.
  databaseHooks: {
    user: {
      update: {
        before: (updated) => {
          const nextUsername =
            typeof updated.username === "string" ? updated.username : null;

          if (updated.banned === true && isSeededAccount(nextUsername)) {
            throw new APIError("FORBIDDEN", {
              message:
                "The administrator, Principal and Deputy Principal accounts cannot be banned",
            });
          }

          return Promise.resolve({ data: updated });
        },
      },
    },
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  plugins: [
    adminPlugin({
      ac,
      roles: {
        admin,
        principal,
        vicePrincipal,
        teacher,
        teacherRequester,
        user,
      },
    }),
    // One-time codes by email: used to prove ownership when changing a
    // password without the current one, and as the second factor for
    // elevated roles. Delivery goes through `sendAuthEmail`, which logs in
    // development and refuses to pretend in production.
    //
    // The options below are the security posture, not decoration:
    // `storeOTP: "hashed"` keeps a database leak from handing over live
    // codes, `allowedAttempts` bounds guessing, and `rateLimit` bounds volume
    // per IP on top of the per-address exponential backoff in `otp-throttle`.
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      storeOTP: "hashed",
      allowedAttempts: 3,
      rateLimit: { window: 60, max: 3 },
      sendVerificationOTP: async ({ email, otp, type }) => {
        assertOtpSendAllowed(email, type);
        recordOtpSend(email, type);

        const subject = AUTH_EMAIL_SUBJECTS[type];
        await sendAuthEmail({
          to: email,
          subject,
          body: AUTH_EMAIL_BODIES[type](otp),
        });
      },
    }),
    // Keeping more than one account signed in per browser. Better Auth stores
    // the extra session tokens in a multi-session cookie, so signing in as a
    // second account no longer signs the first one out.
    multiSession({ maximumSessions: 5 }),
    username({ usernameValidator: isAllowedUsername }),
    tanstackStartCookies(),
  ],
});

export const createAuth = (env: AuthConfig, database: Database) =>
  betterAuth(buildAuthOptions(env, database));

export type Auth = ReturnType<typeof createAuth>;
