/* oxlint-disable vitest/prefer-importing-vitest-globals -- these suites run on
   Bun's runner and import describe/test/expect from "bun:test"; the rule only
   knows vitest, and an override cannot lower it below the preset's own. */
/**
 * F-12 regression: transport selection for authentication email.
 */
import { describe, expect, test } from "bun:test";

import { createMailDelivery, isMailDeliveryConfigured } from "../src/email";

const message = { to: "teacher@example.com", subject: "Code", body: "123456" };

const recordingFetch = () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as unknown as typeof fetch;
  return { calls, impl };
};

describe("development", () => {
  test("defaults to the console transport", async () => {
    await expect(
      createMailDelivery({ NODE_ENV: "development" })(message)
    ).resolves.toBeUndefined();
    expect(isMailDeliveryConfigured({ NODE_ENV: "development" })).toBe(true);
  });
});

describe("production", () => {
  test("with nothing configured, every send fails loudly", async () => {
    await expect(
      createMailDelivery({ NODE_ENV: "production" })(message)
    ).rejects.toThrow(/no mail transport is configured/u);
    expect(isMailDeliveryConfigured({ NODE_ENV: "production" })).toBe(false);
  });

  test("the console transport is refused", async () => {
    await expect(
      createMailDelivery({ NODE_ENV: "production", MAIL_TRANSPORT: "console" })(
        message
      )
    ).rejects.toThrow(/not allowed in production/u);
  });

  test("resend without a key is refused, not silently skipped", async () => {
    await expect(
      createMailDelivery({ NODE_ENV: "production", MAIL_TRANSPORT: "resend" })(
        message
      )
    ).rejects.toThrow(/RESEND_API_KEY and MAIL_FROM/u);
  });

  test("resend sends through the provider's HTTP API", async () => {
    const { calls, impl } = recordingFetch();
    await createMailDelivery(
      {
        NODE_ENV: "production",
        MAIL_TRANSPORT: "resend",
        RESEND_API_KEY: "re_test",
        MAIL_FROM: "St. Aloysius <no-reply@example.com>",
      },
      impl
    )(message);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.resend.com/emails");
    const sent = JSON.parse(String(calls[0]?.init.body));
    expect(sent).toMatchObject({ to: ["teacher@example.com"], text: "123456" });
  });

  test("a provider error surfaces instead of looking like a send", async () => {
    const failing = (() =>
      Promise.resolve(
        new Response("bad", { status: 422 })
      )) as unknown as typeof fetch;
    await expect(
      createMailDelivery(
        {
          NODE_ENV: "production",
          MAIL_TRANSPORT: "resend",
          RESEND_API_KEY: "re_test",
          MAIL_FROM: "a@example.com",
        },
        failing
      )(message)
    ).rejects.toThrow(/HTTP 422/u);
  });
});
