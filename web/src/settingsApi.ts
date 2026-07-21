// Settings/secrets HTTP client — sibling to api.ts (kept untouched) so the
// preserved compare() client stays a verbatim port. Talks to the real
// GET/PUT/settings + DELETE /api/settings/tokens/:id endpoints (server/index.ts).
// The server only ever returns masked views (SecretsView) — raw token values
// never round-trip back to the client after being saved.
import type { NamedToken, PutSettingsInput, SecretsView } from './settingsTypes';

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Запрос завершился с ошибкой ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore body parse failure
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export async function fetchSettings(): Promise<SecretsView> {
  const res = await fetch('/api/settings', { credentials: 'same-origin' });
  return parseJsonOrThrow<SecretsView>(res);
}

export async function putSettings(input: PutSettingsInput): Promise<SecretsView> {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow<SecretsView>(res);
}

export async function deleteToken(id: string): Promise<SecretsView> {
  const res = await fetch(`/api/settings/tokens/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  return parseJsonOrThrow<SecretsView>(res);
}

export function makeTokenId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `tok_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export type { NamedToken, SecretsView };

// TODO(SSE): GET /api/jobs/:id/events + POST /api/jobs/:id/cancel are
// implemented server-side (server/index.ts, server/jobs.ts) but not wired
// here. The running-state progress bar currently uses a simulated interval
// (see useConsoleState.ts, runCompare) exactly like the design prototype's
// own setInterval mock. Wiring real SSE would mean: pass `stream=true` to
// compare(), read {jobId, runId} from the 202 response, subscribe to
// EventSource(`/api/jobs/${jobId}/events`), map StepEvent.pct -> runPct and
// BreakpointEvent -> incremental per-breakpoint results, and call
// POST /api/jobs/:id/cancel from the status bar's "Отмена" button instead of
// just aborting the local timer.
