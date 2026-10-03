import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import type { Context as ApiContext } from "@school-student-teacher-management/api/context";
import { logServerError } from "@school-student-teacher-management/api/lib/log";
import { openApiSchemaConverters } from "@school-student-teacher-management/api/lib/openapi";
import { appRouter } from "@school-student-teacher-management/api/routers/index";
import { createFileRoute } from "@tanstack/react-router";

import { createContext } from "../../../context";
import {
  MAX_RPC_BODY_BYTES,
  refuseOversizedBody,
} from "../../../lib/request-limits";

/**
 * Errors are logged as one structured line each, keyed by the request id the
 * client also receives — never the raw error, whose database variant carries
 * the SQL parameters (F-34). See `packages/api/src/lib/log.ts`.
 */
const logError = (
  error: unknown,
  options: { context: ApiContext; request: { url: URL } }
) => {
  logServerError(error, {
    requestId: options.context.requestId,
    userId: options.context.session?.user.id ?? null,
    // Handler interceptors see the request, not the procedure path; the
    // URL after the prefix is that path (`/api/rpc/staff/createStaff`).
    path: options.request.url.pathname.split("/").filter(Boolean).slice(2),
  });
};

const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    // eslint-disable-next-line promise/prefer-await-to-callbacks
    onError(logError),
  ],
});

/**
 * The OpenAPI reference lists every procedure and its input shape. It is a
 * development aid: in production it is not mounted (F-41), and its schemas
 * now come from the valibot converter — every procedure is valibot, so the
 * zod converter it used to be given produced empty schemas.
 */
const isProduction = process.env.NODE_ENV === "production";
const apiHandler = isProduction
  ? null
  : new OpenAPIHandler(appRouter, {
      plugins: [
        new OpenAPIReferencePlugin({
          schemaConverters: openApiSchemaConverters(),
        }),
      ],
      interceptors: [
        // eslint-disable-next-line promise/prefer-await-to-callbacks
        onError(logError),
      ],
    });

const withRequestId = (response: Response, requestId: string) => {
  const headers = new Headers(response.headers);
  headers.set("x-request-id", requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const handle = async ({ request }: { request: Request }) => {
  const requestId = crypto.randomUUID();
  const refused = refuseOversizedBody(request, MAX_RPC_BODY_BYTES);
  if (refused) {
    return withRequestId(refused, requestId);
  }
  // One context per request: it used to be built twice for every reference
  // request (two session lookups).
  const context: ApiContext = {
    ...(await createContext({ req: request })),
    requestId,
  };

  const rpcResult = await rpcHandler.handle(request, {
    prefix: "/api/rpc",
    context,
  });
  if (rpcResult.response) {
    return withRequestId(rpcResult.response, requestId);
  }

  if (apiHandler) {
    const apiResult = await apiHandler.handle(request, {
      prefix: "/api/rpc/api-reference",
      context,
    });
    if (apiResult.response) {
      return withRequestId(apiResult.response, requestId);
    }
  }

  return new Response("Not found", { status: 404 });
};

export const Route = createFileRoute("/api/rpc/$")({
  server: {
    handlers: {
      HEAD: handle,
      GET: handle,
      POST: handle,
      PUT: handle,
      PATCH: handle,
      DELETE: handle,
    },
  },
});
