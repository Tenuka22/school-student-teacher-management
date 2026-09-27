/*
 * `<output>` carries an implicit `role="status"` and would satisfy
 * `prefer-tag-over-role` without a suppression, but it means "the result of a
 * calculation" and this is a page shell that happens to announce itself. The
 * role is spelled out instead, on the region that is actually `aria-busy`, and
 * the rule is switched off for this file only rather than for the codebase.
 */
/* eslint-disable jsx-a11y/prefer-tag-over-role -- a route pending region is not a form output */
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";

/**
 * What a route looks like while the router is still fetching it.
 *
 * This used to be a `<Loader2 className="animate-spin">` centred in the
 * viewport, and it was the one spinner in the product — a defect on its own,
 * and a worse one here specifically: it is a route-level `pendingComponent`, so
 * it replaces the *whole* page. A lone spinner in a full-height cream void is
 * the emptiest thing the app can draw, and it gives the reader nothing to hold
 * their place with: the moment the real page arrives the entire layout changes
 * shape under them.
 *
 * So it now mirrors the shell it is standing in for. `/login` and `/signup`
 * are a full-bleed split screen — the deep-green brand panel on the left, the
 * cream form panel on the right — and the skeleton below reserves the same two
 * panels, the same column split and the same block heights, in the same
 * quiet-on-quiet tones each side uses for real content. Nothing jumps when the
 * form lands, and a reader who has seen this screen once already knows what is
 * coming.
 *
 * The placeholders are the *shape* of the page, not a description of it: bars
 * where text goes, blocks where fields go, and no invented content. A skeleton
 * that fills itself with plausible words is worse than an empty one, because
 * the reader starts reading it.
 *
 * Accessibility, which is why this is a `role="status"` region and not just a
 * picture:
 *
 * - `aria-busy="true"` marks the region as one whose contents are still being
 *   replaced, so assistive tech does not read the placeholder bars as content.
 *   It sits on the root, and the two panels are `aria-hidden` besides.
 * - `role="status"` is an implicit polite live region, and the visually hidden
 *   sentence inside it is what actually gets announced — the bars carry no
 *   text, so without it this would be a silent wait.
 * - The `Skeleton` pulse is killed by the global `prefers-reduced-motion`
 *   guard in `packages/ui/src/styles/globals.css`; a motionless grey block
 *   beside a live-region sentence is the correct reduced-motion reading of a
 *   loading state, not a missing one.
 */

/**
 * One line of text, standing in.
 *
 * `width` and `height` are inline styles rather than Tailwind widths on
 * purpose: the values differ per bar, and a value interpolated into a
 * `w-[…]` class name is invisible to the scanner, so the class would be dropped
 * from the build and only the arbitrary value would remain. The tone stays a
 * class, because that is fixed per call site and does benefit from the
 * stylesheet.
 */
const Bar = ({
  className = "bg-muted",
  height = "0.85em",
  width = "100%",
}: {
  className?: string;
  height?: string;
  width?: string;
}) => <Skeleton className={className} style={{ height, width }} />;

export interface LoaderProps {
  /**
   * The noun being loaded, in the app's own words — "the teacher roster", "the
   * timetable for 7B". Left out, the announcement is the bare "Loading…",
   * which is right for a route whose own heading is still on its way.
   */
  label?: string;
}

const Loader = ({ label }: LoaderProps = {}) => (
  <div
    aria-busy="true"
    className="bg-primary text-primary-foreground flex h-dvh max-h-dvh overflow-hidden"
    role="status"
  >
    <span className="sr-only">{label ? `Loading ${label}…` : "Loading…"}</span>

    {/*
     * Brand panel. Every tone here is a tone the finished panel already uses:
     * `--sidebar-accent` on green for the wordmark, amber for the two rules
     * that are amber in the real thing.
     */}
    <div
      aria-hidden="true"
      className="bg-primary relative hidden min-w-0 flex-[1.15_1_420px] flex-col justify-between overflow-hidden p-[clamp(28px,4vh,52px)_clamp(32px,4vw,58px)] md:flex"
    >
      <div className="flex items-center gap-3.5">
        <Skeleton className="bg-sidebar-accent h-[clamp(44px,6.4vh,58px)] w-[clamp(44px,6.4vh,58px)]" />
        <div className="leading-[1.15]">
          <Bar className="bg-sidebar-accent" width="15rem" />
          <Bar className="bg-accent/45" height="0.7em" width="9rem" />
        </div>
      </div>

      <div className="max-w-[26ch]">
        <Bar className="bg-accent/50" width="11rem" />
        <Skeleton className="bg-muted/25 mt-[clamp(12px,2vh,20px)] h-[clamp(34px,5.2vh,56px)] w-full" />
        <Skeleton className="bg-muted/25 mt-2 h-[clamp(34px,5.2vh,56px)] w-[70%]" />
        <div className="bg-accent my-[clamp(16px,2.6vh,26px)] h-0.5 w-13" />
        <Skeleton className="bg-muted/25 h-[clamp(16px,2.2vh,21px)] w-full" />
        <Skeleton className="bg-muted/25 mt-2 h-[clamp(16px,2.2vh,21px)] w-[86%]" />
        <Skeleton className="bg-muted/25 mt-2 h-[clamp(16px,2.2vh,21px)] w-[64%]" />
      </div>

      <Bar className="bg-sidebar-accent" width="18rem" />
    </div>

    {/* Form panel: eyebrow, heading, two notes, two fields, button, footer. */}
    <div
      aria-hidden="true"
      className="bg-primary-foreground text-primary flex min-w-0 flex-1 items-center justify-center overflow-y-auto p-[clamp(24px,4vh,56px)_clamp(20px,4vw,52px)]"
    >
      <div className="w-full max-w-[420px]">
        <Bar width="6rem" />
        <Skeleton className="mt-3 h-[clamp(30px,4.6vh,44px)] w-[62%]" />
        <Skeleton className="mt-4 h-[13.5px] w-full" />
        <Skeleton className="mt-2 h-[13.5px] w-[78%]" />
        <Skeleton className="mt-[clamp(12px,2vh,20px)] h-[12.5px] w-full" />
        <Skeleton className="mt-2 h-[12.5px] w-[92%]" />
        <Skeleton className="mt-2 h-[12.5px] w-[84%]" />
        <Skeleton className="mt-2 h-[12.5px] w-[56%]" />

        <div className="mt-[clamp(18px,3vh,30px)]">
          <Bar width="7rem" />
          <Skeleton className="mt-2 h-[45px] w-full" />
        </div>
        <div className="mt-[clamp(16px,2.6vh,26px)]">
          <Bar width="7rem" />
          <Skeleton className="mt-2 h-[45px] w-full" />
        </div>

        <Skeleton className="mt-[clamp(16px,2.6vh,26px)] h-[48px] w-full" />

        <div className="mt-[clamp(16px,2.8vh,28px)]">
          <Skeleton className="h-[52px] w-full" />
        </div>

        <div className="border-primary/25 mt-[clamp(16px,2.8vh,28px)] flex flex-wrap justify-between gap-3.5 border-t pt-[clamp(12px,2vh,20px)]">
          <Bar width="8rem" />
          <Bar width="11rem" />
        </div>
      </div>
    </div>
  </div>
);

export default Loader;
