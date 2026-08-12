import * as React from "react";
import { usePublicClient } from "wagmi";

/**
 * Progress for a submitted input on its way to a state change.
 *
 * An input is PENDING from submission until the projection worker observes it
 * at or below the chain's finality boundary, which is `requiredConfirmations`
 * blocks behind the head. Without a signal for that window the UI looks
 * unchanged for minutes after a user acts, so this reports two distinct
 * phases:
 *
 * - `confirming` — the transaction is in a block and confirmations are
 *   accumulating. Determinate: `confirmations` of `requiredConfirmations`.
 * - `finalizing` — the boundary is reached, but the worker still has to run a
 *   poll cycle and commit. Indeterminate and usually brief; reporting it as
 *   "confirmed" would promise a state change that has not landed yet.
 *
 * Reaching the boundary is not the same as the projection having happened,
 * which is why the caller keeps refreshing until the input is settled rather
 * than trusting the count alone.
 */
export type InputFinalityPhase = "idle" | "confirming" | "finalizing" | "settled";

export interface TrackedInput {
  inputId: string;
  txHash?: string;
  blockNumber?: number;
}

export interface InputFinalityProgress {
  phase: InputFinalityPhase;
  confirmations: number;
  requiredConfirmations: number;
  trackedInputId?: string;
  track: (input: TrackedInput) => void;
  clear: () => void;
}

const HEAD_POLL_INTERVAL_MS = 4_000;
// A submission that has not settled long after its confirmations arrived is a
// problem to surface, not a spinner to leave running forever.
const MAX_TRACKING_MS = 15 * 60_000;

export function useInputFinalityProgress(options: {
  requiredConfirmations?: number;
  /** True once the tracked input is observed as settled by the API. */
  isSettled: (input: TrackedInput) => boolean;
  /** Re-read state and inputs; called while waiting for the projection. */
  refresh: () => Promise<void>;
}): InputFinalityProgress {
  const { requiredConfirmations, isSettled, refresh } = options;
  const publicClient = usePublicClient();

  const [tracked, setTracked] = React.useState<TrackedInput | null>(null);
  const [confirmations, setConfirmations] = React.useState(0);
  const [phase, setPhase] = React.useState<InputFinalityPhase>("idle");
  const startedAtRef = React.useRef<number>(0);

  const required = requiredConfirmations && requiredConfirmations > 0 ? requiredConfirmations : 0;

  const track = React.useCallback((input: TrackedInput) => {
    startedAtRef.current = Date.now();
    setConfirmations(0);
    setPhase("confirming");
    setTracked(input);
  }, []);

  const clear = React.useCallback(() => {
    setTracked(null);
    setConfirmations(0);
    setPhase("idle");
  }, []);

  // The API is the authority on settlement, not the confirmation count: the
  // worker commits a cycle or so after the boundary.
  React.useEffect(() => {
    if (!tracked) return;
    if (isSettled(tracked)) {
      setPhase("settled");
      setTracked(null);
    }
  }, [tracked, isSettled]);

  React.useEffect(() => {
    if (!tracked || phase === "idle" || phase === "settled") return undefined;

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (Date.now() - startedAtRef.current > MAX_TRACKING_MS) {
        setTracked(null);
        setPhase("idle");
        return;
      }
      try {
        if (publicClient && typeof tracked.blockNumber === "number") {
          const head = Number(await publicClient.getBlockNumber());
          const seen = Math.max(0, head - tracked.blockNumber + 1);
          if (!cancelled) {
            setConfirmations(seen);
            setPhase(required > 0 && seen < required ? "confirming" : "finalizing");
          }
        } else if (!cancelled) {
          // No block number yet, or no chain access: the wait is real but its
          // length is unknowable from here.
          setPhase("finalizing");
        }
      } catch {
        // A failed head read is not worth surfacing; the next tick retries and
        // the API refresh below is what actually resolves the wait.
      }
      if (!cancelled) {
        await refresh().catch(() => undefined);
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), HEAD_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [tracked, phase, publicClient, required, refresh]);

  return {
    phase,
    confirmations,
    requiredConfirmations: required,
    trackedInputId: tracked?.inputId,
    track,
    clear,
  };
}
