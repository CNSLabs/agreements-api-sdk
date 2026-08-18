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
 * Reaching the boundary is not the same as the projection having happened, so
 * settlement is decided by the input record turning FINALIZED — announced by
 * the `agreement.transitioned` webhook — rather than by arithmetic on block
 * numbers. The head is read here only to drive the counter.
 */
export type InputFinalityPhase =
  | "idle"
  | "confirming"
  | "finalizing"
  | "settled"
  | "stalled";

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
// problem to surface, not a spinner to leave running forever: past this
// window the tracker stops polling and reports `stalled` — an explicit
// abnormal result — instead of quietly returning to idle as if nothing had
// been submitted. Late settlement still resolves it: the webhook-driven
// isSettled check keeps watching the tracked input.
const MAX_TRACKING_MS = 15 * 60_000;

export function useInputFinalityProgress(options: {
  requiredConfirmations?: number;
  /** True once the tracked input is observed as settled by the API. */
  isSettled: (input: TrackedInput) => boolean;
}): InputFinalityProgress {
  const { requiredConfirmations, isSettled } = options;
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
    if (!tracked || phase === "idle" || phase === "settled" || phase === "stalled")
      return undefined;

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (Date.now() - startedAtRef.current > MAX_TRACKING_MS) {
        // Keep the tracked input: the stalled notice references it, and a
        // late webhook can still settle it through the isSettled effect.
        setPhase("stalled");
        return;
      }
      try {
        // A PENDING submission response carries no block number — the API
        // answers before caring about confirmations — so learn it from the
        // transaction receipt. The API waited for inclusion before
        // responding, so the receipt is normally available on the first ask.
        let blockNumber = tracked.blockNumber;
        if (typeof blockNumber !== "number" && publicClient && tracked.txHash) {
          try {
            const receipt = await publicClient.getTransactionReceipt({
              hash: tracked.txHash as `0x${string}`,
            });
            blockNumber = Number(receipt.blockNumber);
            if (!cancelled) {
              setTracked((current) =>
                current && current.txHash === tracked.txHash
                  ? { ...current, blockNumber }
                  : current,
              );
            }
          } catch {
            // Not indexed yet; keep counting as unknown and retry next tick.
          }
        }
        if (cancelled) return;
        if (publicClient && typeof blockNumber === "number") {
          const head = Number(await publicClient.getBlockNumber());
          // Counted as blocks ON TOP of the inclusion block, not the
          // conventional inclusion-counts-as-one: the worker finalizes when
          // head - B >= requiredConfirmations, so this definition makes
          // "N of N" coincide exactly with worker eligibility instead of
          // reading done one block early.
          const seen = Math.max(0, head - blockNumber);
          if (!cancelled) {
            setConfirmations(seen);
            setPhase(required > 0 && seen < required ? "confirming" : "finalizing");
          }
        } else if (!cancelled) {
          // Still no block number, or no chain access: confirmations are
          // accumulating but uncountable from here. "Finalizing" would claim
          // they are complete, which is not known to be true.
          setPhase("confirming");
        }
      } catch {
        // A failed head read is not worth surfacing; the next tick retries, and
        // settlement is announced by the webhook stream regardless.
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), HEAD_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [tracked, phase, publicClient, required]);

  return {
    phase,
    confirmations,
    requiredConfirmations: required,
    trackedInputId: tracked?.inputId,
    track,
    clear,
  };
}
