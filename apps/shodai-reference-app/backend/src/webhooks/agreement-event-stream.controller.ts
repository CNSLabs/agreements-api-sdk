import { Controller, Param, Sse } from '@nestjs/common';
import type { Observable } from 'rxjs';
import {
  AgreementEventStreamService,
  type AgreementStreamEvent,
} from './agreement-event-stream.service';

/**
 * Server-sent events telling an open page that one of its agreements changed.
 *
 * This is the last hop of the webhook path: external-api signs and delivers
 * `agreement.transitioned` when the projection worker finalizes an input, the
 * receiver verifies it, and this hands it to the browser so the UI can re-read
 * instead of polling for a change it has already been notified about.
 *
 * The stream is deliberately contentless — type, agreement id, and sequence —
 * because EventSource cannot carry an Authorization header. The browser fetches
 * the agreement itself through the authenticated API. A production integration
 * that wanted the stream itself protected would authenticate it with a
 * short-lived token or a session cookie; anything richer than an invalidation
 * signal here would be a leak.
 */
@Controller('agreements-api/agreements')
export class AgreementEventStreamController {
  constructor(private readonly stream: AgreementEventStreamService) {}

  @Sse(':agreementId/events')
  streamAgreementEvents(
    @Param('agreementId') agreementId: string,
  ): Observable<{ data: AgreementStreamEvent }> {
    return this.stream.observe(agreementId);
  }
}
