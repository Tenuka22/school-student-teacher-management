/**
 * A changed password ends every other session of that account (A1).
 *
 * better-auth's `/change-password` revokes other sessions only when the
 * **client** sends `revokeOtherSessions: true`, so whether a stolen session
 * survived the victim's password change was the caller's choice — and the
 * caller is the browser the attacker may already be in. This `before` hook
 * overwrites the flag on the server. better-auth then deletes every session of
 * the user and issues a fresh one for the device that made the change, so the
 * person changing their password stays signed in there and nowhere else.
 *
 * The other half — a password *reset* by emailed code, which is made without
 * a session — is `emailAndPassword.revokeSessionsOnPasswordReset` in
 * `index.ts`; that endpoint has no "current" session to keep.
 */
export const PASSWORD_CHANGE_PATH = "/change-password";

interface HookContext {
  path?: string;
  body?: unknown;
}

export const forceSessionRevocationOnPasswordChange = (
  ctx: HookContext
): { context: { body: Record<string, unknown> } } | undefined => {
  if (ctx.path !== PASSWORD_CHANGE_PATH) {
    return undefined;
  }
  const body =
    ctx.body && typeof ctx.body === "object"
      ? (ctx.body as Record<string, unknown>)
      : {};
  return { context: { body: { ...body, revokeOtherSessions: true } } };
};
