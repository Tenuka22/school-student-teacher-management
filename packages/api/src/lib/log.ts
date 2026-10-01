import { ORPCError } from "@orpc/server";

import { pgErrorOf } from "./db-errors";

/**
 * Structured server-error logging (forensic audit F-34).
 *
 * The RPC handler used to `console.error(error)` the raw error. For a database
 * failure that is a `DrizzleQueryError`, whose message is the failed SQL **and
 * its parameters** — names, NICs, phone numbers, email addresses — written to
 * the log on every duplicate or constraint failure, with nothing to tie the
 * line to a request or a user.
 *
 * One JSON line per error instead: a request id (also sent to the client as
 * `x-request-id`), the user id, the procedure path, the oRPC code, and for a
 * database error only its SQLSTATE and constraint name — never its message.
 * Expected client errors (4xx) are logged at `warn` without a stack.
 */

export interface ErrorLogContext {
  requestId?: string;
  userId?: string | null;
  path?: readonly string[];
}

type Writer = (line: string) => void;

const defaultWriter: Writer = (line) => {
  console.error(line);
};

export const describeError = (error: unknown) => {
  const database = pgErrorOf(error);
  if (database) {
    return {
      kind: "database",
      sqlstate: database.code,
      constraint: database.constraint ?? null,
    };
  }
  if (error instanceof ORPCError) {
    return {
      kind: "application",
      code: error.code,
      status: error.status,
      message: error.message,
    };
  }
  if (error instanceof Error) {
    return {
      kind: "unexpected",
      name: error.name,
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 8).join("\n"),
    };
  }
  return { kind: "unexpected", message: String(error) };
};

export const logServerError = (
  error: unknown,
  context: ErrorLogContext,
  write: Writer = defaultWriter
) => {
  const described = describeError(error);
  // Client errors are the caller's problem, not an incident.
  const clientError =
    error instanceof ORPCError && error.status >= 400 && error.status < 500;
  // A database cause under an ORPCError (the 409/400 safety net) is logged by
  // its SQLSTATE, so its parameters never reach the log either.
  const cause =
    error instanceof ORPCError && error.cause
      ? describeError(error.cause)
      : undefined;
  write(
    JSON.stringify({
      level: clientError ? "warn" : "error",
      time: new Date().toISOString(),
      requestId: context.requestId ?? null,
      userId: context.userId ?? null,
      path: context.path?.join(".") ?? null,
      error: clientError
        ? {
            kind: "application",
            code: (error as ORPCError<string, unknown>).code,
          }
        : described,
      ...(cause && cause.kind === "database" ? { cause } : {}),
    })
  );
};
