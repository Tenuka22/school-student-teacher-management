/* oxlint-disable vitest/prefer-importing-vitest-globals -- these suites run on
   Bun's runner and import describe/test/expect from "bun:test"; the rule only
   knows vitest, and an override cannot lower it below the preset's own. */
/**
 * H1 regression: the headers `server/middleware/security-headers.ts` puts on
 * every response. The live check against a production build is recorded in
 * SECURITY_REMEDIATION_REPORT.md; this pins the policy itself.
 */
import { describe, expect, test } from "bun:test";

import {
  securityHeaders,
  withSecurityHeaders,
} from "../src/lib/security-headers";

const asMap = (headers: [string, string][]) => new Map(headers);

describe("security headers (H1)", () => {
  test("production over HTTPS: CSP, HSTS and the rest", () => {
    const headers = asMap(
      securityHeaders({
        production: true,
        publicOrigin: "https://sms.example.lk",
      })
    );
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin"
    );
    expect(headers.get("Permissions-Policy")).toContain("camera=(self)");
    expect(headers.get("Strict-Transport-Security")).toContain(
      "max-age=63072000"
    );
    const csp = headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("unsafe-eval");
  });

  test("production over plain HTTP: CSP but no HSTS", () => {
    const headers = asMap(
      securityHeaders({ production: true, publicOrigin: "http://intranet" })
    );
    expect(headers.has("Strict-Transport-Security")).toBe(false);
    expect(headers.get("Content-Security-Policy")).not.toContain(
      "upgrade-insecure-requests"
    );
  });

  test("development: no CSP or HSTS, the rest still sent", () => {
    const headers = asMap(
      securityHeaders({
        production: false,
        publicOrigin: "https://localhost:3001",
      })
    );
    expect(headers.has("Content-Security-Policy")).toBe(false);
    expect(headers.has("Strict-Transport-Security")).toBe(false);
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
  });

  test("applies to immutable responses (redirects) and keeps a handler's own value", () => {
    const headers = securityHeaders({
      production: true,
      publicOrigin: "https://sms.example.lk",
    });
    const redirect = withSecurityHeaders(
      Response.redirect("https://sms.example.lk/login", 302),
      headers
    );
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe(
      "https://sms.example.lk/login"
    );
    expect(redirect.headers.get("X-Frame-Options")).toBe("DENY");

    const own = withSecurityHeaders(
      new Response("x", { headers: { "Referrer-Policy": "no-referrer" } }),
      headers
    );
    expect(own.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(own.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
