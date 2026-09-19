import * as v from "valibot";

/**
 * Nominal-typing wrapper: `Brand<string, "StaffId">` isn't assignable from a
 * bare string. Uses a plain string property key (not a `unique symbol`) so
 * the type stays portable across package declaration-emit boundaries — a
 * symbol-keyed brand breaks `tsc -b` composite builds once the branded type
 * flows through enough generic inference (e.g. oRPC's procedure builder).
 */
export type Brand<T, Name extends string> = T & {
  readonly __brand: Name;
};

/** Valibot transform that stamps a branded type onto an already-validated value. */
export const brand = <T, Name extends string>() =>
  v.transform((value: T) => value as Brand<T, Name>);
