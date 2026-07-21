import type { AdvancedCaptureOptions, CompareResponse, ReferenceType } from './types';

export interface CompareParams {
  referenceType: ReferenceType;
  referenceUrl?: string;
  figmaUrl?: string;
  targetUrl: string;
  breakpoints: number[];
  fullPage: boolean;
  image?: File | null;
  advanced?: AdvancedCaptureOptions;
}

/** Strips empty arrays/objects/strings so we don't send a noisy "advanced" blob for defaults. */
function pruneAdvanced(a: AdvancedCaptureOptions): AdvancedCaptureOptions | undefined {
  const out: AdvancedCaptureOptions = {};
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

export async function compare(params: CompareParams): Promise<CompareResponse> {
  const formData = new FormData();
  formData.set('referenceType', params.referenceType);
  if (params.referenceUrl) formData.set('referenceUrl', params.referenceUrl);
  if (params.figmaUrl) formData.set('figmaUrl', params.figmaUrl);
  formData.set('targetUrl', params.targetUrl);
  formData.set('breakpoints', JSON.stringify(params.breakpoints));
  formData.set('fullPage', String(params.fullPage));
  if (params.image) formData.set('image', params.image);
  const advanced = params.advanced ? pruneAdvanced(params.advanced) : undefined;
  if (advanced) formData.set('advanced', JSON.stringify(advanced));

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
