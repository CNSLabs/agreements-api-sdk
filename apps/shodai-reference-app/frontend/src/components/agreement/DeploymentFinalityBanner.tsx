import * as React from "react";
import type { DeploymentFinalityProgress } from "@/hooks/agreement/useDeploymentFinalityProgress";

/**
 * Confirmation progress for a freshly deployed agreement, shown on the
 * agreement page while the deploy transaction sits inside the finality
 * window. Purely informational — nothing is disabled during the window,
 * because an input's own finality wait is strictly longer than the
 * deployment's. Disappears once the boundary is passed.
 */
export function DeploymentFinalityBanner({ progress }: { progress: DeploymentFinalityProgress }) {
  if (!progress.tracking) return null;

  const { confirmations, requiredConfirmations } = progress;
  const percent = Math.min(100, Math.round((confirmations / requiredConfirmations) * 100));

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
        width: "100%",
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 500 }}>
        {`Deployment confirming on chain — ${Math.min(confirmations, requiredConfirmations)} of ${requiredConfirmations}`}
      </span>
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
          }}
        />
      </div>
      <span style={{ fontSize: 12, opacity: 0.75 }}>
        The agreement is live and accepts inputs. Finality makes the deployment permanent.
      </span>
    </div>
  );
}
