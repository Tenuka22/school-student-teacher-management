import { createHash } from "node:crypto";

/**
 * Boot-time policy for the seeded seats' initial passwords (forensic audit
 * F-03).
 *
 * `apps/web/.env.example` used to carry real-looking passwords, and at least
 * one deployment copied the example file and kept its Academic Administrator
 * password — a credential anyone who could read the repository knew. The
 * example now ships blank values, and this check makes the same mistake fail
 * loudly at boot instead of silently: a seat password that is short, or equal
 * to **any value ever committed to the repository**, stops the server.
 *
 * Only SHA-256 hashes of those already-public values are kept here, so this
 * file does not itself republish them.
 */

/** Passwords for an account that can administer the school. */
export const MIN_SEAT_PASSWORD_LENGTH = 12;

/** sha256 of every password value ever committed in an env example file. */
const PUBLISHED_PASSWORD_HASHES = new Set([
  "6aa117ba259052bc103af89239a5e6268585cd7c17b90d6d5e5fa5dae35fe921",
  "9dd5364d5d6285ddae0057344dea6367c212b8c65ba3bd29e74b845132a6f92f",
  "a4ec45435f8d4cafefbfbb022587947e8d9e2600a1ef2c75573e950bdb7e0afe",
  "ac46683fee40a3bcfeae3df39342babd7bb602d096826e6afde79590a8d2343a",
  "ba30f59c2ec033f40fcd0f8dc89c9765a4d4ed51ee5140e915a8b3ccd2b43986",
  "d5f41ba2c17928bc629bb4a0e69d26033f03dffc58a8d9b04d024b961c626750",
]);

const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf-8").digest("hex");

/** Why `password` is unacceptable for a seeded seat, or null when it is fine. */
export const seatPasswordProblem = (password: string): string | null => {
  if (password.length < MIN_SEAT_PASSWORD_LENGTH) {
    return `is shorter than ${MIN_SEAT_PASSWORD_LENGTH} characters`;
  }
  if (PUBLISHED_PASSWORD_HASHES.has(sha256(password))) {
    return "is a value that has been published in this repository";
  }
  return null;
};

/**
 * Throws naming every offending variable (never its value). Called before the
 * seats are bootstrapped, so a weak or published password is refused before
 * it can become anybody's login.
 */
export const assertSeatPasswords = (
  passwords: Record<string, string | undefined>
): void => {
  const problems = Object.entries(passwords).flatMap(([name, value]) => {
    if (!value) {
      return [`${name} is not set`];
    }
    const problem = seatPasswordProblem(value);
    return problem ? [`${name} ${problem}`] : [];
  });

  if (problems.length > 0) {
    throw new Error(
      `Refusing to start: ${problems.join("; ")}. Set a unique password of at least ${MIN_SEAT_PASSWORD_LENGTH} characters for each seat in the server environment.`
    );
  }
};
