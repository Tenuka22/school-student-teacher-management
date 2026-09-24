import { redirect } from "@tanstack/react-router";

import { getMyHomePath } from "@/functions/get-home-path";

/**
 * Send a signed-in member to the page that belongs to them — but never to the
 * page they are already on.
 *
 * Every entry route (`/`, `/login`, `/signup`, the legacy `/dashboard`) calls
 * this. The guard matters: if the resolved home path ever equals the current
 * address, following it produces an endless redirect chain that the browser
 * reports as ERR_TOO_MANY_REDIRECTS. In that case the caller stays put and
 * renders, which is the correct outcome anyway — the session is valid, so the
 * page it asked for is reachable.
 */
export const redirectAwayFromSelf = async (
  pathname: string
): Promise<boolean> => {
  const home = await getMyHomePath();

  if (home === pathname) {
    return false;
  }

  throw redirect({ href: home as never });
};
