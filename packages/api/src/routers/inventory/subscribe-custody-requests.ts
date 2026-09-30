/**
 * The live channel a signed-in teacher's dashboard holds open: every custody
 * request that concerns them, the moment it happens, over one Server-Sent
 * Events connection. See `custody-request-events.ts` for what "concerns them"
 * means and why this is new ground for the inventory feature rather than a
 * widening of the existing pull-based notices.
 *
 * The handler is an async generator — oRPC streams each `yield` to the client
 * as an SSE event and keeps the connection open until the caller disconnects,
 * at which point `signal` aborts and the `finally` block unsubscribes. There
 * is deliberately no polling and no client-side interval: the connection
 * itself is the "did anything happen" answer.
 */
import { requireInventoryPermission } from "../../index";
import type { CustodyRequestEvent } from "./custody-request-events";
import { custodyRequestEvents } from "./custody-request-events";
import { getInventoryActor } from "./inventory-database";

export const subscribeCustodyRequests = requireInventoryPermission(
  "read"
).handler(async function* subscribeCustodyRequests({ context, signal }) {
  const actor = await getInventoryActor(context);

  const iterator = custodyRequestEvents.subscribe(actor.staffId, { signal });

  for await (const event of iterator) {
    yield event satisfies CustodyRequestEvent;
  }
});
