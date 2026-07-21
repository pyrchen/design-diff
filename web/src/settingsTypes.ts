// Additive types for the Settings/secrets + Job-telemetry endpoints — kept
// out of types.ts so that file stays an exact, unmodified port of the
// pre-existing API contract types (per the migration plan). Mirrors the
// relevant slice of server/types.ts "Settings / secrets" + "Engine Phase-1"
// sections (masked views only — the server never returns raw token values).

export interface NamedToken {
  id: string;
  label: string;
  kind: 'bearer' | 'header' | 'cookie' | 'raw';
  value: string;
  headerName?: string;
  domain?: string;
}

/** Masked view — safe to render (never carries a raw secret value). */
export interface SecretsView {
  figmaToken: { set: boolean; last4?: string };
  tokens: Array<Omit<NamedToken, 'value'> & { last4: string }>;
  remember: boolean;
}

export interface PutSettingsInput {
  figmaToken?: string | null;
  tokens?: NamedToken[];
  remember: boolean;
}

// --- Job telemetry (SSE) — types only; not wired yet, see api.ts TODO -------

export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

export interface JobStateEvent {
  type: 'job';
  jobId: string;
  status: JobStatus;
  pct: number;
  currentAction: string;
  error?: string;
}
