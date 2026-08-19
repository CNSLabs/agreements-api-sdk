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
export function InputFinalityStatus({
  progress,
  pendingWithoutProgress = false,
}: {
  progress: InputFinalityProgress;
  /**
   * True when a PENDING input exists but this session is not tracking it —
   * the page was reloaded after submitting, so there is no confirmation count
   * to show. Renders an indeterminate waiting notice instead of nothing.
   */
  pendingWithoutProgress?: boolean;
}) {
  if (progress.phase === "idle" && !pendingWithoutProgress) return null;

  if (progress.phase === "idle") {
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
        <span style={{ fontSize: 14, fontWeight: 500 }}>Awaiting on-chain confirmations</span>
        <span style={{ fontSize: 12, opacity: 0.75 }}>
          A submitted input is waiting to become final. The agreement state updates once it is.
        </span>
      </div>
    );
  }

  const { phase, confirmations, requiredConfirmations } = progress;
  const determinate = phase === "confirming" && requiredConfirmations > 0;
  const percent = determinate
    ? Math.min(100, Math.round((confirmations / requiredConfirmations) * 100))
    : 100;

  const heading =
    phase === "settled"
      ? "Applied to the agreement"
      : phase === "stalled"
        ? "This is taking longer than expected"
        : determinate
          ? `Confirming on chain — ${Math.min(confirmations, requiredConfirmations)} of ${requiredConfirmations}`
          : "Finalizing";

  // Stalled guidance states only what the stall-time chain reconciliation
  // established. Absence from Activity is NOT proof the transaction died —
  // the projection can lag — and an unmined transaction can still land until
  // its permit deadline, so no branch claims a fresh submission is "safe"
  // unless the chain itself closed this one.
  const stalledDetail =
    progress.stalledReason === "onchain-lagging"
      ? "The transaction is confirmed on-chain; the platform has not reflected it yet. No action needed — do not submit again, or the input may be applied twice."
      : progress.stalledReason === "reverted"
        ? "The transaction failed on-chain, so this submission is closed. Review the agreement state and sign a new submission to try again."
        : progress.stalledReason === "unmined"
          ? "The transaction has not been mined yet. It can still land until its permit deadline (about an hour from submission), so wait before signing a new submission — both could apply."
          : "The submission has not settled within the normal window and its on-chain status could not be checked. Check the Activity tab, and avoid re-submitting until its outcome is known.";

  const detail =
    phase === "settled"
      ? "The state now reflects this input."
      : phase === "stalled"
        ? stalledDetail
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
            background:
              phase === "stalled"
                ? "var(--warning-500, #f59e0b)"
                : "var(--brand-600, #4f46e5)",
            transition: "width 400ms ease",
            opacity: phase === "finalizing" ? 0.6 : 1,
          }}
        />
      </div>
      <span style={{ fontSize: 12, opacity: 0.75 }}>{detail}</span>
    </div>
  );
}
