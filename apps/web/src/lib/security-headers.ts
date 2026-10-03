/**
 * The HTTP security headers every response carries (H1). Applied by
 * `server/middleware/security-headers.ts`, which wraps every response Nitro
 * serves — SSR pages, `/api/*`, server functions, static assets, errors.
 *
 * ## The Content-Security-Policy, source by source
 *
 * - `script-src 'self' 'unsafe-inline'`: TanStack Start writes the router's
 *   dehydrated state as inline `<script>` tags. The router can stamp a nonce
 *   on them (`ssr.nonce`), but nothing plumbs a per-request nonce into
 *   `getRouter` yet, so inline scripts are allowed. What the policy still
 *   refuses is any script from another origin, `eval`, plugins, being framed,
 *   and posting a form or a `fetch` to another origin.
 * - `style-src … 'unsafe-inline' https://fonts.googleapis.com`: React `style`
 *   attributes, and the Google Fonts stylesheet linked from `__root.tsx`.
 * - `font-src … https://fonts.gstatic.com`: the font files that stylesheet
 *   loads; `data:` for fonts inlined by the bundler.
 * - `img-src 'self' data: blob:`: `/api/files/*` photos, the photo cropper's
 *   data-URL preview, and `qr-scanner` decoding a captured frame from a blob.
 * - `worker-src 'self' blob:`: `qr-scanner` starts its decoder as a worker
 *   built from a blob URL.
 * - `connect-src 'self'`: oRPC and better-auth are same-origin.
 * - `frame-ancestors 'none'` (and `X-Frame-Options: DENY` for older
 *   browsers): nothing embeds this app.
 *
 * In development the policy is not sent: Vite's HMR client, the React
 * refresh preamble and the websocket would each need their own exceptions,
 * and a policy that differs from production proves nothing about production.
 * Every other header is sent everywhere.
 *
 * HSTS is sent only in production **and** when the configured public origin
 * (`BETTER_AUTH_URL`) is `https://`. HSTS over plain HTTP is ignored by
 * browsers, and sending it from a deployment that is not actually behind TLS
 * would pin a hostname to HTTPS that cannot answer it.
 */

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** Two years, the preload list's own floor. */
const HSTS_MAX_AGE_SECONDS = 63_072_000;

export interface SecurityHeaderOptions {
  /** `NODE_ENV === "production"`. */
  production: boolean;
  /** The public origin users reach (`BETTER_AUTH_URL`). */
  publicOrigin: string | undefined;
}

/**
 * The headers that do not depend on the environment. Also applied to static
 * assets through Nitro `routeRules` in `vite.config.ts`: Nitro serves
 * `/assets/*` before any middleware runs, so the middleware never sees them.
 */
export const BASE_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // The QR scanner uses the camera; nothing uses the rest.
  "Permissions-Policy":
    "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

export const securityHeaders = ({
  production,
  publicOrigin,
}: SecurityHeaderOptions): [string, string][] => {
  const headers = Object.entries(BASE_SECURITY_HEADERS);
  if (!production) {
    return headers;
  }
  const isHttps = publicOrigin?.startsWith("https://") === true;
  headers.push([
    "Content-Security-Policy",
    isHttps
      ? `${CONTENT_SECURITY_POLICY}; upgrade-insecure-requests`
      : CONTENT_SECURITY_POLICY,
  ]);
  if (isHttps) {
    headers.push([
      "Strict-Transport-Security",
      `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains`,
    ]);
  }
  return headers;
};

/**
 * Returns `response` with the headers set, copying it when its headers are
 * immutable (a `Response.redirect`, or one handed through from `fetch`).
 * A header the handler already set is left alone.
 */
export const withSecurityHeaders = (
  response: Response,
  headers: [string, string][]
): Response => {
  const missing = headers.filter(([name]) => !response.headers.has(name));
  if (missing.length === 0) {
    return response;
  }
  try {
    for (const [name, value] of missing) {
      response.headers.set(name, value);
    }
    return response;
  } catch {
    const copy = new Headers(response.headers);
    for (const [name, value] of missing) {
      copy.set(name, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: copy,
    });
  }
};
