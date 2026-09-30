import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { files } from "@school-student-teacher-management/db/schema/files";
import { createFileRoute } from "@tanstack/react-router";

import { auth, db } from "@/services.server";

/**
 * Item-photo upload: the storage half of `inventoryItem.imageFileId`, which
 * has existed on the schema since the table was designed and had no writer
 * until this route.
 *
 * **Disk, under `public/uploads/`, not a database blob and not a bucket.**
 * `files.key` is documented as "LMDB in dev, MinIO object key in production"
 * — an aspiration this repo had not built either half of. This route builds
 * the dev half for real, and picks the plainest thing that is actually true
 * of a dev (and small-school single-instance) deployment: the app server's
 * own disk. `public/` is already how the college crest is served
 * (`/uploads/college-crest.png`), so a file written under
 * `public/uploads/inventory/` is reachable at the matching URL with no
 * second route to serve it back. **What would have to change for a
 * multi-instance production deployment** is exactly the write below and
 * nothing else: swap this `writeFile` for a MinIO/S3 `putObject` call and
 * store the returned object URL in the same `files.key` column — every
 * reader of `imageUrl` in this codebase already only cares that it is a
 * fetchable URL, never how it got there.
 *
 * A plain `POST` handler rather than an oRPC procedure, for the same reason
 * `api/rpc/$.ts` and `api/auth/$.ts` already are: this reads a
 * `multipart/form-data` body, and oRPC's own request/response contract is
 * built around typed JSON in and out, not a raw upload stream.
 */
/** 8 MiB \u2014 a phone photo, not a scan. */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "inventory");

/**
 * Who may attach a photo to an item: `admin` and `inventoryAdmin` — the two
 * roles the register's writes accept (`inventoryManagerProcedure` in
 * `packages/api/src/index.ts`). The comment this replaces claimed the gate
 * matched `adminOnlyProcedure`, which was both wrong and too narrow: the
 * seeded Inventory Administrator could edit an item but never attach its
 * picture. `academicAdmin` is deliberately absent — the register is not its
 * desk.
 */
const isAllowedRole = (role: string | undefined): boolean =>
  role === "admin" || role === "inventoryAdmin";

const handleUpload = async ({ request }: { request: Request }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session || !isAllowedRole(role)) {
    return Response.json(
      {
        message:
          "Only the administrator or Inventory Administrator may upload an item photo",
      },
      { status: 403 }
    );
  }

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return Response.json({ message: "No file was sent" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return Response.json(
      {
        message:
          "Only PNG, JPEG, WEBP or GIF images are accepted for an item photo",
      },
      { status: 400 }
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json(
      { message: "That image is larger than 8 MB" },
      { status: 400 }
    );
  }

  const id = crypto.randomUUID();
  const extension = path.extname(file.name) || `.${file.type.split("/")[1]}`;
  const storedName = `${id}${extension}`;
  const url = `/uploads/inventory/${storedName}`;

  await mkdir(UPLOAD_DIR, { recursive: true });
  const bytes = new Uint8Array(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, storedName), bytes);

  await db.insert(files).values({
    id,
    name: file.name,
    size: file.size,
    type: file.type,
    key: url,
    userId: session.user.id,
  });

  return Response.json({ fileId: id, url });
};

export const Route = createFileRoute("/api/files/upload")({
  server: {
    handlers: {
      POST: handleUpload,
    },
  },
});
