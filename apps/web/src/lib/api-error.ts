interface ValidationIssue {
  message?: string;
  type?: string;
  path?: readonly { key?: unknown }[];
}

const GENERIC_API_MESSAGES = new Set(["Input validation failed"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Pull valibot issues off an oRPC `BAD_REQUEST` input-validation error. */
export const getValidationIssues = (error: unknown): ValidationIssue[] => {
  if (!isRecord(error) || !isRecord(error.data)) {
    return [];
  }
  const { issues } = error.data;
  if (!Array.isArray(issues)) {
    return [];
  }
  return issues.filter(isRecord) as unknown as ValidationIssue[];
};

const issueFieldKey = (issue: ValidationIssue): string | undefined => {
  const { path } = issue;
  if (!Array.isArray(path)) {
    return undefined;
  }
  let field;
  for (const segment of path) {
    if (typeof segment?.key === "string" && segment.key.length > 0) {
      field = segment.key;
    }
  }
  return field;
};

const humanizeFieldKey = (key: string): string =>
  key
    .replaceAll(/(?<lower>[a-z0-9])(?<upper>[A-Z])/gu, "$<lower> $<upper>")
    .replace(/^./u, (char) => char.toUpperCase());

/**
 * Rewrite a raw valibot issue message into plain-language text. Custom
 * messages (anything not starting with valibot's "Invalid " default) pass
 * through untouched.
 */
export const friendlyValidationMessage = (
  message: string | undefined,
  type?: string
): string => {
  const trimmed = message?.trim();
  if (trimmed && !trimmed.startsWith("Invalid ")) {
    return trimmed;
  }
  switch (type) {
    case "email": {
      return "Enter a valid email address";
    }
    case "min_length": {
      return "Value is too short";
    }
    case "max_length": {
      return "Value is too long";
    }
    case "picklist": {
      return "Please select a valid option";
    }
    case "regex": {
      return "Value does not match the required format";
    }
    default: {
      return "Invalid value";
    }
  }
};

const friendlyIssueMessage = (issue: ValidationIssue): string =>
  friendlyValidationMessage(issue.message, issue.type);

/**
 * Turn an API error into a user-facing toast message. Server-side input
 * validation failures surface as valibot issues — those are rewritten into
 * plain-language text (e.g. `Email: Enter a valid email address`) instead of
 * the generic "Input validation failed".
 */
export const formatApiErrorMessage = (
  error: unknown,
  fallback: string
): string => {
  const issues = getValidationIssues(error);
  if (issues.length > 0) {
    const parts = issues.slice(0, 3).map((issue) => {
      const field = issueFieldKey(issue);
      const message = friendlyIssueMessage(issue);
      return field ? `${humanizeFieldKey(field)}: ${message}` : message;
    });
    const remaining = issues.length - parts.length;
    const extra = remaining > 0 ? ` (+${remaining} more)` : "";
    return `${parts.join(" · ")}${extra}`;
  }

  if (
    error instanceof Error &&
    error.message &&
    !GENERIC_API_MESSAGES.has(error.message)
  ) {
    return error.message;
  }

  return fallback;
};

/**
 * Map server-side validation issues onto form fields so the offending input
 * can show an inline error, not just a toast.
 */
export const validationFieldErrors = <T extends string = string>(
  error: unknown
): Partial<Record<T, string>> => {
  const fieldErrors: Partial<Record<T, string>> = {};
  for (const issue of getValidationIssues(error)) {
    const field = issueFieldKey(issue);
    if (field) {
      fieldErrors[field as T] = friendlyIssueMessage(issue);
    }
  }
  return fieldErrors;
};
