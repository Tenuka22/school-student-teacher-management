/* oxlint-disable vitest/prefer-importing-vitest-globals -- these suites run on
   Bun's runner and import describe/test/expect from "bun:test"; the rule only
   knows vitest, and an override cannot lower it below the preset's own. */
/** BODY regression: request bodies are bounded before they are read. */
import { describe, expect, test } from "bun:test";

import {
  MAX_AUTH_BODY_BYTES,
  MAX_RPC_BODY_BYTES,
  refuseOversizedBody,
} from "../src/lib/request-limits";

const post = (headers: Record<string, string>) =>
  new Request("http://localhost/api/rpc/x", { method: "POST", headers });

describe("request body limits (BODY)", () => {
  test("over the ceiling: 413, before reading", () => {
    const refused = refuseOversizedBody(
      post({ "content-length": String(MAX_RPC_BODY_BYTES + 1) }),
      MAX_RPC_BODY_BYTES
    );
    expect(refused?.status).toBe(413);
  });

  test("the largest legitimate import fits the RPC ceiling", () => {
    // parseExcel's own cap is 6,000,000 base64 characters, plus JSON framing.
    expect(
      refuseOversizedBody(
        post({ "content-length": String(6_000_000 + 1024) }),
        MAX_RPC_BODY_BYTES
      )
    ).toBeNull();
  });

  test("auth endpoints are held to their much smaller ceiling", () => {
    expect(
      refuseOversizedBody(
        post({ "content-length": String(MAX_AUTH_BODY_BYTES + 1) }),
        MAX_AUTH_BODY_BYTES
      )?.status
    ).toBe(413);
  });

  test("no length: 411; a nonsense length: 400; GET is not checked", () => {
    expect(refuseOversizedBody(post({}), MAX_RPC_BODY_BYTES)?.status).toBe(411);
    expect(
      refuseOversizedBody(post({ "content-length": "abc" }), MAX_RPC_BODY_BYTES)
        ?.status
    ).toBe(400);
    expect(
      refuseOversizedBody(
        new Request("http://localhost/api/rpc/x"),
        MAX_RPC_BODY_BYTES
      )
    ).toBeNull();
  });
});
