import { onResponse } from "nitro/h3";

import { ENV } from "../../src/env.server";
import {
  securityHeaders,
  withSecurityHeaders,
} from "../../src/lib/security-headers";

/**
 * Every response leaves with the security headers (H1). A Nitro middleware
 * rather than a TanStack Start request middleware, for two reasons: it also
 * wraps static assets and Nitro's own error responses, which never reach the
 * Start handler; and declaring Start request middleware in `src/start.ts`
 * replaces Start's default CSRF check on server functions unless it is
 * re-added by hand. See `src/lib/security-headers.ts` for the policy.
 */
let headers: [string, string][] | undefined;

export default onResponse((response) => {
  headers ??= securityHeaders({
    production: ENV.NODE_ENV === "production",
    publicOrigin: ENV.BETTER_AUTH_URL,
  });
  return withSecurityHeaders(response, headers);
});
