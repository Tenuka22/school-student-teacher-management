import type { ReactNode } from "react";

/**
 * Split-panel shell for the sign-up and sign-in pages: brand panel (crest,
 * motto) on the left, cream form panel on the right. Visual-only — each page
 * owns its own form state and copy.
 *
 * The design-critical rules live in a scoped stylesheet rendered with the
 * component (and inline styles for one-off values), so the layout cannot
 * break if Tailwind's on-demand pipeline lags behind newly added files.
 *
 * The stylesheet is a constant string, so it serialises identically on the
 * server and on the client's first render and cannot cause a hydration
 * mismatch.
 */

const GREEN = "#013405";
const CREAM = "#FFF8E7";
const GOLD = "#FFB203";

const FONT_MANROPE = "Manrope, sans-serif";
const FONT_SERIF = "'Cormorant Garamond', serif";

/**
 * Placeholder and muted text sit on `#fffdf6` / `#FFF8E7`.
 * `rgba(1,52,5,0.7)` composites to `#4d714d`, which is 5.4:1 against the
 * lighter of the two grounds — comfortably over the 4.5:1 floor. The 0.38
 * alpha this replaced composited to roughly 1.9:1 and was unreadable.
 */
const MUTED_INK = "rgba(1,52,5,0.7)";

const CRITICAL_CSS = `
  .auth-split { display: flex; min-height: 100dvh; background: ${CREAM}; color: ${GREEN}; }
  .auth-split-brand { position: relative; display: none; min-width: 0; flex: 1.15 1 420px; flex-direction: column; justify-content: space-between; overflow: hidden; background: ${GREEN}; color: ${CREAM}; padding: clamp(28px, 4vh, 52px) clamp(32px, 4vw, 58px); }
  @media (min-width: 64rem) { .auth-split-brand { display: flex; } }
  /* The form is the panel that must stay comfortable: it gets a generous
     flex basis (not a 0 basis) so the brand panel can never squeeze it,
     and a max-width so wide screens keep the ~40/60 split. The inner block
     uses margin:auto so it centers vertically when it fits and scrolls
     cleanly from the top when it doesn't. */
  .auth-split-form { display: flex; min-width: 0; flex: 1 1 520px; max-width: 760px; justify-content: center; overflow-y: auto; background: ${CREAM}; color: ${GREEN}; padding: clamp(24px, 4vh, 56px) clamp(20px, 4vw, 52px); }
  .auth-split-form-inner { width: 100%; max-width: 460px; margin: auto; }
  .auth-brand-shade { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(160deg, rgba(1,52,5,0.84) 0%, rgba(1,52,5,0.91) 55%, rgba(6,43,10,0.97) 100%); }
  .auth-crest-bg { position: absolute; right: -110px; bottom: -150px; height: min(520px, 72vh); width: auto; opacity: 0.07; pointer-events: none; }
  .auth-input { width: 100%; border: 1px solid rgba(1,52,5,0.28); background: #fffdf6; padding: 13px 15px; font-size: 14px; font-family: inherit; color: ${GREEN}; outline: none; border-radius: 0; }
  .auth-input::placeholder { color: ${MUTED_INK}; opacity: 1; }
  .auth-input:focus { border-color: ${GREEN}; background: #ffffff; box-shadow: 0 0 0 2px ${GREEN}; }
  .auth-input:disabled { background: rgba(1,52,5,0.05); }
  select.auth-input { cursor: pointer; }
  .auth-label { display: block; margin-bottom: 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.16em; color: ${GREEN}; }
  .auth-field { display: block; margin-bottom: clamp(12px, 2vh, 18px); }
  .auth-field-last { margin-bottom: clamp(16px, 2.6vh, 26px); }
  .auth-error { margin: 6px 0 0; font-size: 12px; font-weight: 600; line-height: 1.5; color: #8f1616; }
  .auth-desc { margin: 6px 0 0; font-size: 12.5px; color: ${MUTED_INK}; }
  .auth-desc strong { color: ${GREEN}; }
  .auth-toggle { position: absolute; top: 50%; right: 13px; transform: translateY(-50%); border: none; border-bottom: 1px solid rgba(1,52,5,0.35); background: transparent; padding: 0 0 1px; font-size: 12px; font-weight: 800; letter-spacing: 0.1em; color: ${MUTED_INK}; cursor: pointer; }
  .auth-eyebrow { margin: 0 0 6px; font-size: 11px; font-weight: 800; letter-spacing: 0.2em; color: ${MUTED_INK}; }
  .auth-h1 { margin: 0 0 8px; font-size: clamp(28px, 4.4vh, 40px); line-height: 1.05; font-weight: 600; font-family: ${FONT_SERIF}; }
  .auth-intro { margin: 0 0 clamp(18px, 3vh, 28px); font-size: 13.5px; line-height: 1.55; color: rgba(1,52,5,0.72); }
  .auth-note { margin: 0 0 clamp(12px, 2vh, 20px); font-size: 12.5px; line-height: 1.5; color: ${MUTED_INK}; }
  .auth-submit { display: block; width: 100%; border: none; background: ${GREEN}; padding: 15px 0; text-align: center; font-size: 13.5px; font-weight: 800; letter-spacing: 0.08em; color: ${GOLD}; transition: background-color 150ms ease; cursor: pointer; }
  .auth-submit:hover { background: #062B0A; }
  .auth-submit:disabled { opacity: 0.6; cursor: not-allowed; }
  .auth-submit:focus-visible, .auth-toggle:focus-visible { outline: 2px solid ${GREEN}; outline-offset: 2px; }
  .auth-footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 14px; margin: 0; padding-top: clamp(12px, 2vh, 20px); border-top: 1px solid rgba(1,52,5,0.12); font-size: 12.5px; color: rgba(1,52,5,0.72); }
  .auth-footer a, .auth-card-foot a { font-weight: 700; color: ${GREEN}; text-decoration: underline; text-underline-offset: 2px; }
  .auth-footer a:hover, .auth-card-foot a:hover { color: #8f1616; }
  .auth-card { border: 1px solid rgba(1,52,5,0.14); background: #ffffff; padding: clamp(24px, 4vh, 36px); text-align: center; box-shadow: 0 1px 2px rgba(1,52,5,0.06); }
  .auth-username { margin: 0 auto; width: fit-content; max-width: 100%; overflow-wrap: anywhere; border: 1px solid ${GOLD}; background: rgba(255,178,3,0.12); padding: 14px 28px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 22px; font-weight: 700; letter-spacing: 0.025em; color: ${GREEN}; }
  .auth-card-foot { margin: 16px 0 0; font-size: 12.5px; color: ${MUTED_INK}; text-align: center; }
  /* A visible focus ring on every interactive element, including the links,
     which the browser default would otherwise only mark with a hairline. */
  .auth-card-foot a:focus-visible, .auth-footer a:focus-visible { outline: 2px solid ${GREEN}; outline-offset: 2px; }
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
      {/* No campus photograph is bundled: the shade below is already opaque
          enough to carry the panel on its own, so a missing file only cost a
          404 on the sign-in and sign-up pages. Add one at
          /uploads/campus-photo.jpg and restore this layer when it exists. */}
      <div className="auth-brand-shade" />
      <img
        src="/uploads/college-crest.png"
        alt=""
        aria-hidden="true"
        className="auth-crest-bg"
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <img
          src="/uploads/college-crest.png"
          alt="St. Aloysius' College crest"
          height={56}
          width={56}
          style={{
            display: "block",
            width: "auto",
            height: "clamp(44px, 6.4vh, 58px)",
          }}
        />
        <div style={{ lineHeight: 1.15 }}>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: "0.06em",
            }}
          >
            ST. ALOYSIUS&rsquo; COLLEGE
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              letterSpacing: "0.28em",
              color: GOLD,
            }}
          >
            GALLE &middot; SRI LANKA
          </p>
        </div>
      </div>

      {/* The page's own heading lives in the form panel, so this is brand
          texture rather than a second h1. It is a paragraph, not a heading,
          for exactly that reason. */}
      <div style={{ position: "relative", maxWidth: "28ch" }}>
        <p
          style={{
            margin: "0 0 clamp(12px, 2vh, 20px)",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.44em",
            color: GOLD,
          }}
        >
          CERTA VIRILITER
        </p>
        <p
          style={{
            margin: 0,
            fontSize: "clamp(30px, 4.6vh, 52px)",
            lineHeight: 1.06,
            fontWeight: 600,
            fontFamily: FONT_SERIF,
          }}
        >
          {title}
        </p>
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
            fontSize: "clamp(15px, 2vh, 20px)",
            lineHeight: 1.5,
            color: "rgba(255,248,231,0.85)",
            fontStyle: "italic",
            fontFamily: FONT_SERIF,
          }}
        >
          {subtitle}
        </p>
      </div>

      <p
        style={{
          position: "relative",
          margin: 0,
          fontSize: 12,
          letterSpacing: "0.16em",
          color: "rgba(255,248,231,0.7)",
        }}
      >
        {eyebrow}
      </p>
    </div>

    {/* Form panel */}
    <div className="auth-split-form">
      <div className="auth-split-form-inner">{children}</div>
    </div>
  </div>
);
