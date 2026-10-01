import { experimental_ValibotToJsonSchemaConverter as ValibotToJsonSchemaConverter } from "@orpc/valibot";

/**
 * Schema converters for the OpenAPI reference. Every procedure's input is a
 * valibot schema, so the reference needs the valibot converter; it used to be
 * given the zod one, which produced empty schemas (F-41). Exported from here
 * so `@orpc/valibot` stays a dependency of this package alone.
 */
export const openApiSchemaConverters = () => [
  new ValibotToJsonSchemaConverter(),
];
