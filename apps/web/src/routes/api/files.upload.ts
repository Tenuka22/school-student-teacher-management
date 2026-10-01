import { PutObjectCommand } from "@aws-sdk/client-s3";
import { files } from "@school-student-teacher-management/db/schema/files";
import { createFileRoute } from "@tanstack/react-router";
import sharp from "sharp";

import { ENV } from "@/env.server";
import { auth, db, storage } from "@/services.server";

/**
 * Item-photo upload: the storage half of `inventoryItem.imageFileId`, which
 * has existed on the schema since the table was designed and had no writer
 * until this route.
 *
 * **MinIO, addressed through the S3 API, not the app server's own disk.**
 * `files.key` is documented as "MinIO object key" — this route is what makes
 * that true rather than aspirational. The object goes to the bucket named by
 * `MINIO_BUCKET`; nothing about the bucket is made public, because a public
 * bucket lets anyone who has ever seen a key read that photo forever, long
 * after the item is retired. Every reader gets the photo back through
 * `/api/files/$fileId` (`files.$fileId.ts`), which checks the caller's
 * session and hands out a short-lived presigned URL instead.
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
/** 8 MiB — a phone photo, not a scan. Checked before decoding, so an
 * oversized upload never reaches `sharp` at all. */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

/**
 * The square a stored photo is capped at, in pixels. Large enough to fill the
 * item dialog's own preview at any density this app targets, small enough
 * that a register of a few hundred items stays a few hundred small files
 * rather than a few hundred phone-camera originals.
 */
const MAX_DIMENSION = 1024;

/** WebP's own quality scale (0–100). 82 is libwebp's frequently-cited "no
 * visible loss on a photo" point; higher rarely earns back the extra bytes. */
const WEBP_QUALITY = 82;

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

  const originalBytes = new Uint8Array(await file.arrayBuffer());

  let webpBytes: Buffer;
  try {
    webpBytes = await sharp(originalBytes)
      .rotate()
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "cover" })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    // `sharp` refuses whatever this was to decode as an image — a renamed
    // non-image file, or a truncated upload. The MIME check above only trusts
    // what the browser claimed; this is the check on what the bytes actually
    // are.
    return Response.json(
      { message: "That file could not be read as an image" },
      { status: 400 }
    );
  }

  const id = crypto.randomUUID();
  const objectKey = `inventory/${id}.webp`;

  await storage.send(
    new PutObjectCommand({
      Bucket: ENV.MINIO_BUCKET,
      Key: objectKey,
      Body: webpBytes,
      ContentType: "image/webp",
    })
  );

  await db.insert(files).values({
    id,
    name: file.name,
    size: webpBytes.length,
    type: "image/webp",
    key: objectKey,
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
