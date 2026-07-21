// Real SSE streaming client for POST /api/compare (stream=true) + GET
// /api/jobs/:id/events + POST /api/jobs/:id/cancel (server/jobs.ts,
// server/index.ts). Replaces the old simulated setInterval progress ramp —
// see App.tsx runCompare().
//
// EventSource can't POST, so the flow is: POST the same multipart compare
// body as compare() (api.ts) with stream=true — this creates the job and
// the server responds 202 {jobId, runId} while the pipeline runs detached —
// THEN open the EventSource GET by jobId. The server's replay buffer
// (jobs.ts subscribeJob) guarantees no event emitted in the gap between the
// two requests is lost.
import { buildCompareFormData, type CompareParams } from '../api';
import type { BreakpointEvent, JobEvent, JobStateEvent, ParityEvent, ResultEvent, StallEvent, StepEvent } from '../types';

export interface CompareStreamHandlers {
  onJob?: (event: JobStateEvent) => void;
  onStep?: (event: StepEvent) => void;
  onStall?: (event: StallEvent) => void;
  onParity?: (event: ParityEvent) => void;
  onBreakpoint?: (event: BreakpointEvent) => void;
  onResult?: (event: ResultEvent) => void;
  /** An unexpected transport failure (not the normal terminal-event close). */
  onTransportError?: (message: string) => void;
}

export interface CompareStreamHandle {
  jobId: string;
  runId: string;
  /** Requests server-side cancellation AND stops listening — safe to call more than once. */
  cancel: () => void;
}

async function parseErrorResponse(res: Response): Promise<string> {
  let message = `Запрос завершился с ошибкой ${res.status}`;
  try {
    const body = await res.json();
    if (body?.error) message = body.error;
  } catch {
    // ignore body parse failure
  }
  return message;
}

function isTerminalJobStatus(status: JobStateEvent['status']): boolean {
  return status === 'done' || status === 'error' || status === 'cancelled';
}

/**
 * Starts a streaming compare job: POSTs the multipart body with
 * stream=true, then subscribes to the job's SSE event stream. Resolves as
 * soon as the job is created (202) — progress/completion/failure arrive
 * later via `handlers`, exactly like the server's own createJob+runJob
 * split.
 */
export async function startCompareStream(params: CompareParams, handlers: CompareStreamHandlers): Promise<CompareStreamHandle> {
  const formData = buildCompareFormData(params);
  formData.set('stream', 'true');

  const res = await fetch('/api/compare', { method: 'POST', body: formData });
  if (!res.ok) {
    throw new Error(await parseErrorResponse(res));
  }
  const { jobId, runId } = (await res.json()) as { jobId: string; runId: string };

  let closed = false;
  const source = new EventSource(`/api/jobs/${jobId}/events`);

  function close(): void {
    if (closed) return;
    closed = true;
    source.close();
  }

  source.onmessage = (ev: MessageEvent<string>) => {
    if (closed) return;
    let event: JobEvent;
    try {
      event = JSON.parse(ev.data) as JobEvent;
    } catch {
      return; // malformed frame (shouldn't happen — server only ever writes JSON `data:` lines or heartbeat comments, which don't fire onmessage at all)
    }
    switch (event.type) {
      case 'step':
        handlers.onStep?.(event);
        break;
      case 'stall':
        handlers.onStall?.(event);
        break;
      case 'parity':
        handlers.onParity?.(event);
        break;
      case 'breakpoint':
        handlers.onBreakpoint?.(event);
        break;
      case 'result':
        handlers.onResult?.(event);
        break;
      case 'job':
        handlers.onJob?.(event);
        if (isTerminalJobStatus(event.status)) {
          // The server ends the HTTP response right after this event (see
          // server/index.ts isTerminal + res.end()). Close from our side
          // too, synchronously, so the browser's EventSource never gets a
          // chance to run its default auto-reconnect against an
          // already-finished job — that reconnect attempt is what would
          // otherwise fire a spurious onerror below.
          close();
        }
        break;
    }
  };

  source.onerror = () => {
    if (closed) return; // guard: a normal terminal close already ran `close()` above, so any onerror after that is not a real failure
    // shortcut: any pre-terminal EventSource error is reported once as fatal
    // rather than distinguishing a transient reconnect blip from a truly
    // dead connection — acceptable for a local single-user tool; revisit
    // with backoff/retry if this ever runs over a flaky network.
    handlers.onTransportError?.('Соединение для отслеживания прогресса прервалось.');
    close();
  };

  return {
    jobId,
    runId,
    cancel: () => {
      close();
      void fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' }).catch(() => undefined);
    },
  };
}
