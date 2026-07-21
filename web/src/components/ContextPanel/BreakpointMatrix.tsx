import { Check, Clock, Loader2, TriangleAlert } from 'lucide-react';
import { scoreColorVar } from '../../lib/sampleContent';

export type BpLiveStatus = 'queued' | 'running' | 'done' | 'error';

/** Real per-breakpoint status derived from SSE step/breakpoint events — see App.tsx runCompare(). */
export interface BpProgress {
  status: BpLiveStatus;
  /** 0..100 percent, present only once status === 'done'. */
  score?: number;
}

type RowStatus = 'done' | 'error' | 'run' | 'queue';

/**
 * Live progress matrix shown while a compare is running — sorted
 * worst-first. Per-breakpoint status now comes from real SSE events
 * (server/jobs.ts step/breakpoint events): 'done' rows carry a real score,
 * 'error' rows mark a breakpoint whose pipeline failed. The job's overall
 * pct (server/jobs.ts ProgressTracker) is equal-weighted across all
 * breakpoints/phases together, not per-breakpoint, so 'running'/'queued'
 * rows still only have an approximate fill (an equal slice of the overall
 * pct) — but every 'done'/'error' fact shown is real, never fabricated.
 */
export function BreakpointMatrix({
  breakpoints,
  runPct,
  statuses,
}: {
  breakpoints: number[];
  runPct: number;
  statuses: Record<number, BpProgress>;
}) {
  const ascending = [...breakpoints].sort((a, b) => a - b); // narrowest first, the pre-data fallback ordering
  const n = Math.max(1, ascending.length);

  const rows = ascending.map((bp, i) => {
    const live = statuses[bp];
    const sliceStart = (i / n) * 100;
    const sliceEnd = ((i + 1) / n) * 100;
    const baselinePct = runPct >= sliceEnd ? 100 : runPct >= sliceStart ? Math.round(((runPct - sliceStart) / (sliceEnd - sliceStart)) * 100) : 0;

    let status: RowStatus;
    if (live?.status === 'done') status = 'done';
    else if (live?.status === 'error') status = 'error';
    else if (live?.status === 'running') status = 'run';
    else status = runPct >= sliceEnd ? 'done' : runPct >= sliceStart ? 'run' : 'queue'; // no SSE signal yet for this bp — fall back to the overall-pct slice heuristic

    const localPct = status === 'done' || status === 'error' ? 100 : status === 'run' ? baselinePct : 0;
    return { bp, status, score: live?.score, localPct };
  });

  // Худшие сверху: finished rows sorted by ascending score (worst first),
  // failed rows above any score, in-flight/queued rows after — each
  // sub-group narrowest-first.
  const sorted = [...rows].sort((a, b) => {
    const rank = (r: (typeof rows)[number]): number => {
      if (r.status === 'error') return -1;
      if (r.status === 'done') return r.score ?? 0;
      if (r.status === 'run') return 1000;
      return 2000;
    };
    const ra = rank(a);
    const rb = rank(b);
    return ra !== rb ? ra - rb : a.bp - b.bp;
  });

  return (
    <div style={{ overflowY: 'auto', padding: '4px 14px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div className="ddmono" style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.11em', marginBottom: 2 }}>
        Худшие сверху
      </div>
      {sorted.map((row) => {
        const scoreColor = row.score != null ? scoreColorVar(row.score) : 'var(--green)';
        const iconColor = row.status === 'done' ? scoreColor : row.status === 'error' ? 'var(--red)' : row.status === 'run' ? 'var(--scan)' : 'var(--text3)';
        const statText =
          row.status === 'done'
            ? (row.score != null ? `${row.score}%` : 'готово')
            : row.status === 'error'
              ? 'ошибка'
              : row.status === 'run'
                ? `${row.localPct}%`
                : 'в очереди';
        const statColor = row.status === 'done' ? scoreColor : row.status === 'error' ? 'var(--red)' : row.status === 'run' ? 'var(--scan)' : 'var(--text3)';
        const barColor = row.status === 'done' ? scoreColor : row.status === 'error' ? 'var(--red)' : row.status === 'run' ? 'var(--scan)' : 'var(--track)';
        const borderColor = row.status === 'run' ? 'var(--scan)' : row.status === 'error' ? 'var(--red)' : 'var(--border)';
        return (
          <div key={row.bp} style={{ background: 'var(--bg)', border: `1px solid ${borderColor}`, borderRadius: 12, padding: '11px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="ddmono" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600 }}>
                <span style={{ display: 'flex', color: iconColor }}>
                  {row.status === 'done' && <Check size={13} strokeWidth={2.4} aria-hidden="true" />}
                  {row.status === 'error' && <TriangleAlert size={13} strokeWidth={2.2} aria-hidden="true" />}
                  {row.status === 'run' && <Loader2 size={13} strokeWidth={2.2} className="dd-spin" aria-hidden="true" />}
                  {row.status === 'queue' && <Clock size={13} strokeWidth={2} aria-hidden="true" />}
                </span>
                {row.bp}px
              </span>
              <span className="ddmono" style={{ fontSize: 12, color: statColor }}>
                {statText}
              </span>
            </div>
            <div style={{ height: 5, borderRadius: 3, background: 'var(--track)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${row.localPct}%`, background: barColor, borderRadius: 3, transition: 'width .4s var(--ease)' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
