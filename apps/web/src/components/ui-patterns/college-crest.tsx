const SOURCES = {
  /** Headers and the sidebar (displayed at 38–58px). */
  small: "/uploads/college-crest-128.webp",
  /** Decorative background watermarks (displayed up to ~620px). */
  large: "/uploads/college-crest-512.webp",
} as const;

interface CollegeCrestProps {
  className?: string;
  /** Omit (or pass "") for a purely decorative watermark. */
  alt?: string;
  size?: keyof typeof SOURCES;
}

/**
 * The College crest as WebP (8 KB / 44 KB) with the original 268 KB PNG as
 * the fallback. Intrinsic width/height reserve its square box so the layout
 * doesn't shift while it loads; CSS still sets the displayed size.
 */
export const CollegeCrest = ({
  className,
  alt = "",
  size = "small",
}: CollegeCrestProps) => (
  <picture className="contents">
    <source srcSet={SOURCES[size]} type="image/webp" />
    <img
      src="/uploads/college-crest.png"
      width={512}
      height={512}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      decoding="async"
      className={className}
    />
  </picture>
);
