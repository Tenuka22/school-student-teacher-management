import {
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-valibot";
import * as v from "valibot";

import { user } from "./auth";
import { brand } from "./brand";
import type { Brand } from "./brand";

export type FileId = Brand<string, "FileId">;
export const fileIdSchema = v.pipe(v.string(), brand<string, "FileId">());

/**
 * Raw bytes, stored in Postgres rather than an object store. Uploaded photos
 * are re-encoded to a 1024×1024 WebP at quality 82
 * (`apps/web/src/lib/image-upload.ts`) before they ever reach this column, so
 * a row is tens of kilobytes — the register has no use for a general-purpose
 * file store, only small item photos, and a second service (MinIO) to run,
 * back up and keep reachable was a cost this feature does not need to pay.
 * `node-postgres` (`drizzle-orm/node-postgres`, see `packages/db/src/index.ts`)
 * reads and writes `bytea` as a plain Node `Buffer`, so no custom (de)serialiser
 * is needed beyond naming the Postgres type.
 *
 * The valibot override below checks `instanceof Uint8Array` rather than
 * `instanceof Buffer` — `Buffer` is a Node global, this schema module is
 * also pulled into the browser bundle (nothing in this file is server-only),
 * and referencing it there threw `Buffer is not defined` on every page that
 * imported the schema, transitively or not. `Buffer` is a `Uint8Array`
 * subclass, so the check still accepts exactly the value the driver hands
 * back.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const files = pgTable(
  "files",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    size: integer("size").notNull(),
    type: text("type").notNull(),
    /** The file's own bytes. Read back and streamed by
     * `apps/web/src/routes/api/files.$fileId.ts`, gated on the caller's
     * session — never served from a public path. */
    data: bytea("data").notNull(),
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
  data: () => v.instance(Uint8Array),
  size: () => v.pipe(v.number(), v.minValue(1)),
});
export const filesUpdateSchema = createUpdateSchema(files, {
  id: () => fileIdSchema,
  name: () => v.pipe(v.string(), v.minLength(1)),
  type: () => v.pipe(v.string(), v.minLength(1)),
  data: () => v.instance(Uint8Array),
  size: () => v.pipe(v.number(), v.minValue(1)),
});
