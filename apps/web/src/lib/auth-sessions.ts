/**
 * Shape of one entry from Better Auth's `multiSession.listDeviceSessions()`.
 *
 * The endpoint returns **one entry per account**, and each entry nests the
 * session and its owner:
 *
 * ```json
 * [{ "session": { "token": "…", "userAgent": "…", "createdAt": "…" },
 *    "user":    { "name": "…", "email": "…" } }]
 * ```
 *
 * Reading `token` off the entry itself (rather than `entry.session.token`)
 * yields `undefined`, which Better Auth then rejects as a missing
 * `sessionToken`.
 */
export interface DeviceSessionEntry {
  session: {
    token: string;
    /** Absent on sessions created outside a browser request. */
    userAgent?: string | null;
    ipAddress?: string | null;
    createdAt: Date | string;
    expiresAt: Date | string;
  };
  user: {
    name: string;
    email: string;
    image?: string | null;
  };
}

/**
 * Coerces whatever the transport returned into the expected shape, dropping
 * entries with no usable token — those cannot be switched to or revoked, so
 * rendering them would only produce dead buttons.
 */
export const toDeviceSessions = (data: unknown): DeviceSessionEntry[] => {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.flatMap((entry) => {
    const candidate = entry as Partial<DeviceSessionEntry> | null;

    if (!candidate?.session?.token) {
      return [];
    }

    return [candidate as DeviceSessionEntry];
  });
};

/** Renders a device name from a user-agent string, without over-claiming. */
export const describeAgent = (userAgent?: string | null): string => {
  if (!userAgent) {
    return "Unknown device";
  }

  if (/iPhone|iPad|Android/iu.test(userAgent)) {
    return "Mobile device";
  }

  if (/Macintosh|Mac OS X/iu.test(userAgent)) {
    return "Mac browser";
  }

  if (/Windows/iu.test(userAgent)) {
    return "Windows browser";
  }

  if (/Linux/iu.test(userAgent)) {
    return "Linux browser";
  }

  return "Browser";
};

/** Timestamps arrive as ISO strings over HTTP, so parse defensively. */
export const formatWhen = (value: Date | string | undefined | null): string => {
  if (!value) {
    return "—";
  }

  const date = typeof value === "string" ? new Date(value) : value;

  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
};
