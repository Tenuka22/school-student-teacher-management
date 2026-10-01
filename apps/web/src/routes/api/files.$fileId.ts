import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { files } from "@school-student-teacher-management/db/schema/files";
import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";

import { ENV } from "@/env.server";
import { auth, db, storage } from "@/services.server";

/**
 * The read half of `files.upload.ts` — every `imageUrl` this app hands to an
 * `<img src>` is a URL under this route, never a raw MinIO address.
 *
 * **The bucket is private, on purpose (see `files.upload.ts`'s own
 * comment), so nothing can fetch an object straight from MinIO.** This route
 * is what stands between a stored object and a browser: it checks the caller
 * has a session at all, then mints a presigned `GetObject` URL good for
 * `PRESIGN_TTL_SECONDS` and redirects to it. The redirect is 302 rather than
 * 301 for the reason it always is for a link whose target rotates on every
 * request — a client or proxy that cached a 301 would keep replaying a
 * presigned URL whose signature has since expired.
 *
 * **Gated on "signed in", not on the two roles that may upload.** Uploading a
 * photo is a write with a blast radius — it changes what every reader of the
 * register sees — and is rightly narrowed to `admin`/`inventoryAdmin`.
 * Reading one back is not: every seat that can open the register at all
 * (`admin`, `principal`, `vicePrincipal`, `academicAdmin`) needs the photo to
 * render, and narrowing this route to the upload roles would blank every
 * other reader's item dialog.
 */
const PRESIGN_TTL_SECONDS = 300;

const handleGet = async ({
  request,
  params,
}: {
  request: Request;
  params: { fileId: string };
}) => {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return new Response("Not authenticated", { status: 401 });
  }

  const [row] = await db
    .select({ key: files.key, type: files.type })
    .from(files)
    .where(eq(files.id, params.fileId))
    .limit(1);

  if (!row) {
    return new Response("Not found", { status: 404 });
  }

  const url = await getSignedUrl(
    storage,
    new GetObjectCommand({
      Bucket: ENV.MINIO_BUCKET,
      Key: row.key,
      ResponseContentType: row.type,
    }),
    { expiresIn: PRESIGN_TTL_SECONDS }
  );

  return Response.redirect(url, 302);
};

export const Route = createFileRoute("/api/files/$fileId")({
  server: {
    handlers: {
      GET: handleGet,
    },
  },
});
