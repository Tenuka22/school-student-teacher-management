/**
 * Request-body ceilings, checked from `Content-Length` before the body is
 * read (BODY). Without them `/api/rpc` and `/api/auth` buffered and parsed a
 * body of any size before a single valibot length rule could run.
 *
 * Each ceiling is the largest legitimate payload plus headroom:
 *
 * - **RPC, 8 MB** — `staff.imports.parseExcel` takes up to 6,000,000 base64
 *   characters (`MAX_BASE64_LENGTH`); an attendance import of its 5,000-row
 *   cap is about 3 MB. Every other procedure is a few kilobytes.
 * - **Auth, 64 KB** — sign-in, password change and the one-time-code
 *   endpoints carry a handful of short fields.
 * - The photo upload has its own ceiling (`MAX_REQUEST_BYTES` in
 *   `image-upload.ts`), checked the same way in `files.upload.ts`.
 *
 * A body without `Content-Length` (chunked) is refused with 411: the app's
 * own clients always send one, and a streamed body would have to be counted
 * as it arrives instead.
 */
export const MAX_RPC_BODY_BYTES = 8 * 1024 * 1024;
export const MAX_AUTH_BODY_BYTES = 64 * 1024;

const METHODS_WITHOUT_BODY = new Set(["GET", "HEAD", "OPTIONS"]);

/** A response refusing the request, or `null` when it may be read. */
export const refuseOversizedBody = (
  request: Request,
  maxBytes: number
): Response | null => {
  if (METHODS_WITHOUT_BODY.has(request.method)) {
    return null;
  }
  const header = request.headers.get("content-length");
  if (header === null) {
    return new Response("A request body must declare its length", {
      status: 411,
    });
  }
  const length = Number(header);
  if (!Number.isFinite(length) || length < 0) {
    return new Response("Invalid Content-Length", { status: 400 });
  }
  if (length > maxBytes) {
    return new Response("Request body too large", { status: 413 });
  }
  return null;
};
