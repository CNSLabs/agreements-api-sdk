import * as React from "react";

const AGREEMENTS_API_URL = import.meta.env.VITE_AGREEMENTS_API_BASE_URL || "";

export interface AgreementStreamEvent {
  type: string;
  agreementId: string;
  sequence?: number;
  receivedAt: string;
}

/**
 * Subscribe to webhook-driven change notifications for one agreement.
 *
 * The platform already tells this app when an agreement moves: external-api
 * delivers `agreement.transitioned` once the projection worker finalizes an
 * input. Polling for that same change would be asking a question we have been
 * given the answer to, so the page listens instead and re-reads when told.
 *
 * The stream carries an invalidation signal only, so the handler is expected to
 * refetch through the authenticated API rather than trust the event body.
 * EventSource reconnects on its own, and `onReconnect` covers the gap: anything
 * that happened while the connection was down was missed, so the caller
 * re-reads once on resume.
 */
export function useAgreementEventStream(options: {
  agreementId: string | null | undefined;
  onEvent: (event: AgreementStreamEvent) => void;
  onReconnect?: () => void;
  enabled?: boolean;
}): void {
  const { agreementId, onEvent, onReconnect, enabled = true } = options;

  // Keep the latest handlers without tearing the connection down on every
  // render that produces new callback identities.
  const onEventRef = React.useRef(onEvent);
  const onReconnectRef = React.useRef(onReconnect);
  React.useEffect(() => {
    onEventRef.current = onEvent;
    onReconnectRef.current = onReconnect;
  }, [onEvent, onReconnect]);

  React.useEffect(() => {
    if (!enabled || !agreementId) return undefined;

    const url = `${AGREEMENTS_API_URL}/agreements-api/agreements/${encodeURIComponent(agreementId)}/events`;
    let source: EventSource;
    try {
      source = new EventSource(url);
    } catch {
      // No EventSource, or a URL the browser refuses: the UI still works, it
      // just will not update on its own.
      return undefined;
    }

    let sawError = false;

    const handleMessage = (message: MessageEvent<string>) => {
      if (sawError) {
        sawError = false;
        onReconnectRef.current?.();
      }
      try {
        onEventRef.current(JSON.parse(message.data) as AgreementStreamEvent);
      } catch {
        // A frame we cannot read is still a signal that something changed.
        onReconnectRef.current?.();
      }
    };
    const handleOpen = () => {
      if (!sawError) return;
      sawError = false;
      onReconnectRef.current?.();
    };
    const handleError = () => {
      sawError = true;
    };

    source.addEventListener("message", handleMessage);
    source.addEventListener("open", handleOpen);
    source.addEventListener("error", handleError);

    return () => {
      source.removeEventListener("message", handleMessage);
      source.removeEventListener("open", handleOpen);
      source.removeEventListener("error", handleError);
      source.close();
    };
  }, [agreementId, enabled]);
}
