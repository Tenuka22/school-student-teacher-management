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

/**
 * The client's address, trusting `X-Forwarded-For` only as far as the
 * deployment's own proxies wrote it (INFRA2).
 *
 * This used to take the **leftmost** `X-Forwarded-For` entry — the one the
 * client itself supplies — so a script could send a fresh value with every
 * request and never meet the per-address sign-up limit.
 *
 * - `trustedProxyHops: 0` (the default, and the right value when nothing sits
 *   in front of the server): the headers are ignored and the socket's peer
 *   address is the client.
 * - `trustedProxyHops: N`: there are exactly N proxies we run in front of the
 *   app, each appending the address it received from. The client is the
 *   address the outermost of them saw: the Nth entry from the right. Entries
 *   further left were written by the client and are ignored. A request with
 *   fewer than N entries did not come through the proxies; its socket address
 *   is used instead.
 */
export const clientAddressOf = (
  headers: Headers | null | undefined,
  {
    socketAddress,
    trustedProxyHops = 0,
  }: { socketAddress?: string | null; trustedProxyHops?: number } = {}
): string => {
  const fallback = socketAddress?.trim() || "unknown";
  if (trustedProxyHops <= 0) {
    return fallback;
  }
  const entries = (headers?.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.at(-trustedProxyHops) ?? fallback;
};
