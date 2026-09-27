/**
 * The live channel for custody requests: one `EventPublisher` instance,
 * subscribed to per staff id, so a member of staff's own dashboard hears
 * about a request the moment it is raised or decided — without polling.
 *
 * This is genuinely new ground for the inventory feature. `list-custody-
 * notices.ts` says outright that the rest of this module has "no push
 * channel" and means it: a custody change is surfaced the next time the
 * recipient's own page happens to read for it. That was the right call for a
 * change that has already happened and only needs to be *noticed*
 * eventually. A borrow request is different in kind: it is a question with
 * nobody yet holding the answer, asked of one specific person, and it stays
 * unanswered until they see it. That is what a live channel is for, and
 * nothing about this file's addition weakens the pull-based notices — the two
 * mechanisms answer different questions and neither replaces the other.
 *
 * **Process-local, on purpose, for now.** `EventPublisher` keeps its
 * listeners in memory, so a subscriber only hears events published from the
 * same server process it is connected to. That is the correct trade for this
 * school's one-instance deployment (see `apps/web`'s dev server and the
 * single Postgres connection the rest of this module already assumes) and the
 * honest limitation to state plainly rather than silently outgrow: a
 * multi-instance deployment would need a shared bus (Postgres `LISTEN`/
 * `NOTIFY`, or Redis) behind the same `publish`/`subscribe` shape, and this
 * module is the one place that swap would happen.
 */
import { EventPublisher } from "@orpc/server";

/**
 * One event on the channel, keyed to the staff id it concerns —
 * `subscribeCustodyRequests` subscribes to its caller's own `userId`, so a
 * teacher only ever receives events that concern them, never anyone else's.
 */
export interface CustodyRequestEvent {
  type: "requested" | "approved" | "denied" | "cancelled";
  requestId: string;
  itemId: string;
  itemName: string;
  requesterStaffId: string;
  requesterName: string;
  custodianStaffId: string;
  custodianName: string;
  note: string | null;
  decisionNote: string | null;
  /** ISO timestamp of the event itself, not of the request's own history. */
  at: string;
}

/** The key is a user id: "tell whoever is this user id this happened". */
export const custodyRequestEvents = new EventPublisher<
  Record<string, CustodyRequestEvent>
>();
