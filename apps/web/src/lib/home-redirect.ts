import { redirect } from "@tanstack/react-router";

import { getMyHomePath } from "@/functions/get-home-path";

/**
 * Bounce a member out of a workspace their role does not own.
 *
 * Every workspace guard calls this, and the escape hatch matters: if the home
 * path somehow resolves back to the address being viewed, following it would
 * produce an endless redirect chain (the browser's ERR_TOO_MANY_REDIRECTS).
 * `/account` is reachable by every signed-in account, so it is a destination
 * that cannot bounce again.
 */
export const redirectToHome = async (pathname: string): Promise<never> => {
  const home = await getMyHomePath();

  if (home === pathname) {
    throw redirect({ to: "/account" });
  }

  throw redirect({ href: home as never });
};
