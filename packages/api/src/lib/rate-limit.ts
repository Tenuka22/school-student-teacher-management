/**
 * Fixed-window rate limiting for the public procedures better-auth's own
 * limiter does not cover (`signupStaff` is an oRPC procedure, not a
 * better-auth endpoint — forensic audit F-19).
 *
 * **Process-local, like better-auth's memory limiter and the OTP throttle.**
 * Correct for the single-instance deployment this app has; behind several
 * instances each keeps its own count, so the effective limit multiplies by
 * the instance count (see the process-local state notes in AGENTS.md).
 *
 * Two keys per call: the client address, and a global key. The address comes
 * from `X-Forwarded-For`, which a client can forge when no trusted proxy sets
 * it — so the global window is what bounds abuse regardless of headers.
 */

interface Window {
  count: number;
  resetsAt: number;
}

export interface RateLimitRule {
  windowMs: number;
  max: number;
}

export interface FixedWindowLimiter {
  /** Counts one attempt; returns ms to wait, or 0 when allowed. */
  hit: (key: string, now?: number) => number;
  reset: () => void;
}

/** Above this many live keys, expired windows are swept on the next hit. */
const SWEEP_THRESHOLD = 10_000;

export const createFixedWindowLimiter = (
  rule: RateLimitRule
): FixedWindowLimiter => {
  const windows = new Map<string, Window>();

  const sweep = (now: number) => {
    for (const [key, window] of windows) {
      if (window.resetsAt <= now) {
        windows.delete(key);
      }
    }
  };

  return {
    hit: (key, now = Date.now()) => {
      if (windows.size > SWEEP_THRESHOLD) {
        sweep(now);
      }
      const current = windows.get(key);
      if (!current || current.resetsAt <= now) {
        windows.set(key, { count: 1, resetsAt: now + rule.windowMs });
        return 0;
      }
      if (current.count >= rule.max) {
        return current.resetsAt - now;
      }
      current.count += 1;
      return 0;
    },
    reset: () => windows.clear(),
  };
};

/** The client address as the request reports it; `"unknown"` when absent. */
export const clientAddressOf = (
  headers: Headers | null | undefined
): string => {
  const forwarded = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers?.get("x-real-ip")?.trim() || "unknown";
};
