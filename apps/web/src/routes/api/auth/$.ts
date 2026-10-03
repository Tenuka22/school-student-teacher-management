import { createFileRoute } from "@tanstack/react-router";

import { MAX_AUTH_BODY_BYTES, refuseOversizedBody } from "@/lib/request-limits";
import { auth } from "@/services.server";

const handle = ({ request }: { request: Request }) =>
  refuseOversizedBody(request, MAX_AUTH_BODY_BYTES) ?? auth.handler(request);

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
    },
  },
});
