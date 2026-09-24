import { APIError } from "better-auth/api";

/**
 * Send-side throttling for one-time codes.
 *
 * Better Auth's own rate limit is a fixed window counted per endpoint, which
 * bounds volume but still lets someone burn a mailbox in a steady rhythm: 3
 * codes a minute forever, each one a chance to phish a real College address
 * and a nuisance for the person who owns it. The rule here is deliberately
 * stricter and backs off exponentially — 30s, then 60s, 120s, 240s, capped at
 * 5 minutes between sends for the same address and purpose.
 *
 * State is per process and in memory on purpose: it is a brake on abuse, not
 * an audit trail, and a restart clearing it is harmless. The codes themselves
 * still expire (10 minutes) and still allow only a handful of guesses, so
 * losing this map on deploy costs nothing security-wise.
 */

/** First send is immediate; the wait starts after it. */
const INITIAL_COOLDOWN_MS = 30_000;
const MAX_COOLDOWN_MS = 300_000;
/** Attempts older than this are forgotten, so a cooled address recovers. */
const HISTORY_TTL_MS = 30 * 60_000;

export type OtpPurpose =
  | "sign-in"
  | "email-verification"
  | "forget-password"
  | "change-email";

interface SendRecord {
  /** When the last code went out. */
  lastSentAt: number;
  /** How many have gone out inside the history window. */
  count: number;
}

const records = new Map<string, SendRecord>();

const getKey = (email: string, purpose: OtpPurpose): string =>
  `${purpose}:${email.trim().toLowerCase()}`;

/** How long the caller must wait before another send is allowed. */
export const getOtpCooldownMs = (
  email: string,
  purpose: OtpPurpose
): number => {
  const record = records.get(getKey(email, purpose));

  if (!record) {
    return 0;
  }

  if (Date.now() - record.lastSentAt > HISTORY_TTL_MS) {
    records.delete(getKey(email, purpose));
    return 0;
  }

  // 30s after the first send, doubling per further send, capped.
  const cooldown = INITIAL_COOLDOWN_MS * 2 ** Math.max(0, record.count - 1);
  const elapsed = Date.now() - record.lastSentAt;

  return Math.max(0, Math.min(cooldown, MAX_COOLDOWN_MS) - elapsed);
};

/**
 * Throws a 429 when the address is still cooling down. Called before a code is
 * generated, so a rejected request costs nothing.
 */
export const assertOtpSendAllowed = (
  email: string,
  purpose: OtpPurpose
): void => {
  const waitMs = getOtpCooldownMs(email, purpose);

  if (waitMs > 0) {
    throw new APIError("TOO_MANY_REQUESTS", {
      message: `Please wait ${Math.ceil(waitMs / 1000)} seconds before requesting another code.`,
    });
  }
};

/** Records a send that actually went out, starting or extending the backoff. */
export const recordOtpSend = (email: string, purpose: OtpPurpose): void => {
  const key = getKey(email, purpose);
  const record = records.get(key);
  const now = Date.now();

  if (record && now - record.lastSentAt <= HISTORY_TTL_MS) {
    records.set(key, { lastSentAt: now, count: record.count + 1 });
    return;
  }

  records.set(key, { lastSentAt: now, count: 1 });
};

/** Called once an address is proven, so a verified account never cools down. */
export const clearOtpHistory = (email: string, purpose: OtpPurpose): void => {
  records.delete(getKey(email, purpose));
};
