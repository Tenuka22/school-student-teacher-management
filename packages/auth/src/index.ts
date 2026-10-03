import type { Database } from "@school-student-teacher-management/db";
import * as schema from "@school-student-teacher-management/db/schema/auth";
import {
  ACCOUNT_PASSWORD_MAX_LENGTH,
  ACCOUNT_PASSWORD_MIN_LENGTH,
} from "@school-student-teacher-management/db/schema/primitives";
import { betterAuth } from "better-auth";
import type { BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import {
  admin as adminPlugin,
  emailOTP,
  multiSession,
  username,
} from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import {
  adminEndpointGuard,
  recordAdminEndpointCall,
} from "./admin-endpoint-guard";
import { sendAuthEmail } from "./email";
import { mailAvailabilityGuard } from "./mail-guard";
import { assertOtpSendAllowed, recordOtpSend } from "./otp-throttle";
import {
  academicAdmin,
  ac,
  admin,
  inventoryAdmin,
  leaveAdmin,
  isSeededAccount,
  principal,
  teacher,
  teacherRequester,
  user,
  vicePrincipal,
} from "./permissions";
import { PRIVILEGED_ROLES, isPrivilegedRole } from "./roles";
import { forceSessionRevocationOnPasswordChange } from "./session-revocation";

export {
  academicAdmin,
  ac,
  admin,
  inventoryAdmin,
  leaveAdmin,
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
  UNVERIFIED_ACCOUNT_TTL_MS,
  ADMIN_EMAIL,
  PRINCIPAL_EMAIL,
  ADMIN_USERNAME,
  PRINCIPAL_USERNAME,
  INVENTORY_ADMIN_EMAIL,
  INVENTORY_ADMIN_USERNAME,
  ACADEMIC_ADMIN_EMAIL,
  ACADEMIC_ADMIN_USERNAME,
  LEAVE_ADMIN_EMAIL,
  LEAVE_ADMIN_USERNAME,
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
 * constants (`admin`, `principal`, `inventory-admin`, `academic-admin`,
 * `leave-admin`). There is no seeded Deputy Principal account \u2014 a Deputy
 * or Assistant Principal is a real staff member holding a current-year
 * `staffPosition`, assigned manually through `assignPosition` \u2014 see
 * `./admin`.
 */
export interface AuthConfig {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  PRINCIPAL_PASSWORD: string;
  PRINCIPAL_NAME?: string;
  ADMIN_PASSWORD: string;
  ADMIN_NAME?: string;
  INVENTORY_ADMIN_PASSWORD: string;
  INVENTORY_ADMIN_NAME?: string;
  ACADEMIC_ADMIN_PASSWORD: string;
  ACADEMIC_ADMIN_NAME?: string;
  LEAVE_ADMIN_PASSWORD: string;
  LEAVE_ADMIN_NAME?: string;
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
  // The username plugin's availability probe answers, without a session,
  // whether a username exists — and a staff username is the person's NIC
  // (`usernameForNic`), so it was a NIC lookup open to anyone (A3). Nothing
  // in the app calls it; `signupStaff` checks uniqueness itself, behind its
  // rate limit.
  disabledPaths: ["/is-username-available"],
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
  // Password sign-in only. Self-registration is the app's own `signupStaff`
  // procedure, which validates NIC and staff details; better-auth's
  // `/sign-up/email` was a second, unvalidated door that nothing in the UI
  // used, so it is closed.
  //
  // The length bounds are the ones `signupStaff` enforces (`accountPasswordSchema`),
  // so a password change or reset cannot set a shorter password than sign-up
  // accepts; better-auth's own default floor is 8 (A2). Sign-in does not check
  // the length, so an existing shorter password still signs in.
  //
  // A password reset ends every session of the account (A1): the person who
  // stole a session is exactly who a reset is meant to lock out. A password
  // change does the same through `forceSessionRevocationOnPasswordChange`.
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: ACCOUNT_PASSWORD_MIN_LENGTH,
    maxPasswordLength: ACCOUNT_PASSWORD_MAX_LENGTH,
    revokeSessionsOnPasswordReset: true,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      mailAvailabilityGuard(ctx.path);
      await adminEndpointGuard(ctx, database);
      return forceSessionRevocationOnPasswordChange(ctx);
    }),
    after: createAuthMiddleware((ctx) =>
      recordAdminEndpointCall(ctx, database)
    ),
  },
  // The institutional logins (admin, Principal, Inventory Admin, Academic
  // Admin, Leave Admin) are configuration, not accounts an administrator may
  // manage: banning one would lock the College out of its own system.
  // Enforced here rather than in the UI, because the admin plugin's endpoint
  // is reachable directly and a hidden button is not a boundary.
  databaseHooks: {
    user: {
      // Backstop for F-01: nothing in the app creates a privileged account
      // through better-auth (seats are bootstrapped and staff are issued by
      // direct writes), so a create that asks for any role but `user` is an
      // escalation attempt, whichever endpoint it came through.
      create: {
        before: (created) => {
          const role = typeof created.role === "string" ? created.role : "user";
          if (role !== "user") {
            return Promise.reject(
              new APIError("FORBIDDEN", {
                message:
                  "Accounts with a role are issued by the school, not created here",
              })
            );
          }
          return Promise.resolve();
        },
      },
      delete: {
        before: (deleted) => {
          const deletedUsername =
            typeof deleted.username === "string" ? deleted.username : null;
          const role = typeof deleted.role === "string" ? deleted.role : null;
          if (isSeededAccount(deletedUsername) || isPrivilegedRole(role)) {
            return Promise.reject(
              new APIError("FORBIDDEN", {
                message: "Seeded and administrative accounts cannot be deleted",
              })
            );
          }
          return Promise.resolve();
        },
      },
      // better-auth calls this hook with only the changed fields — no user
      // id and no request context — so it cannot know whose row is changing.
      // The hook it replaces tried to (seeded-seat ban and role protection)
      // and therefore never fired; that protection now lives in
      // `adminEndpointGuard`, which sees the target. What this hook *can*
      // enforce on the data alone, it does: no better-auth path may write a
      // role other than `teacher` or `user`. Privileged roles are only ever
      // set by the app's own position and bootstrap code, by direct writes.
      update: {
        before: (updated) => {
          if (
            typeof updated.role === "string" &&
            !["teacher", "user"].includes(updated.role)
          ) {
            return Promise.reject(
              new APIError("FORBIDDEN", {
                message: "User roles may only be changed to Teacher or User",
              })
            );
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
      // The plugin's default is `["admin"]`, which left every other seat
      // impersonable by anyone holding `user:impersonate`. No role holds that
      // verb any more; this keeps the plugin's own protection in step anyway.
      adminRoles: [...PRIVILEGED_ROLES],
      roles: {
        admin,
        principal,
        vicePrincipal,
        inventoryAdmin,
        academicAdmin,
        leaveAdmin,
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
    // A username is the person's NIC (`usernameForNic`) or a seat's fixed
    // name, and `isSeededAccount` keys the seat protections on it. It used to
    // be changeable by its owner through `/update-user`, so a seat could
    // rename itself out of those protections and anyone could claim another
    // person's NIC as their login. Only `updateStaff` renames a login now,
    // by a direct write when an administrator corrects the NIC.
    username({ usernameValidator: isAllowedUsername, immutableUsername: true }),
    tanstackStartCookies(),
  ],
});

export const createAuth = (env: AuthConfig, database: Database) =>
  betterAuth(buildAuthOptions(env, database));

export type Auth = ReturnType<typeof createAuth>;
