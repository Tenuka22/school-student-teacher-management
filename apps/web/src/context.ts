import type { Context as ApiContext } from "@school-student-teacher-management/api/context";

import { ENV } from "./env.server";
import { db, auth } from "./services";

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
    env: ENV,
    auth,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
