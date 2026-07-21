import type { CaptureOptions, CompareResponse, ReferenceType } from './types';

export interface CompareParams {
  referenceType: ReferenceType;
  referenceUrl?: string;
  figmaUrl?: string;
  targetUrl: string;
  breakpoints: number[];
  fullPage: boolean;
  image?: File | null;
  /** Applied only when referenceType === 'url'. */
  referenceCapture?: CaptureOptions;
  /** Always applied to the target capture. */
  targetCapture?: CaptureOptions;
}

/** Strips empty arrays/objects/strings so we don't send a noisy capture-options blob for defaults. */
function pruneCaptureOptions(a: CaptureOptions): CaptureOptions | undefined {
  const out: CaptureOptions = {};
  if (a.hideSelectors && a.hideSelectors.length > 0) out.hideSelectors = a.hideSelectors;
  if (a.dismissSelectors && a.dismissSelectors.length > 0) out.dismissSelectors = a.dismissSelectors;
  if (a.waitUntil) out.waitUntil = a.waitUntil;
  if (typeof a.waitMs === 'number') out.waitMs = a.waitMs;
  if (a.waitForSelector) out.waitForSelector = a.waitForSelector;
  if (typeof a.freezeAnimations === 'boolean') out.freezeAnimations = a.freezeAnimations;
  if (a.auth && (a.auth.cookies?.length || (a.auth.headers && Object.keys(a.auth.headers).length) || a.auth.httpCredentials)) {
    out.auth = a.auth;
  }
  if (a.clipSelector) out.clipSelector = a.clipSelector;
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Builds the multipart body shared by both the synchronous compare() below
 * and the streaming client (lib/jobStream.ts) — the two are the exact same
 * request shape, differing only in whether `stream=true` is added and how
 * the response is consumed (JSON body vs 202 + SSE), matching the server's
 * "one pipeline, two response modes" contract (server/index.ts).
 */
export function buildCompareFormData(params: CompareParams): FormData {
  const formData = new FormData();
  formData.set('referenceType', params.referenceType);
  if (params.referenceUrl) formData.set('referenceUrl', params.referenceUrl);
  if (params.figmaUrl) formData.set('figmaUrl', params.figmaUrl);
  formData.set('targetUrl', params.targetUrl);
  formData.set('breakpoints', JSON.stringify(params.breakpoints));
  formData.set('fullPage', String(params.fullPage));
  if (params.image) formData.set('image', params.image);

  const referenceCapture = params.referenceCapture ? pruneCaptureOptions(params.referenceCapture) : undefined;
  if (referenceCapture && params.referenceType === 'url') formData.set('referenceCapture', JSON.stringify(referenceCapture));

  const targetCapture = params.targetCapture ? pruneCaptureOptions(params.targetCapture) : undefined;
  if (targetCapture) formData.set('targetCapture', JSON.stringify(targetCapture));

  return formData;
}

export async function compare(params: CompareParams): Promise<CompareResponse> {
  const formData = buildCompareFormData(params);

  const res = await fetch('/api/compare', {
    method: 'POST',
    body: formData,
  });

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

  return (await res.json()) as CompareResponse;
}
