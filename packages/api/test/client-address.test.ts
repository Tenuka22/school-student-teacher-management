/* oxlint-disable vitest/prefer-importing-vitest-globals -- these suites run on
   Bun's runner and import describe/test/expect from "bun:test"; the rule only
   knows vitest, and an override cannot lower it below the preset's own. */
/** INFRA2 regression: a client cannot choose the address it is limited by. */
import { describe, expect, test } from "bun:test";

import { clientAddressOf } from "../src/lib/rate-limit";

const forwarded = (value: string) =>
  new Headers({ "x-forwarded-for": value, "x-real-ip": "6.6.6.6" });

describe("client address (INFRA2)", () => {
  test("no trusted proxy: forwarding headers are ignored", () => {
    expect(
      clientAddressOf(forwarded("1.2.3.4"), { socketAddress: "203.0.113.9" })
    ).toBe("203.0.113.9");
  });

  test("one trusted proxy: the address it appended, not the client's claim", () => {
    // The client sent "1.2.3.4"; the proxy appended the real peer.
    expect(
      clientAddressOf(forwarded("1.2.3.4, 198.51.100.7"), {
        socketAddress: "10.0.0.2",
        trustedProxyHops: 1,
      })
    ).toBe("198.51.100.7");
  });

  test("a rotating forged prefix does not change the key", () => {
    const keys = new Set(
      ["a", "b", "c"].map((forged) =>
        clientAddressOf(forwarded(`${forged}, 198.51.100.7`), {
          trustedProxyHops: 1,
        })
      )
    );
    expect([...keys]).toEqual(["198.51.100.7"]);
  });

  test("fewer entries than proxies: the request bypassed them; socket used", () => {
    expect(
      clientAddressOf(forwarded("198.51.100.7"), {
        socketAddress: "203.0.113.9",
        trustedProxyHops: 2,
      })
    ).toBe("203.0.113.9");
  });
});
