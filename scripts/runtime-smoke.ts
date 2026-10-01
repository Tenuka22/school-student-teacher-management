/**
 * Runtime smoke test against a RUNNING server (production build or dev), over
 * real HTTP. Checks the repaired security and error-handling behaviour end to
 * end: sign-in, the admin-plugin guard (F-01), structured conflicts (F-06),
 * request ids (F-34), the production-only API reference (F-41), the upload
 * guard (F-05) and production mail (F-12).
 *
 *   SMOKE_BASE_URL=http://localhost:3007 \
 *     bun --env-file=apps/web/.env scripts/runtime-smoke.ts
 *
 * Reads seat passwords from the environment and never prints them. Creates one
 * teacher (via the real `createStaff`); point it at a scratch database.
 */
import { PRINCIPAL_EMAIL } from "@school-student-teacher-management/auth/admin";

const base = process.env.SMOKE_BASE_URL ?? "http://localhost:3001";
/**
 * The Origin header must be the server's trusted origin (BETTER_AUTH_URL),
 * or better-auth refuses the request before any of the code under test runs —
 * which would make a 403 look like a pass. Separate from `base` because the
 * address dialled (127.0.0.1) and the configured origin (localhost) can differ.
 */
const origin = process.env.SMOKE_ORIGIN ?? base;
const results: { check: string; ok: boolean; detail: string }[] = [];

const record = (check: string, ok: boolean, detail: string) => {
  results.push({ check, ok, detail });
};

const post = (path: string, body: unknown, cookie?: string) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
    redirect: "manual",
  });

const signIn = async (username: string, password: string | undefined) => {
  const response = await post("/api/auth/sign-in/username", {
    username,
    password,
  });
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  return { status: response.status, cookie };
};

/** oRPC's RPC protocol: POST /api/rpc/<path> with `{ json: input }`. */
const rpc = (procedure: string, input: unknown, cookie: string) =>
  post(`/api/rpc/${procedure.replaceAll(".", "/")}`, { json: input }, cookie);

const home = await fetch(`${base}/`);
record("GET / serves", home.status === 200, `HTTP ${home.status}`);

const admin = await signIn("admin", process.env.ADMIN_PASSWORD);
record("admin signs in", admin.status === 200, `HTTP ${admin.status}`);
const academic = await signIn(
  "academic-admin",
  process.env.ACADEMIC_ADMIN_PASSWORD
);
record(
  "academic-admin signs in with the rotated password",
  academic.status === 200,
  `HTTP ${academic.status}`
);
const leaked = await signIn("academic-admin", "change-me-academic-admin");
record(
  "the published example password does not sign in",
  leaked.status !== 200,
  `HTTP ${leaked.status}`
);

const escalate = await post(
  "/api/auth/admin/create-user",
  {
    email: "smoke-intruder@example.com",
    password: "Smoke-intruder-pw-1",
    name: "Intruder",
    role: "admin",
  },
  academic.cookie
);
record(
  "F-01 academic-admin cannot create an admin",
  escalate.status === 403,
  `HTTP ${escalate.status}`
);

const accounts = await rpc("staff.listAccounts", {}, admin.cookie);
const requestId = accounts.headers.get("x-request-id");
record(
  "F-34 responses carry x-request-id",
  Boolean(requestId),
  requestId ?? "missing"
);
record(
  "admin lists accounts",
  accounts.status === 200,
  `HTTP ${accounts.status}`
);

const nic = `19${Date.now().toString().slice(-10)}`;
const first = await rpc(
  "staff.createStaff",
  { name: "Smoke Teacher", nic, staffCategory: "teacher" },
  admin.cookie
);
const duplicate = await rpc(
  "staff.createStaff",
  { name: "Smoke Twin", nic, staffCategory: "teacher" },
  admin.cookie
);
const duplicateBody = await duplicate.text();
record("createStaff succeeds", first.status === 200, `HTTP ${first.status}`);
record(
  "F-06 a duplicate NIC is 409, not 500",
  duplicate.status === 409,
  `HTTP ${duplicate.status}`
);
record(
  "F-06 the conflict body leaks no SQL",
  !/insert into|params:/iu.test(duplicateBody),
  duplicateBody.slice(0, 120)
);

const reference = await fetch(`${base}/api/rpc/api-reference`);
record(
  "F-41 API reference is not served in production",
  reference.status === 404,
  `HTTP ${reference.status}`
);

const svgForm = new FormData();
svgForm.append(
  "file",
  new File(
    ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    "photo.png",
    { type: "image/png" }
  )
);
const upload = await fetch(`${base}/api/files/upload`, {
  method: "POST",
  headers: { cookie: admin.cookie, origin },
  body: svgForm,
});
record(
  "F-05 an SVG declared as PNG is refused",
  upload.status === 400,
  `HTTP ${upload.status}`
);

// A real account's address: for an unknown address better-auth answers 200
// without sending anything (no enumeration), which proves nothing here.
const otp = await post("/api/auth/email-otp/send-verification-otp", {
  email: PRINCIPAL_EMAIL,
  type: "forget-password",
});
record(
  "F-12 production mail fails loudly with no transport configured",
  otp.status === 503,
  `HTTP ${otp.status}`
);

for (const { check, ok, detail } of results) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${check}  (${detail})`);
}
const failed = results.filter((result) => !result.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed > 0 ? 1 : 0);
