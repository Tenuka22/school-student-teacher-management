import type { Context as ApiContext } from "@school-student-teacher-management/api/context";
import { clientAddressOf } from "@school-student-teacher-management/api/lib/rate-limit";

import { ENV } from "./env.server";
import { db, auth } from "./services.server";

export const createContext = async ({
  req,
}: {
  req: Request;
}): Promise<ApiContext> => {
  const session = await auth.api.getSession({
    headers: req.headers,
  });
  return {
    db,
    session,
    auth,
    headers: req.headers,
    // srvx's Node request carries the socket's peer address as `ip`.
    clientAddress: clientAddressOf(req.headers, {
      socketAddress: (req as Request & { ip?: string }).ip,
      trustedProxyHops: ENV.TRUSTED_PROXY_HOPS,
    }),
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
