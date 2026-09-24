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
    <div className="auth-card">
      <p className="auth-kicker">WELCOME ABOARD</p>
      <h1 className="auth-h1">{heading}</h1>
      <p className="auth-intro" style={{ textAlign: "center" }}>
        {message}
      </p>
      <div className="auth-username">{username || "—"}</div>
      <button
        type="button"
        onClick={() => {
          window.location.assign("/login?switch=1");
        }}
        className="auth-submit"
        style={{ marginTop: 28 }}
      >
        GO TO SIGN IN
      </button>
      <p className="auth-card-foot">
        {crossLinkText}{" "}
        <Link search={{ switch: 1 }} to={crossLinkTo}>
          {crossLinkLabel}
        </Link>
      </p>
    </div>
  </AuthSplitLayout>
);
