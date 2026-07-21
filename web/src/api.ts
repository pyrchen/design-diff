import type { CompareResponse, ReferenceType } from './types';

export interface CompareParams {
  referenceType: ReferenceType;
  referenceUrl?: string;
  targetUrl: string;
  breakpoints: number[];
  fullPage: boolean;
  image?: File | null;
}

export async function compare(params: CompareParams): Promise<CompareResponse> {
  const formData = new FormData();
  formData.set('referenceType', params.referenceType);
  if (params.referenceUrl) formData.set('referenceUrl', params.referenceUrl);
  formData.set('targetUrl', params.targetUrl);
  formData.set('breakpoints', JSON.stringify(params.breakpoints));
  formData.set('fullPage', String(params.fullPage));
  if (params.image) formData.set('image', params.image);

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
