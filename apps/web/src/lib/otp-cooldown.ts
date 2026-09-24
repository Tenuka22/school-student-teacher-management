import { useCallback, useEffect, useState } from "react";

/**
 * Exponential cooldown between one-time-code requests.
 *
 * Mirrors the server's rule in `packages/auth/src/otp-throttle.ts` — 30s after
 * the first send, doubling per resend, capped at 5 minutes — so the button
 * stops *offering* what the server would refuse. That is an honest UI, not the
 * protection: the server rejects a premature send whether or not this runs.
 *
 * The countdown is persisted in `sessionStorage` keyed by address and purpose,
 * so a reload cannot be used to reset the timer and ask for a fresh code every
 * time. A closed tab starts over, which the server-side limit still catches.
 */

const INITIAL_COOLDOWN_SECONDS = 30;
const MAX_COOLDOWN_SECONDS = 300;
const HISTORY_TTL_MS = 30 * 60_000;
const STORAGE_PREFIX = "otp-cooldown";

interface StoredCooldown {
  /** Epoch ms of the last accepted send. */
  lastSentAt: number;
  /** Sends so far inside the history window. */
  count: number;
}

const getCooldownSeconds = (stored: StoredCooldown, now: number): number => {
  if (now - stored.lastSentAt > HISTORY_TTL_MS) {
    return 0;
  }

  const cooldown =
    INITIAL_COOLDOWN_SECONDS * 2 ** Math.max(0, stored.count - 1);
  const elapsedSeconds = Math.floor((now - stored.lastSentAt) / 1000);

  return Math.max(0, Math.min(cooldown, MAX_COOLDOWN_SECONDS) - elapsedSeconds);
};

const readStored = (key: string): StoredCooldown | null => {
  try {
    const raw = sessionStorage.getItem(key);

    return raw ? (JSON.parse(raw) as StoredCooldown) : null;
  } catch {
    // Private mode or disabled storage: fall back to in-memory behaviour.
    return null;
  }
};

const writeStored = (key: string, value: StoredCooldown | null): void => {
  try {
    if (value) {
      sessionStorage.setItem(key, JSON.stringify(value));
    } else {
      sessionStorage.removeItem(key);
    }
  } catch {
    // Nothing to do: the countdown simply resets on reload.
  }
};

export interface OtpCooldown {
  /** True while the address is cooling down. */
  isCoolingDown: boolean;
  /** Whole seconds left, 0 when a send is allowed. */
  secondsLeft: number;
  /** True while a send request is in flight. */
  isSending: boolean;
  /** True once at least one code has gone out in this browser. */
  hasSent: boolean;
  /** Call immediately after a code request the server accepted. */
  registerSend: () => void;
  /** Call once the code is accepted, to drop the backoff. */
  clear: () => void;
}

export const useOtpCooldown = ({
  email,
  purpose,
  isPending,
}: {
  email: string;
  purpose: "email-verification" | "forget-password";
  isPending: boolean;
}): OtpCooldown => {
  const key = `${STORAGE_PREFIX}:${purpose}:${email.trim().toLowerCase()}`;

  // `sent` is the record for the key this hook last sent against; anything
  // else falls back to storage, which is how a reload or an account switch
  // picks up the backoff that is already running.
  const [sent, setSent] = useState<({ key: string } & StoredCooldown) | null>(
    null
  );
  const [now, setNow] = useState(() => Date.now());

  const stored = sent?.key === key ? sent : readStored(key);
  const secondsLeft = stored ? getCooldownSeconds(stored, now) : 0;

  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(timer);
  }, [secondsLeft]);

  const registerSend = useCallback(() => {
    const previous = readStored(key);
    const isRecent =
      previous !== null && Date.now() - previous.lastSentAt <= HISTORY_TTL_MS;
    const next = {
      key,
      lastSentAt: Date.now(),
      count: isRecent ? previous.count + 1 : 1,
    };

    writeStored(key, next);
    setSent(next);
    setNow(next.lastSentAt);
  }, [key]);

  const clear = useCallback(() => {
    writeStored(key, null);
    setSent(null);
  }, [key]);

  return {
    isCoolingDown: secondsLeft > 0,
    secondsLeft,
    isSending: isPending,
    hasSent: stored !== null,
    registerSend,
    clear,
  };
};
