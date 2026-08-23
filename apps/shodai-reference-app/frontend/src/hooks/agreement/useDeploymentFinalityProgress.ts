import * as React from "react";
import { usePublicClient } from "wagmi";
import type { AgreementRecordApi } from "@/hooks/useAgreementsApi";

/**
 * Confirmation progress for a freshly deployed agreement.
 *
 * The platform answers a deploy as soon as the transaction is included — one
 * confirmation — but the projection worker only recognizes the agreement once
 * it is past the chain's finality boundary. Inputs got a PENDING/FINALIZED
 * status for exactly this window; deployments have no equivalent signal, so
 * this is display-only arithmetic: count confirmations from the deploy
 * transaction and stop once the boundary is passed. Nothing is gated on it —
 * an input submitted meanwhile is safe, because its own finality wait is
 * strictly longer than the deployment's.
 *
 * Only recent deployments are tracked (same give-up window as the input
 * tracker), so old agreement pages never pay the receipt lookup.
 */
export interface DeploymentFinalityProgress {
  /** True while the deployment is inside its finality window. */
  tracking: boolean;
  confirmations: number;
  requiredConfirmations: number;
}

const HEAD_POLL_INTERVAL_MS = 4_000;
const MAX_TRACKING_MS = 15 * 60_000;

export function useDeploymentFinalityProgress(options: {
  record: AgreementRecordApi | null;
  requiredConfirmations?: number;
}): DeploymentFinalityProgress {
  const { record, requiredConfirmations } = options;
  const publicClient = usePublicClient({ chainId: record?.chainId });

  const required =
    requiredConfirmations && requiredConfirmations > 0 ? requiredConfirmations : 0;

  const txHash =
    record?.status === "Deployed"
      ? record.transactionHash || undefined
      : undefined;
  // The mirror's updatedAt is the promotion write, so it dates the
  // deployment closely enough for the give-up gate; an older record that
  // slips through costs one receipt read before the counter reports done.
  const deployedAtMs = record?.updatedAt ? Date.parse(String(record.updatedAt)) : NaN;
  const isRecent =
    Number.isFinite(deployedAtMs) && Date.now() - deployedAtMs < MAX_TRACKING_MS;

  const [confirmations, setConfirmations] = React.useState(0);
  const [done, setDone] = React.useState(false);
  const blockNumberRef = React.useRef<number | undefined>(undefined);

  const eligible = Boolean(txHash && isRecent && required > 0 && publicClient);

  React.useEffect(() => {
    // A different deployment (or none) resets the counter.
    blockNumberRef.current = undefined;
    setConfirmations(0);
    setDone(false);
  }, [txHash]);

  React.useEffect(() => {
    if (!eligible || done) return undefined;

    let cancelled = false;
    const tick = async () => {
      if (cancelled || !publicClient || !txHash) return;
      try {
        if (blockNumberRef.current === undefined) {
          const receipt = await publicClient.getTransactionReceipt({
            hash: txHash as `0x${string}`,
          });
          blockNumberRef.current = Number(receipt.blockNumber);
        }
        const head = Number(await publicClient.getBlockNumber());
        // Blocks on top of inclusion, matching the worker's head - B >= depth
        // eligibility rule (see useInputFinalityProgress for the rationale).
        const seen = Math.max(0, head - blockNumberRef.current);
        if (cancelled) return;
        setConfirmations(seen);
        if (seen >= required) setDone(true);
      } catch {
        // Receipt not indexed yet or a failed head read; the next tick retries.
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), HEAD_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [eligible, done, publicClient, txHash, required]);

  return {
    tracking: eligible && !done,
    confirmations,
    requiredConfirmations: required,
  };
}
