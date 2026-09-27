/**
 * Parsing a counted quantity, honestly.
 *
 * ## The defect this module exists to remove
 *
 * Every quantity in this feature used to be read through `toQuantity`, which is
 * `Math.trunc(Number(raw))` with `NaN` folded to `0`. That silently destroys
 * three different answers:
 *
 * | typed | `toQuantity` | what the clerk believes happened |
 * | --- | --- | --- |
 * | `2.7` | `2` | two and a bit arrived, two were booked in |
 * | `12abc` | `0` | a validation error appeared (the *least* harmful case) |
 * | `1e3` | `1000` | a thousand arrived, from six characters |
 *
 * The fractional case is the one that matters. `stock-in.ts`, `stock-out.ts`,
 * `create-issue.ts` and `create-disposal.ts` all declare `qty` as
 * `v.integer()`, and the whole point of that is that a counted line cannot hold
 * a fraction — **but `Math.trunc` ran first, so the server's own rule never
 * fired.** A clerk measuring 2.7 metres of cable booked 2 metres in and the
 * half-metre vanished with no error anywhere. `toQuantity` was, in effect,
 * switching off a domain constraint by rounding before validation.
 *
 * So: a quantity is either a whole number the domain accepts, or it is refused
 * with a sentence that says which of the five things went wrong. There is no
 * third path, and there is no code path in which a decimal is rounded.
 *
 * ## Why it is not a `zod`/`valibot` refinement
 *
 * Because it also has to produce the *message*, and the message has to name the
 * item's unit. `v.integer()` cannot say "a counted line is a whole number of
 * chairs" because it has never heard of chairs. Splitting it out also means the
 * same five problems are described identically in the quantity field, in the
 * resulting-quantity readout, and in the two places the value is re-checked
 * before a mutation.
 */

/** Why a typed quantity cannot be used. Five states, and they need five sentences. */
export type QuantityProblem =
  /** Nothing typed. Not an error yet — the field is simply unfilled. */
  | "empty"
  /** Something that is not a number at all: letters, an exponent, a comma, a sign. */
  | "not-a-number"
  /** A decimal that is not `.0` — the case `Math.trunc` used to swallow. */
  | "fractional"
  /** A negative count. A school cannot hold minus three of anything. */
  | "negative"
  /** Zero. Nothing moved is not a movement, and every server caps at 1. */
  | "not-positive"
  /** Above the ceiling the server enforces (`stock-in.ts`'s 1000). */
  | "too-large";

export type QuantityParse =
  | { ok: true; value: number }
  | { ok: false; problem: QuantityProblem; message: string };

/**
 * The only shape accepted: digits, and at most one decimal point.
 *
 * A `+`, a `-`, an exponent, a comma, a space and a currency sign are all
 * *rejected* rather than coerced, because a number input that silently discards
 * a character is a control that refuses to hold what you typed instead of
 * explaining why it is wrong — the same argument `MoneyField` makes about the
 * comma in `1,250.00`.
 */
const COUNTED_PATTERN = /^\d*(?:\.\d*)?$/u;

const NOT_A_NUMBER_MESSAGE =
  "Type a whole number of digits. Commas, spaces, signs and letters are not accepted here.";

/** Leading minus, caught separately so the sentence can name the reason. */
const NEGATIVE_PATTERN = /^\s*-/u;

/**
 * Parse a counted quantity.
 *
 * `unit` is the item's own `inventory_item.unit` string and is used **only** in
 * the fractional message, because that is the one failure a clerk needs the unit
 * to understand: a half chair is nonsense and half a metre of cable is a
 * measurement the register has nowhere to record.
 *
 * `max` mirrors a server-side ceiling so the honest limit is visible while the
 * clerk is still typing rather than as a refusal after a round trip. Omit it
 * where the server has no ceiling.
 */
