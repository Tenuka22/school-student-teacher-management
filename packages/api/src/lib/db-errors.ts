/**
 * Structured PostgreSQL error inspection.
 *
 * drizzle-orm 0.45 wraps every driver error in a `DrizzleQueryError` whose
 * `message` is the failed SQL and its parameters — it does **not** contain the
 * constraint name. The `pg` error carrying `code` (SQLSTATE) and `constraint`
 * is on `.cause`. Eleven handlers used to match `error.message.includes(<name>)`,
 * which never matched after the upgrade, so every duplicate NIC, SKU or slot
 * became an HTTP 500. Read the SQLSTATE instead; never parse the message.
 */

/** SQLSTATE codes this app maps to a client-facing answer. */
export const PG_UNIQUE_VIOLATION = "23505";
export const PG_FOREIGN_KEY_VIOLATION = "23503";
export const PG_CHECK_VIOLATION = "23514";
export const PG_NOT_NULL_VIOLATION = "23502";
/**
 * Raised by the `assert_academic_year_writable` trigger (migration 0010) when
 * a write touches a closed academic year.
 */
export const PG_CLOSED_YEAR = "YR001";

export interface PgErrorInfo {
  code: string;
  constraint: string | undefined;
}

const SQLSTATE = /^[0-9A-Z]{5}$/u;
/** Driver → DrizzleQueryError → TransactionRollbackError is the deepest seen. */
const MAX_CAUSE_DEPTH = 5;

/** The PostgreSQL error inside `error`, following `.cause` links. */
export const pgErrorOf = (error: unknown): PgErrorInfo | null => {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current; depth += 1) {
    if (typeof current === "object") {
      const { code, constraint, cause } = current as {
        code?: unknown;
        constraint?: unknown;
        cause?: unknown;
      };
      if (typeof code === "string" && SQLSTATE.test(code)) {
        return {
          code,
          constraint: typeof constraint === "string" ? constraint : undefined,
        };
      }
      current = cause;
    } else {
      return null;
    }
  }
  return null;
};

/**
 * `true` when `error` is a unique violation — of `constraint` specifically,
 * when one is named.
 */
export const isUniqueViolation = (
  error: unknown,
  constraint?: string
): boolean => {
  const info = pgErrorOf(error);
  if (info?.code !== PG_UNIQUE_VIOLATION) {
    return false;
  }
  return constraint === undefined || info.constraint === constraint;
};
