import {
  adminClient,
  emailOTPClient,
  multiSessionClient,
  usernameClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Client mirrors the server plugins (packages/auth: username, admin,
 * multiSession, emailOTP) so typed helpers like `signIn.username`, the
 * `role` field on the session user, and the email-OTP / password-reset
 * flows exist at runtime and at type level.
 */
export const authClient = createAuthClient({
  plugins: [
    usernameClient(),
    adminClient(),
    multiSessionClient(),
    emailOTPClient(),
  ],
});
