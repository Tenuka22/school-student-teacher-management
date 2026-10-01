import { APIError } from "better-auth/api";

import { isMailDeliveryConfigured } from "./email";

/**
 * Refuses the email-sending auth endpoints up front when no mail transport is
 * configured (forensic repair NEW-F-05).
 *
 * better-auth runs `sendVerificationOTP` through `runInBackgroundOrAwait`,
 * which catches and only logs a failed send — deliberately, so response timing
 * cannot reveal whether an address has an account. The consequence is that a
 * production server with no mail transport answered every "send me a code"
 * with 200 while sending nothing: a person resetting a password was told to
 * check an inbox that would never receive anything. When the transport is
 * simply absent there is nothing to leak by saying so, so the request is
 * refused with 503 before a code is generated. A provider failure *after*
 * configuration is still only logged (by better-auth) — see docs/operations.md.
 */
/**
 * The endpoints that *send* a code. The plugin's other endpoints consume one
 * already sent (`verify-email`, `check-verification-otp`, `reset-password`,
 * `change-email`, and `/sign-in/email-otp`, which signs in *with* a code), so
 * refusing them would only strand a code someone already has.
 */
const MAIL_SENDING_PATHS = new Set([
  "/email-otp/send-verification-otp",
  "/email-otp/request-email-change",
  "/email-otp/request-password-reset",
  "/forget-password/email-otp",
]);

export const mailAvailabilityGuard = (path: string | undefined): void => {
  if (path && MAIL_SENDING_PATHS.has(path) && !isMailDeliveryConfigured()) {
    throw new APIError("SERVICE_UNAVAILABLE", {
      message:
        "Email is not available on this server, so no code can be sent. Ask an administrator to reset your password or verify your account.",
    });
  }
};