export const parseQuantity = (
  raw: string,
  options: { unit?: string; max?: number } = {}
): QuantityParse => {
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return { ok: false, problem: "empty", message: "" };
  }

  if (NEGATIVE_PATTERN.test(trimmed)) {
    return {
      ok: false,
      problem: "negative",
      message:
        "A quantity cannot be negative. The school does not hold less than nothing — to take stock off the register use Remove from stock, which records why.",
    };
  }

  if (!COUNTED_PATTERN.test(trimmed)) {
    return {
      ok: false,
      problem: "not-a-number",
      message: NOT_A_NUMBER_MESSAGE,
    };
  }

  const value = Number(trimmed);

  if (!Number.isFinite(value)) {
    return {
      ok: false,
      problem: "not-a-number",
      message: NOT_A_NUMBER_MESSAGE,
    };
  }

  /**
   * The `Number.isInteger` test rather than a regex for the fraction, so `2.0` and
   * `2.` are accepted (they *are* two) and `2.50` is refused (it is not).
   */
  if (!Number.isInteger(value)) {
    const unit = options.unit?.trim();
    return {
      ok: false,
      problem: "fractional",
      message: unit
        ? `Stock is counted in whole ${unit}s, so ${trimmed} cannot be booked in. If this item is measured rather than counted, its unit on the register should be the smallest thing you actually count.`
        : `Stock is counted in whole numbers, so ${trimmed} cannot be booked in.`,
    };
  }

  if (value < 1) {
    return {
      ok: false,
      problem: "not-positive",
      message:
        "Enter at least 1. Nothing moved is not a movement, and the register refuses a movement of zero.",
    };
  }

  if (options.max !== undefined && value > options.max) {
    return {
      ok: false,
      problem: "too-large",
      message: `A single movement is at most ${options.max} units. Split the delivery into separate records rather than raising the ceiling.`,
    };
  }

  return { ok: true, value };
};

/**
 * Is this a *filled-in* quantity, whatever its verdict?
 *
 * The submit gate needs to tell "the clerk typed something" (so the field should be
 * marked invalid and focus should go to it) from "the field is still empty" (so it
 * should not shout at them before they have started). `problem === "empty"` is the only
 * state where the answer is no.
 */
export const isEntered = (parse: QuantityParse): boolean =>
  !parse.ok && parse.problem !== "empty";

/**
 * A count and the item's own unit word, as prose.
 *
 * **The unit is printed exactly as the register stores it and is never
 * pluralised by this function.** `inventory_item.unit` is a free-text column
 * defaulting to `"unit"`, so a school that wrote `chair` gets "3 chair" and a
 * school that wrote `each` gets "3 each" — the register's own word, every time.
 * Guessing a plural from free text is how "3 boxs" happens, and a storebook that
 * cannot agree with itself about its own units is the thing this feature exists
 * to prevent.
 *
 * Where genuine grammar *is* needed — a toast, a dialog title — `pluralUnits`
 * handles the one word that is always the same (`unit`), and every place that
 * knows the item passes the item's unit instead.
 */
export const counted = (count: number, unit: string): string => {
  const label = unit.trim().length > 0 ? unit.trim() : "unit";
  return `${count} ${label}`;
};

/**
 * The one word in this feature that is reliably in the singular, and therefore
 * the one place a `-s` is safe.
 *
 * Used in prose that has no item in hand — a button label, a dialog title, a
 * toast about a movement whose response did not echo the unit back. Everywhere
 * the item *is* in hand, `counted` is better because it uses the school's word.
 */
export const pluralUnits = (count: number): string =>
  count === 1 ? "1 unit" : `${count} units`;

/**
 * A resulting quantity, rendered so a negative cannot hide.
 *
 * A projected figure of `-2` is the single most useful thing this feature can
 * show somebody about to press the button, and it must not be rendered as `2` or
 * as a dash. The sign is always printed when the figure is below zero.
 */
export const projected = (count: number, unit: string): string =>
  count < 0 ? `−${Math.abs(count)} ${unit}` : counted(count, unit);
