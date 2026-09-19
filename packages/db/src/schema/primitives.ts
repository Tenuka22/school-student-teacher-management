import * as v from "valibot";

/**
 * Reusable Valibot field types, shared across every table's generated
 * insert/update schema so a format rule (phone, NIC, email, ...) is
 * defined exactly once and refined onto columns via drizzle-orm/valibot.
 */

const SL_PHONE_RE = /^(?:\+94|0)7\d{8}$/u;
const NIC_OLD_RE = /^\d{9}[vV]$/u;
const NIC_NEW_RE = /^\d{12}$/u;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
const POSTAL_CODE_RE = /^\d{5}$/u;

export const emailSchema = v.pipe(v.string(), v.email());

/**
 * Sri Lankan mobile number. Accepts local (07XXXXXXXX) or international
 * (+947XXXXXXXX) format and normalizes the output to +94XXXXXXXXX.
 */
export const slPhoneSchema = v.pipe(
  v.string(),
  v.regex(SL_PHONE_RE, "Invalid Sri Lankan phone number format"),
  v.transform((value: string) =>
    value.startsWith("0") ? `+94${value.slice(1)}` : value
  )
);

/** Sri Lankan NIC: old format (9 digits + V) or new format (12 digits). */
export const nicSchema = v.pipe(
  v.string(),
  v.check(
    (val) => NIC_OLD_RE.test(val) || NIC_NEW_RE.test(val),
    "Invalid NIC format (9 digits + V or 12 digits)"
  )
);

/** ISO date string, YYYY-MM-DD. */
export const isoDateSchema = v.pipe(
  v.string(),
  v.regex(ISO_DATE_RE, "Date must be in YYYY-MM-DD format")
);

export const postalCodeSchema = v.pipe(
  v.string(),
  v.regex(POSTAL_CODE_RE, "Invalid postal code")
);

export const strongPasswordSchema = v.pipe(
  v.string(),
  v.minLength(12, "Password must be at least 12 characters"),
  v.regex(/[A-Z]/u, "Must contain uppercase letter"),
  v.regex(/[a-z]/u, "Must contain lowercase letter"),
  v.regex(/\d/u, "Must contain number"),
  v.regex(/[^A-Za-z0-9]/u, "Must contain special character")
);

/** Wraps a required field schema as optional+nullable, for nullable DB columns. */
export const optionalNullable = <T extends v.GenericSchema>(schema: T) =>
  v.optional(v.nullable(schema));
