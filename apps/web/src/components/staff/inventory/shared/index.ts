// Intentional barrel file, and the more specific rule wins.
//
// AGENTS.md's general Ultracite guidance says "avoid barrel files", but every
// staff feature folder in this app is built as one import surface — the schema
// registry (`packages/db/src/schema/index.ts`) carries the same
// `no-barrel-file` pragma for the same reason. The inventory feature is being
// built by four agents at once against a documented import path
// (`@/components/staff/inventory/shared`), and a barrel is what makes that path
// a single stable contract rather than a set of file paths every consumer has to
// know. The tree-shaking cost is one folder of leaf components in a
// route-level code-split bundle.
// oxlint-disable-next-line no-barrel-file
export * from "./borrower-picker";
export * from "./inventory-filter-bar";
export * from "./inventory-query-keys";
export * from "./inventory-stats";
export * from "./inventory-states";
export * from "./inventory-status-badge";
export * from "./item-picker";
export * from "./money-field";
export * from "./teacher-combobox";
export * from "./transfer-reason-field";
export * from "./unit-picker";
