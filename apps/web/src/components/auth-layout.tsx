import type { ReactNode } from "react";

import { CollegeCrest } from "@/components/ui-patterns/college-crest";

/**
 * Split-panel shell for the sign-up pages, mirroring the sign-in page:
 * brand panel (crest, motto) on the left, cream form panel
 * on the right. Visual-only — each page owns its own form state and copy.
 *
 * The design-critical rules live in a scoped stylesheet rendered with the
 * component (and inline styles for one-off values), so the layout cannot
 * break if Tailwind's on-demand pipeline lags behind newly added files.
 */

// Brand colours come from the design tokens in packages/ui globals.css.
const GREEN = "var(--primary)";
const CREAM = "var(--primary-foreground)";
const GOLD = "var(--accent)";

// The token stacks, so Sinhala/Tamil text still finds a font with glyphs.
const FONT_MANROPE = "var(--font-sans)";
const FONT_SERIF = "var(--font-heading)";

const CRITICAL_CSS = `
  .auth-split { display: flex; height: 100dvh; overflow: hidden; background: ${GREEN}; color: ${CREAM}; }
  .auth-split-brand { position: relative; display: none; min-width: 0; flex: 1.15 1 420px; flex-direction: column; justify-content: space-between; overflow: hidden; background: ${GREEN}; padding: clamp(28px, 4vh, 52px) clamp(32px, 4vw, 58px); }
  @media (min-width: 48rem) { .auth-split-brand { display: flex; } }
  /* The form is the panel that must stay comfortable: it gets a generous
     flex basis (not a 0 basis) so the brand panel can never squeeze it,
     and a max-width so wide screens keep the ~40/60 split. The inner block
     uses margin:auto so it centers vertically when it fits and scrolls
     cleanly from the top when it doesn't. */
  .auth-split-form { display: flex; min-width: 0; flex: 1 1 520px; max-width: 760px; justify-content: center; overflow-y: auto; background: ${CREAM}; color: ${GREEN}; padding: clamp(24px, 4vh, 56px) clamp(20px, 4vw, 52px); }
  .auth-split-form-inner { width: 100%; max-width: 460px; margin: auto; }
  .auth-brand-shade { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(160deg, rgba(1,52,5,0.84) 0%, rgba(1,52,5,0.91) 55%, rgba(6,43,10,0.97) 100%); }
  .auth-orb { position: absolute; top: -150px; right: -190px; width: 520px; height: 520px; border-radius: 9999px; pointer-events: none; background: radial-gradient(circle, rgba(255,178,3,0.22), transparent 65%); }
  .auth-crest-bg { position: absolute; right: -110px; bottom: -150px; height: min(520px, 72vh); width: auto; opacity: 0.07; pointer-events: none; }
  @media (prefers-reduced-motion: no-preference) {
    .auth-orb { animation: om-pulse 9s ease-in-out infinite; }
    .auth-crest-bg { animation: om-drift 16s ease-in-out infinite; }
  }
  .auth-kicker { margin: 0 0 12px; font-size: var(--text-eyebrow); line-height: 1.4; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--destructive); }
  .auth-h1 { margin: 0 0 10px; font-size: var(--text-page-title); line-height: 1.1; font-weight: 600; letter-spacing: -0.006em; font-variant-numeric: lining-nums; text-wrap: balance; font-family: ${FONT_SERIF}; }
  .auth-intro { margin: 0 0 clamp(18px, 3vh, 28px); font-size: var(--text-body); line-height: 1.6; color: var(--muted-foreground); text-wrap: pretty; }
  .auth-submit { display: block; width: 100%; border: none; background: ${GREEN}; padding: 14px 0; text-align: center; font-size: var(--text-body); line-height: 1.4; font-weight: 700; letter-spacing: 0.01em; color: ${GOLD}; transition: background-color 150ms ease; cursor: pointer; }
  .auth-submit:hover { background: var(--surface-deep); }
  .auth-submit:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  .auth-submit:disabled { opacity: 0.6; cursor: not-allowed; }
  .auth-card-foot a { font-weight: 700; color: ${GREEN}; text-decoration: underline; text-underline-offset: 2px; }
  .auth-card-foot a:hover { color: var(--destructive); }
  .auth-card { border: 1px solid var(--border); background: var(--card); padding: clamp(24px, 4vh, 36px); text-align: center; }
  .auth-card .auth-kicker { text-align: center; }
  .auth-username { margin: 24px auto 0; width: fit-content; border: 1px solid rgba(255,178,3,0.6); background: rgba(255,178,3,0.12); padding: 16px 32px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 24px; font-weight: 700; letter-spacing: 0.025em; color: ${GREEN}; overflow-wrap: anywhere; }
  .auth-card-foot { margin: 16px 0 0; font-size: var(--text-sm); line-height: 1.5; color: var(--muted-foreground); text-align: center; }
`;

export const AuthSplitLayout = ({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) => (
  <div className="auth-split" style={{ fontFamily: FONT_MANROPE }}>
    <style>{CRITICAL_CSS}</style>

    {/* Brand panel */}
    <div className="auth-split-brand">
      <div className="auth-brand-shade" />
      <div className="auth-orb" />
      <CollegeCrest size="large" className="auth-crest-bg" />

      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <CollegeCrest
          alt="St. Aloysius' College crest"
          className="block h-[clamp(44px,6.4vh,58px)] w-auto"
        />
        <div style={{ lineHeight: 1.15 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "-0.005em",
              whiteSpace: "nowrap",
            }}
          >
            St. Aloysius&rsquo; College
          </div>
          <div
            style={{
              marginTop: 3,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              color: GOLD,
            }}
          >
            Galle &bull; Sri Lanka
          </div>
        </div>
      </div>

      <div style={{ position: "relative", maxWidth: "26ch" }}>
        <div
          style={{
            marginBottom: "clamp(12px, 2vh, 20px)",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.24em",
            color: GOLD,
          }}
        >
          CERTA VIRILITER
        </div>
        <div
          style={{
            fontSize: "clamp(2.25rem, 1.4rem + 2.2vw, 3.5rem)",
            lineHeight: 1.04,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            fontVariantNumeric: "lining-nums",
            fontFamily: FONT_SERIF,
          }}
        >
          {title}
        </div>
        <div
          style={{
            margin: "clamp(16px, 2.6vh, 26px) 0",
            width: 52,
            height: 2,
            background: GOLD,
          }}
        />
        <p
          style={{
            margin: 0,
            fontSize: "clamp(1.125rem, 1rem + 0.4vw, 1.3125rem)",
            lineHeight: 1.5,
            color: "rgba(255,248,231,0.82)",
            fontStyle: "italic",
            fontFamily: FONT_SERIF,
          }}
        >
          {subtitle}
        </p>
      </div>

      <div
        style={{
          position: "relative",
          fontSize: 14,
          color: "rgba(255,248,231,0.75)",
        }}
      >
        {eyebrow}
      </div>
    </div>

    {/* Form panel */}
    <div className="auth-split-form">
      <div className="auth-split-form-inner">{children}</div>
    </div>
  </div>
);
