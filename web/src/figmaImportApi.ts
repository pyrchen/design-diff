// Figma import (Feature 4) HTTP client — sibling to api.ts/settingsApi.ts.
// Talks to POST /api/figma/import (server/index.ts -> server/figmaImport.ts).
// The Figma token itself is never sent from here — it's resolved server-side
// from the saved Settings token / .env, exactly like the existing
// figma-as-reference-image compare flow.
import type { FigmaImportResult } from './types';

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

export async function importFigma(figmaUrl: string): Promise<FigmaImportResult> {
  const res = await fetch('/api/figma/import', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ figmaUrl }),
  });
  return parseJsonOrThrow<FigmaImportResult>(res);
}
