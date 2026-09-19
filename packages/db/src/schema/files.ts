import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-valibot";
import * as v from "valibot";

import { user } from "./auth";
import { brand } from "./brand";
import type { Brand } from "./brand";

export type FileId = Brand<string, "FileId">;
export const fileIdSchema = v.pipe(v.string(), brand<string, "FileId">());

export const files = pgTable(
  "files",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    size: integer("size").notNull(),
    type: text("type").notNull(),
    /** Storage-layer key (LMDB in dev, MinIO object key in production). */
    key: text("key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("files_userId_idx").on(table.userId)]
);

export const filesSelectSchema = createSelectSchema(files, {
  id: () => fileIdSchema,
});
export const filesInsertSchema = createInsertSchema(files, {
  name: () => v.pipe(v.string(), v.minLength(1)),
  type: () => v.pipe(v.string(), v.minLength(1)),
  key: () => v.pipe(v.string(), v.minLength(1)),
  size: () => v.pipe(v.number(), v.minValue(1)),
});
