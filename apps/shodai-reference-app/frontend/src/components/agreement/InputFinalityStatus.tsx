import * as React from "react";
import type { InputFinalityProgress } from "@/hooks/agreement/useInputFinalityProgress";

/**
 * Feedback for a submitted input while it waits to become part of the
 * agreement's state.
 *
 * Submitting no longer changes the state immediately: the projection worker
 * only applies an input once it is past the chain's finality boundary, so the
 * agreement looks untouched for the length of that window. This makes the wait
 * legible — a determinate count while confirmations accumulate, then an
 * indeterminate phase for the short gap between the boundary and the
 * projection landing.
 */
export function InputFinalityStatus({ progress }: { progress: InputFinalityProgress }) {
  if (progress.phase === "idle") return null;

  const { phase, confirmations, requiredConfirmations } = progress;
  const determinate = phase === "confirming" && requiredConfirmations > 0;
  const percent = determinate
    ? Math.min(100, Math.round((confirmations / requiredConfirmations) * 100))
    : 100;

  const heading =
    phase === "settled"
      ? "Applied to the agreement"
      : determinate
        ? `Confirming on chain — ${Math.min(confirmations, requiredConfirmations)} of ${requiredConfirmations}`
        : "Finalizing";

  const detail =
    phase === "settled"
      ? "The state now reflects this input."
      : determinate
        ? "Your submission is in a block. The agreement state updates once it is final."
        : "Confirmations complete. Applying the state change.";

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "12px 14px",
        borderRadius: 8,
        border: "1px solid var(--neutral-border, #e5e7eb)",
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 500 }}>{heading}</span>
      <div
        style={{
          height: 6,
          borderRadius: 999,
          overflow: "hidden",
          background: "var(--neutral-100, #f3f4f6)",
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: "100%",
            borderRadius: 999,
            background: "var(--brand-600, #4f46e5)",
            transition: "width 400ms ease",
            opacity: phase === "finalizing" ? 0.6 : 1,
          }}
        />
      </div>
      <span style={{ fontSize: 12, opacity: 0.75 }}>{detail}</span>
    </div>
  );
}
