/**
 * Outbound mail for authentication flows (one-time codes, password resets).
 *
 * The transport is chosen by configuration, never by guesswork (forensic
 * audit F-12). `MAIL_TRANSPORT`:
 *
 * - **`console`** — the message is printed to the server log, so the OTP flows
 *   can be completed locally without a mail account. **Refused in
 *   production**: a code printed to a log reaches nobody, and a log is not a
 *   place a one-time code should sit.
 * - **`resend`** — sent through Resend's HTTP API (`RESEND_API_KEY`,
 *   `MAIL_FROM`). Plain `fetch`, no SDK dependency; any provider with an HTTP
 *   API slots in the same way behind `MailDelivery`.
 * - **unset** — `console` in development and test; in production every send
 *   fails with a message naming the missing configuration. A silent no-op
 *   would look like a successful send while the code reached nobody, which for
 *   a password reset means a locked-out user and a support call.
 *
 * A provider error is thrown, never swallowed here — but better-auth runs the
 * send through `runInBackgroundOrAwait`, which catches and only logs it, so
 * the person asking still sees success. That is why `mail-guard.ts` refuses
 * the sending endpoints outright (503) when no transport is configured; a
 * configured provider failing at send time remains log-only.
 */

export interface OutboundMessage {
  to: string;
  subject: string;
  body: string;
}

export type MailDelivery = (message: OutboundMessage) => Promise<void>;

export interface MailConfig {
  NODE_ENV?: string;
  MAIL_TRANSPORT?: string;
  MAIL_FROM?: string;
  RESEND_API_KEY?: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Development transport: logs the message so a developer can finish the flow. */
const logToConsole: MailDelivery = ({ to, subject, body }) => {
  console.info(
    [
      "",
      "──────── auth email (console transport) ────────",
      `to:      ${to}`,
      `subject: ${subject}`,
      body
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n"),
      "────────────────────────────────────────────────",
      "",
    ].join("\n")
  );
  return Promise.resolve();
};

const refuse =
  (reason: string): MailDelivery =>
  ({ to }) =>
    Promise.reject(
      new Error(`Cannot send authentication email to ${to}: ${reason}`)
    );

const viaResend =
  (apiKey: string, from: string, fetchImpl: typeof fetch): MailDelivery =>
  async ({ to, subject, body }) => {
    const response = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, text: body }),
    });
    if (!response.ok) {
      // The provider's status, not its body: the body can echo the request.
      throw new Error(
        `Mail provider refused the message to ${to} (HTTP ${response.status})`
      );
    }
  };

/** Picks the transport for a configuration. Pure, so it can be tested. */
export const createMailDelivery = (
  config: MailConfig,
  fetchImpl: typeof fetch = fetch
): MailDelivery => {
  const production = config.NODE_ENV === "production";
  const transport = config.MAIL_TRANSPORT ?? (production ? "" : "console");

  if (transport === "console") {
    return production
      ? refuse(
          "MAIL_TRANSPORT=console is not allowed in production; configure a real provider"
        )
      : logToConsole;
  }

  if (transport === "resend") {
    if (!(config.RESEND_API_KEY && config.MAIL_FROM)) {
      return refuse("MAIL_TRANSPORT=resend needs RESEND_API_KEY and MAIL_FROM");
    }
    return viaResend(config.RESEND_API_KEY, config.MAIL_FROM, fetchImpl);
  }

  return refuse(
    transport
      ? `unknown MAIL_TRANSPORT "${transport}"`
      : "no mail transport is configured (set MAIL_TRANSPORT=resend with RESEND_API_KEY and MAIL_FROM)"
  );
};

/** True when authentication email can actually reach someone. */
export const isMailDeliveryConfigured = (
  config: MailConfig = process.env
): boolean => {
  const production = config.NODE_ENV === "production";
  const transport = config.MAIL_TRANSPORT ?? (production ? "" : "console");
  if (transport === "console") {
    return !production;
  }
  return (
    transport === "resend" &&
    Boolean(config.RESEND_API_KEY) &&
    Boolean(config.MAIL_FROM)
  );
};

/** Sends an authentication email through whichever transport is configured. */
export const sendAuthEmail: MailDelivery = (message) =>
  createMailDelivery(process.env)(message);
