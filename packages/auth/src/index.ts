import type { Database } from "@school-student-teacher-management/db";
import * as schema from "@school-student-teacher-management/db/schema/auth";
import { betterAuth } from "better-auth";
import type { BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  admin as adminPlugin,
  multiSession,
  username,
} from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { ac, admin, teacher, user } from "./permissions";

export { ac, admin, teacher, user } from "./permissions";
export type { AppAccessControl } from "./permissions";
export {
  createStaffCredential,
  createTeacherCredential,
  usernameForNic,
  rotateTeacherPassword,
} from "./admin";
export { ensureAdminUser } from "./admin";

export interface AuthConfig {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
  /** Shared secret for the leadership (DP/principal) sign-up page. */
  LEADERSHIP_SETUP_CODE: string;
}

export const AUTH_COOKIE_PREFIX = "school-student-teacher-management";

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
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  plugins: [
    adminPlugin({
      ac,
      roles: { admin, teacher, user },
    }),
    multiSession(),
    username(),
    tanstackStartCookies(),
  ],
});

export const createAuth = (env: AuthConfig, database: Database) =>
  betterAuth(buildAuthOptions(env, database));

export type Auth = ReturnType<typeof createAuth>;
