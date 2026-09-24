/**
 * Outbound mail for authentication flows (one-time codes, password resets).
 *
 * There is no SMTP provider wired into this project yet, so this module is
 * deliberately explicit about that instead of pretending a message was sent:
 *
 * - **Development** — the code is printed to the server console. That makes
 *   the OTP flows testable end to end without a mail account, and the value
 *   never leaves the machine.
 * - **Production** — delivery throws. A silent no-op here would look like a
 *   successful send while the code reached nobody, which for a password reset
 *   means a locked-out user and a support call.
 *
 * To go live, implement `deliver` with a real provider (SMTP, Resend, SES,
 * Postmark…) and keep the interface the same.
 */

export interface OutboundMessage {
  to: string;
  subject: string;
  body: string;
}

export type MailDelivery = (message: OutboundMessage) => Promise<void>;

const isProduction = () => process.env.NODE_ENV === "production";

/**
 * Development transport: logs the message so a developer can complete the
 * flow. Never used in production.
 */
const logToConsole: MailDelivery = ({ to, subject, body }) => {
  console.info(
    [
      "",
      "──────── auth email (development transport) ────────",
      `to:      ${to}`,
      `subject: ${subject}`,
      body
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n"),
      "────────────────────────────────────────────────────",
      "",
    ].join("\n")
  );

  return Promise.resolve();
};

const rejectInProduction: MailDelivery = ({ to }) =>
  Promise.reject(
    new Error(
      `Cannot send authentication email to ${to}: no mail transport is configured. ` +
        "Wire a provider into sendAuthEmail() before enabling this flow in production."
    )
  );

/** Sends an authentication email through whichever transport is active. */
export const sendAuthEmail: MailDelivery = isProduction()
  ? rejectInProduction
  : logToConsole;
