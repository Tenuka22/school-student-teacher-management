import { createServerFn } from "@tanstack/react-start";

/**
 * Whether this server can actually deliver an authentication email.
 *
 * `sendAuthEmail` prints one-time codes to the server console in development
 * and **throws in production** until a mail provider is wired in. The UI used
 * to say "the code we send" either way, and shipped the development note to
 * everyone, so a real deployment told people to wait for a message that could
 * never arrive.
 *
 * This flag is the honest version of that question. It is deliberately derived
 * from the same condition the transport uses, so the two cannot disagree.
 */
export interface AuthEmailAvailability {
  /** True when a code can actually reach an inbox. */
  canDeliver: boolean;
  /** What the person should do instead, when it cannot. */
  guidance: string | null;
}

export const getAuthEmailAvailability = createServerFn({
  method: "GET",
}).handler((): AuthEmailAvailability => {
  if (process.env.NODE_ENV === "production") {
    return {
      canDeliver: false,
      guidance:
        "This server has no mail provider configured, so one-time codes cannot be sent. Ask the College administrator to confirm your address and issue you a sign-in.",
    };
  }

  return { canDeliver: true, guidance: null };
});
