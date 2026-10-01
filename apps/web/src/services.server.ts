import { S3Client } from "@aws-sdk/client-s3";
import {
  createAuth,
  ensureBootstrapUsers,
  purgeUnverifiedAccounts,
} from "@school-student-teacher-management/auth";
import { createDb } from "@school-student-teacher-management/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);

/**
 * The object store every uploaded file goes through — today just inventory
 * item photos (`apps/web/src/routes/api/files.upload.ts` writes here,
 * `apps/web/src/routes/api/files.$fileId.ts` reads back with a presigned URL).
 * One client for both directions, for the same reason `db` and `auth` are one
 * instance each: a route that built its own would drift from this one's region
 * and path-style settings the moment either changed.
 *
 * `forcePathStyle: true` because MinIO is addressed as
 * `http://<host>:<port>/<bucket>/<key>`, not the virtual-hosted
 * `<bucket>.<host>` style the AWS SDK defaults to — without it every
 * request 404s against a bucket named like a subdomain that does not exist.
 * `region` is required by the SDK's types and ignored by MinIO; `us-east-1` is
 * the same placeholder the SDK's own docs use for an S3-compatible endpoint
 * that has no real regions.
 */
export const storage = new S3Client({
  endpoint: `${ENV.MINIO_USE_SSL ? "https" : "http"}://${ENV.MINIO_ENDPOINT}:${ENV.MINIO_PORT}`,
  region: "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: ENV.MINIO_ACCESS_KEY,
    secretAccessKey: ENV.MINIO_SECRET_KEY,
  },
});

// Bootstrap the admin + leadership accounts on every server start. A missing
// seat is created with its env password; an existing seat's password is never
// overwritten (env is the *initial* password only — rotate with
// `scripts/rotate-seat-password.ts`). Boot refuses a short or published seat
// password (`seat-password-policy.ts`).
await ensureBootstrapUsers(db, ENV);

// Then sweep abandoned sign-ups: an account that never confirmed its address
// is deleted once it ages past the retention window. Only `emailVerified:
// false` rows are eligible, so this cannot touch a real member or a seeded
// account. Boot-time is enough because new throwaways only appear via
// sign-up, and the next restart sweeps them.
const swept = await purgeUnverifiedAccounts(db);
if (swept.removed > 0) {
  console.log(`[auth] Purged ${swept.removed} unverified account(s)`);
}
