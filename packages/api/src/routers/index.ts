import type { RouterClient } from "@orpc/server";

import { inventoryRouter } from "./inventory";
import { markingRouter } from "./marking";
import { staffRouter } from "./staff";

export const appRouter = {
  marking: markingRouter,
  staff: staffRouter,
  inventory: inventoryRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
