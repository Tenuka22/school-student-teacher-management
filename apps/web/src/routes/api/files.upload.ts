import { files } from "@school-student-teacher-management/db/schema/files";
import { createFileRoute } from "@tanstack/react-router";

import {
  checkDeclaredLength,
  normaliseUploadedImage,
} from "@/lib/image-upload";
import { auth, db } from "@/services.server";

/**
 * Item-photo upload: the storage half of `inventoryItem.imageFileId`, which
 * has existed on the schema since the table was designed and had no writer
 * until this route.
 *
 * **The bytes live in the `files.data` column, not an object store.** An
 * earlier version of this route wrote to MinIO over the S3 API; that meant a
 * second service to run, back up and keep reachable for what is, after the
 * re-encode below, a handful of tens-of-kilobyte rows — small enough that
 * Postgres itself (already the system of record for everything else here)
 * is the simpler place to keep them. Nothing about a row is public: every
 * reader gets the photo back through `/api/files/$fileId`
 * (`files.$fileId.ts`), which checks the caller's session before it streams
 * the bytes back.
 *
 * **Every accepted image is re-encoded to WebP, cropped to a 1:1 square, and
 * capped at `MAX_DIMENSION` — not a pass-through, and not optional.** The
 * client already crops to a square before it ever calls this route (see
 * `ImageUploadField` in `item-form-fields.tsx`), but the server does not trust
 * that: `sharp`'s own `resize(…, { fit: "cover" })` re-crops to exactly square
 * regardless of what arrives, so a client that skipped the crop step — a
 * future caller, a replayed request — still cannot write a non-square photo
 * into the register. `.rotate()` with no argument reads the image's own EXIF
 * orientation and bakes it into the pixels before the crop, which is what
 * stops a phone-camera portrait from being cropped square in landscape and
 * saved sideways. WebP is required rather than offered because the four
 * formats a phone or a scanner actually produces (PNG, JPEG, WEBP, GIF) each
 * decode and display fine but do not compress alike, and a register with 300
 * item photos in whatever format each camera happened to produce is 300 files
 * of unpredictable weight; one format, one quality setting, is one number to
 * reason about.
 *
 * A plain `POST` handler rather than an oRPC procedure, for the same reason
 * `api/rpc/$.ts` and `api/auth/$.ts` already are: this reads a
 * `multipart/form-data` body, and oRPC's own request/response contract is
 * built around typed JSON in and out, not a raw upload stream.
 */
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

  // Size first, from the header, before `formData()` buffers the body: the
  // file-size check used to run only after the whole request was in memory.
  const tooLarge = checkDeclaredLength(request.headers.get("content-length"));
  if (tooLarge && !tooLarge.ok) {
    return Response.json(
      { message: tooLarge.message },
      { status: tooLarge.status }
    );
  }

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return Response.json({ message: "No file was sent" }, { status: 400 });
  }

  // Declared type, size, decoded format, pixel bound and re-encode — see
  // `lib/image-upload.ts`. What is stored is always a fresh WebP.
  const result = await normaliseUploadedImage(
    new Uint8Array(await file.arrayBuffer()),
    file.type
  );
  if (!result.ok) {
    return Response.json(
      { message: result.message },
      { status: result.status }
    );
  }
  const webpBytes = result.webp;

  const id = crypto.randomUUID();

  await db.insert(files).values({
    id,
    name: file.name,
    size: webpBytes.length,
    type: "image/webp",
    data: webpBytes,
    userId: session.user.id,
  });

  return Response.json({ fileId: id, url: `/api/files/${id}` });
};

export const Route = createFileRoute("/api/files/upload")({
  server: {
    handlers: {
      POST: handleUpload,
    },
  },
});
