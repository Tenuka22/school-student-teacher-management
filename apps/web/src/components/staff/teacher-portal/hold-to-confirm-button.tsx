"use client";

import { useRef, useState } from "react";

const DEFAULT_HOLD_MS = 850;

interface HoldToConfirmButtonProps {
  onConfirm: () => void;
  label: string;
  holdingLabel?: string;
  durationMs?: number;
  disabled?: boolean;
  className?: string;
  tone?: "primary" | "destructive";
}

/**
 * A button that only fires after being held down for `durationMs`, with a
 * fill sweeping left to right as the visible countdown.
 *
 * This exists for exactly one reason: an approval that hands a colleague's
 * equipment to somebody else, arriving as a live push notification the
 * moment it's raised, is the one action on this dashboard that must never
 * fire from a stray tap or an accidental double-click on a notification the
 * teacher was still reading. A confirmation dialog would do the same job with
 * an extra screen; holding the button *is* the confirmation, on the one
 * control it protects.
 *
 * Releasing before `durationMs` cancels — the fill resets instantly (`duration-0`)
 * rather than draining backward, because a release is an abort, not a second
 * countdown.
 */
export const HoldToConfirmButton = ({
  onConfirm,
  label,
  holdingLabel,
  durationMs = DEFAULT_HOLD_MS,
  disabled,
  className = "",
  tone = "primary",
}: HoldToConfirmButtonProps) => {
  const [isHolding, setIsHolding] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = () => {
    setIsHolding(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const start = () => {
    if (disabled) {
      return;
    }
    setIsHolding(true);
    timeoutRef.current = setTimeout(() => {
      setIsHolding(false);
      onConfirm();
    }, durationMs);
  };

  const fillTone =
    tone === "destructive" ? "bg-destructive/25" : "bg-primary-foreground/25";

  return (
    <button
      className={`relative isolate overflow-hidden rounded-none border px-4 py-2 text-sm font-semibold transition-colors select-none ${
        tone === "destructive"
          ? "border-destructive/40 text-destructive"
          : "border-primary bg-primary text-primary-foreground"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""} ${className}`}
      disabled={disabled}
      onPointerCancel={cancel}
      onPointerDown={start}
      onPointerLeave={cancel}
      onPointerUp={cancel}
      type="button"
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 -z-10 ${fillTone}`}
        style={{
          width: "100%",
          transform: isHolding ? "scaleX(1)" : "scaleX(0)",
          transformOrigin: "left",
          transitionProperty: "transform",
          transitionTimingFunction: "linear",
          transitionDuration: isHolding ? `${durationMs}ms` : "0ms",
        }}
      />
      <span className="relative">
        {isHolding ? (holdingLabel ?? "Keep holding…") : label}
      </span>
    </button>
  );
};
