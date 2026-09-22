import {
  adminClient,
  multiSessionClient,
  usernameClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Client mirrors the server plugins (packages/auth: username, admin,
 * multiSession) so typed helpers like `signIn.username` and the `role`
 * field on the session user exist at runtime and at type level.
 */
export const authClient = createAuthClient({
  plugins: [usernameClient(), adminClient(), multiSessionClient()],
});
