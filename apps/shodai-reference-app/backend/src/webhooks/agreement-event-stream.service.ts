import { Injectable } from '@nestjs/common';
import { Observable, Subject, filter, map } from 'rxjs';

/**
 * Fan-out of received webhooks to connected browsers.
 *
 * A partner integration should not poll for a state change it has already been
 * told about: the agreement state advances only when the projection worker
 * finalizes an input, and `agreement.transitioned` is the notification that it
 * happened. This carries that notification the last hop, from the webhook
 * endpoint to the open page.
 *
 * What crosses the wire is an invalidation signal, never agreement content —
 * the browser re-reads through the normal authenticated API once told there is
 * something new. That keeps the stream free of anything worth protecting, which
 * matters because EventSource cannot send an Authorization header.
 */
export interface AgreementStreamEvent {
  type: string;
  agreementId: string;
  /** Per-agreement ordinal on transition events; absent on other types. */
  sequence?: number;
  receivedAt: string;
}

@Injectable()
export class AgreementEventStreamService {
  private readonly events = new Subject<AgreementStreamEvent>();

  publish(event: AgreementStreamEvent): void {
    this.events.next(event);
  }

  /** Signals for one agreement, as Nest SSE message envelopes. */
  observe(agreementId: string): Observable<{ data: AgreementStreamEvent }> {
    return this.events.pipe(
      filter((event) => event.agreementId === agreementId),
      map((event) => ({ data: event })),
    );
  }
}
