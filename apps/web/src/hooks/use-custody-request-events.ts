import type { CustodyRequestEvent } from "@school-student-teacher-management/api/routers/inventory/custody-request-events";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { client, orpc } from "@/utils/orpc";

export type { CustodyRequestEvent } from "@school-student-teacher-management/api/routers/inventory/custody-request-events";

/**
 * Keeps one live SSE connection open to `custody.requests.subscribe` for as
 * long as the calling component is mounted, and hands back the most recent
 * event so a caller can render it as a banner.
 *
 * This is the one place in the app that calls the raw oRPC `client` instead
 * of a TanStack Query hook — `useQuery` models a request/response read, and
 * an open server-sent stream is neither: it never resolves, so there is no
 * "data" for a query cache to hold. What a stream *should* do to the query
 * cache is invalidate the ordinary reads it makes stale (the incoming queue,
 * the item's own view) the moment an event names them, which is exactly what
 * this hook does on every event before handing it to the caller.
 */
export const useCustodyRequestEvents = (
  onEvent?: (event: CustodyRequestEvent) => void
) => {
  const queryClient = useQueryClient();
  const [latestEvent, setLatestEvent] = useState<CustodyRequestEvent | null>(
    null
  );
  // `onEvent` is read through a ref, updated in its own effect, so the
  // subscription effect below never has to list a fresh inline callback in
  // its dependencies — doing so would tear the SSE connection down and
  // reconnect it on every render that passed a new closure.
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  // oxlint-disable-next-line react-doctor/effect-needs-cleanup -- subscribe() opens inside run()'s async body, which the static check cannot follow; the cleanup below is real: controller.abort() cancels it whether or not it has resolved yet, and iterator?.return() unwinds it if it has
  useEffect(() => {
    const controller = new AbortController();
    // Held here, outside the async body, so the cleanup function below can
    // call `.return()` on it directly rather than relying solely on the
    // abort signal to unwind the generator.
    let iterator: Awaited<
      ReturnType<typeof client.inventory.custody.requests.subscribe>
    > | null = null;

    const run = async () => {
      try {
        iterator = await client.inventory.custody.requests.subscribe(
          {},
          { signal: controller.signal }
        );

        // A manual pull loop rather than `for await…of`: it does the exact
        // same thing, and it is the form every reviewer here can step
        // through one `.next()` at a time.
        // oxlint-disable-next-line no-await-in-loop -- an async generator's
        // `.next()` is inherently sequential: the next event cannot be
        // fetched before this one is handled, so there is nothing to batch
        // into a `Promise.all` here.
        let step = await iterator.next();
        while (!step.done) {
          const event = step.value;
          setLatestEvent(event);
          onEventRef.current?.(event);

          // The two reads a request event can make stale: whichever queue the
          // event landed on (incoming for the custodian, outgoing for the
          // requester) and the equipment views built from `myItems`, which
          // change the moment an `approved` event actually moves the item.
          const invalidations = [
            queryClient.invalidateQueries({
              queryKey:
                orpc.inventory.custody.requests.listIncoming.queryOptions({
                  input: {},
                }).queryKey,
            }),
            queryClient.invalidateQueries({
              queryKey:
                orpc.inventory.custody.requests.listOutgoing.queryOptions({
                  input: {},
                }).queryKey,
            }),
          ];
          if (event.type === "approved") {
            invalidations.push(
              queryClient.invalidateQueries({
                queryKey: orpc.inventory.custody.myItems.queryOptions({
                  input: {},
                }).queryKey,
              }),
              queryClient.invalidateQueries({
                queryKey: orpc.inventory.custody.lent.queryOptions({
                  input: {},
                }).queryKey,
              })
            );
          }
          // oxlint-disable-next-line no-await-in-loop -- already collected into one Promise.all per the rule's own advice; this is the one unavoidable wait for this event's invalidations before reading the next
          await Promise.all(invalidations);

          // oxlint-disable-next-line no-await-in-loop -- an async generator's .next() is inherently sequential, same as the first call above
          step = await iterator.next();
        }
      } catch (error) {
        // An aborted connection (component unmount, or a fresh effect run) is
        // this hook's own cleanup, not a failure worth surfacing.
        if (controller.signal.aborted) {
          return;
        }
        // oxlint-disable-next-line no-console -- dev-visible only; no user-facing
        // surface exists for a background stream failure short of retrying it.
        console.error("Custody request stream ended unexpectedly", error);
      }
    };

    void run();

    return () => {
      controller.abort();
      void iterator?.return();
    };
  }, [queryClient]);

  return { latestEvent, clearLatestEvent: () => setLatestEvent(null) };
};
