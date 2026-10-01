import { files } from "@school-student-teacher-management/db/schema/files";
import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";

import { auth, db } from "@/services.server";

/**
 * The read half of `files.upload.ts` — every `imageUrl` this app hands to an
 * `<img src>` is a URL under this route, never a raw database row.
 *
 * **Nothing about a row is public**, so this route is what stands between a
 * stored photo and a browser: it checks the caller has a session at all, then
 * hands the `files.data` bytes straight back. An earlier version of this
 * route fetched an object from MinIO first (and, before that, redirected to
 * a presigned MinIO URL); both put a second network hop and a second service
 * between the request and the answer for what `files.upload.ts` now writes as
 * a plain row. Reading it back is one query.
 *
 * `Cache-Control: private, max-age=...` rather than public: the response is
 * gated on the caller's own session, so a shared cache must not serve one
 * reader's fetch to the next request that happens to reuse the same path.
 *
 * **Gated on "signed in", not on the two roles that may upload.** Uploading a
 * photo is a write with a blast radius — it changes what every reader of the
 * register sees — and is rightly narrowed to `admin`/`inventoryAdmin`.
 * Reading one back is not: every seat that can open the register at all
 * (`admin`, `principal`, `vicePrincipal`, `academicAdmin`) needs the photo to
 * render, and narrowing this route to the upload roles would blank every
 * other reader's item dialog.
 */
/** How long a browser or intermediate cache may keep a fetched photo. */
const CACHE_MAX_AGE_SECONDS = 300;

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
    .select({ data: files.data, type: files.type })
    .from(files)
    .where(eq(files.id, params.fileId))
    .limit(1);

  if (!row) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.type,
      "Cache-Control": `private, max-age=${CACHE_MAX_AGE_SECONDS}`,
    },
  });
};

export const Route = createFileRoute("/api/files/$fileId")({
  server: {
    handlers: {
      GET: handleGet,
    },
  },
});
