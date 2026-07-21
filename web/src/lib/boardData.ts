// Selects what the canvas/inspector should render for the current
// breakpoint: the verbatim sample/demo content (no real compare has
// completed yet, or the current bp wasn't part of the run) or a real
// BreakpointResult from a completed POST /api/compare.
import type { BreakpointResult, CompareResponse } from '../types';
import { isBreakpointError } from '../types';

export type ActiveBoardData = { kind: 'sample' } | { kind: 'error'; breakpoint: number; message: string } | { kind: 'real'; breakpoint: BreakpointResult };

export function getActiveBoardData(result: CompareResponse | null, bp: number): ActiveBoardData {
  if (!result) return { kind: 'sample' };
  const found = result.breakpoints.find((b) => b.breakpoint === bp);
  if (!found) return { kind: 'sample' };
  if (isBreakpointError(found)) return { kind: 'error', breakpoint: bp, message: found.error };
  return { kind: 'real', breakpoint: found };
}
