import * as v from "valibot";

/**
 * Reusable Valibot field types, shared across every table's generated
 * insert/update schema so a format rule (phone, NIC, email, ...) is
 * defined exactly once and refined onto columns via drizzle-orm/valibot.
 */

const SL_PHONE_RE = /^(?:\+94|0)7\d{8}$/u;
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

/**
 * Sri Lankan NIC: old format (9 digits + V or X) or new format (12 digits).
 *
 * **Both formats are accepted, deliberately.** The old one is a real identity the
 * Department of Issue still issues and still recognises — a teacher who is seventy
 * has one — and a product that refused it would be refusing a person rather than
 * rejecting a typo. The letter is `V` or `X` and either case, because the two are
 * the same person writing the same number and a registration form is not the place
 * to be pedantic about which letter they chose.
 *
 * Exported because three surfaces validate a NIC before the database does —
 * the sign-up form, the admin teacher form, and the create/signup procedures
 * that turn a NIC into a login username. They all use these, so none of them
 * can accept a value the `staff` table will refuse.
 *
 * **`NIC_FORMAT_SQL` is the same rule as a database CHECK, and the two are one
 * rule written twice.** The column is `NOT NULL` and carries
 * `staff_nic_format`; that constraint is the only thing standing between the
 * product and a ten-digit value that three seeded rows were carrying for
 * months, because every write path validated in TypeScript and the database
 * itself had no opinion. The duplication is worth it — the alternative is a
 * trigger, a constraint function, or trusting that no future writer imports the
 * valibot schema — and it is a duplication that is checked: this comment and
 * `staff_nic_format`'s definition are expected to move together.
 */
export const NIC_OLD_FORMAT_RE = /^\d{9}[vVxX]$/u;
export const NIC_NEW_FORMAT_RE = /^\d{12}$/u;

/** The one message every NIC input in the product shows. */
export const NIC_FORMAT_MESSAGE =
  "Enter a valid Sri Lankan NIC: 12 digits, or 9 digits followed by V or X";

/**
 * The `staff_nic_format` CHECK, as SQL.
 *
 * Postgres has no regex literal for this rule in portable form across the two
 * shapes, so it is the same alternation spelled twice — anchored, digit-only,
 * case-insensitive by listing both letters, which is what the valibot check
 * above accepts too. Written against `nic` unqualified because the constraint
 * is on one table; `staff.ts` interpolates the column reference into it.
 */
export const NIC_FORMAT_SQL =
  "(nic ~ '^[0-9]{9}[vVxX]$' OR nic ~ '^[0-9]{12}$')";

/** True when a NIC is in a format the `staff` table will actually accept. */
export const isValidNicFormat = (value: string): boolean =>
  NIC_OLD_FORMAT_RE.test(value) || NIC_NEW_FORMAT_RE.test(value);

export const nicSchema = v.pipe(
  v.string(),
  v.check(isValidNicFormat, NIC_FORMAT_MESSAGE)
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
