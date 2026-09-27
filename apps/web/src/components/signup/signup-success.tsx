import { Link } from "@tanstack/react-router";

import { AuthSplitLayout } from "@/components/auth-layout";

/**
 * Post-sign-up confirmation: reveals the username once, then routes to the
 * sign-in page. Styling comes from the scoped auth-* stylesheet in
 * AuthSplitLayout.
 *
 * Both routes out carry `?switch=1`, which is what tells the sign-in page not
 * to bounce a member who is already signed in (perhaps as a different
 * account) straight back into their own workspace. Without it, the link is a
 * no-op for anyone holding a session.
 *
 * The heading is the only thing above the fold that carries weight: no
 * "WELCOME ABOARD" line above it. A one-time display of a username is easy to
 * miss, so the value itself is set large, in a monospaced face, and the
 * primary action repeats the instruction in words as well as a button.
 */
export const SignupSuccess = ({
  heading,
  message,
  username,
  crossLinkTo,
  crossLinkText,
  crossLinkLabel,
  layoutTitle,
}: {
  heading: string;
  message: string;
  username: string;
  /** Where the secondary link points (e.g. back to sign-in). */
  crossLinkTo: "/login";
  /** Sentence before the cross-link. */
  crossLinkText: string;
  /** Label of the cross-link itself. */
  crossLinkLabel: string;
  layoutTitle: string;
}) => (
  <AuthSplitLayout
    eyebrow="KEEP IT SAFE"
    title={layoutTitle}
    subtitle="Your sign-in details are ready — keep your username somewhere safe."
  >
    <main className="auth-card">
      <h1 className="auth-h1">{heading}</h1>
      <p className="auth-intro" style={{ textAlign: "center" }}>
        {message}
      </p>
      <p className="auth-eyebrow" style={{ textAlign: "center" }}>
        YOUR USERNAME
      </p>
      <p className="auth-username">{username || "—"}</p>
      <p className="auth-note" style={{ textAlign: "center" }}>
        This is the only time the system shows it in full. Write it down, then
        sign in with it and the password you just chose.
      </p>
      <Link
        className="auth-submit"
        search={{ switch: 1 }}
        style={{ marginTop: 28 }}
        to="/login"
      >
        GO TO SIGN IN
      </Link>
      <p className="auth-card-foot">
        {crossLinkText}{" "}
        <Link search={{ switch: 1 }} to={crossLinkTo}>
          {crossLinkLabel}
        </Link>
      </p>
    </main>
  </AuthSplitLayout>
);
