// Feature 3: native Figma-by-link reference source.
//
// The ONLY external network call made from this module is to Figma's REST
// API (api.figma.com), using the user's own personal access token loaded
// from a local .env file. It is intrinsic to this feature and user-initiated
// (only triggered when the user picks "Figma" as the reference source and
// supplies a figma.com URL). The token itself is never logged.

export interface ParsedFigmaUrl {
  fileKey: string;
  nodeId: string | null;
}

/**
 * Parses a figma.com URL of the form
 *   https://www.figma.com/file/<fileKey>/<name>?node-id=1-2
 *   https://www.figma.com/design/<fileKey>/<name>?node-id=1%3A2
 * extracting the file key and normalizing the node id to Figma's canonical
 * "1:2" form (the share UI produces "1-2" in the URL, "Copy link to
 * selection" for a frame often produces the URL-encoded "1%3A2").
 * Returns null if the URL isn't a recognizable Figma file/design URL.
 */
export function parseFigmaUrl(rawUrl: string): ParsedFigmaUrl | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (!/(^|\.)figma\.com$/i.test(url.hostname)) return null;

  const match = url.pathname.match(/\/(file|design)\/([a-zA-Z0-9]+)/);
  if (!match) return null;
  const fileKey = match[2];

  const nodeIdRaw = url.searchParams.get('node-id');
  const nodeId = nodeIdRaw ? normalizeNodeId(nodeIdRaw) : null;

  return { fileKey, nodeId };
}

/** Normalizes a node id from either "1-2" or already-decoded "1:2" form to "1:2". */
export function normalizeNodeId(raw: string): string {
  const decoded = safeDecodeURIComponent(raw);
  if (decoded.includes(':')) return decoded;
  const dashMatch = decoded.match(/^(\d+)-(\d+)$/);
  if (dashMatch) return `${dashMatch[1]}:${dashMatch[2]}`;
  return decoded;
}

function safeDecodeURIComponent(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export class FigmaConfigError extends Error {}
export class FigmaApiError extends Error {}

/** Reads FIGMA_TOKEN from process.env (populated by dotenv in index.ts from .env). */
export function getFigmaToken(): string {
  const token = process.env.FIGMA_TOKEN;
  if (!token || token.trim() === '') {
    throw new FigmaConfigError(
      'FIGMA_TOKEN не найден. Чтобы использовать Figma как источник референса:\n' +
        '  1. Откройте Figma → Settings → Security → Personal access tokens → Create new token.\n' +
        '  2. Скопируйте токен (он показывается один раз).\n' +
        `  3. Создайте файл ".env" в корне проекта (см. .env.example) и добавьте строку: FIGMA_TOKEN=ваш_токен\n` +
        '  4. Перезапустите сервер (npm run dev / npm start).',
    );
  }
  return token;
}

export function buildAuthHeaders(token: string): Record<string, string> {
  return { 'X-Figma-Token': token };
}

export function buildImageRequestUrl(fileKey: string, nodeId: string): string {
  const params = new URLSearchParams({ ids: nodeId, format: 'png', scale: '2' });
  return `https://api.figma.com/v1/images/${fileKey}?${params.toString()}`;
}

function buildFileRequestUrl(fileKey: string): string {
  return `https://api.figma.com/v1/files/${fileKey}?depth=2`;
}

interface FigmaNode {
  id: string;
  type: string;
  children?: FigmaNode[];
}

interface FigmaFileResponse {
  document?: { children?: FigmaNode[] };
}

/** node-id is missing from the URL: fall back to the first top-level frame in the file. */
async function resolveFirstTopLevelFrameId(fileKey: string, token: string): Promise<string> {
  const res = await fetch(buildFileRequestUrl(fileKey), { headers: buildAuthHeaders(token) });
  if (!res.ok) {
    throw new FigmaApiError(
      `Не удалось получить структуру Figma-файла (HTTP ${res.status}). Проверьте, что ссылка указывает на существующий файл и что токен имеет к нему доступ.`,
    );
  }
  const json = (await res.json()) as FigmaFileResponse;
  const pages = json.document?.children ?? [];
  for (const page of pages) {
    const frame = (page.children ?? []).find(
      (n) => n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'COMPONENT_SET' || n.type === 'INSTANCE',
    );
    if (frame?.id) return frame.id;
  }
  throw new FigmaConfigError(
    'В ссылке не указан node-id, а верхнеуровневый фрейм в файле не найден автоматически. ' +
      'Откройте нужный фрейм в Figma, выделите его и скопируйте ссылку через "Copy link to selection" — ' +
      'такая ссылка содержит ?node-id=...',
  );
}

interface FigmaImagesResponse {
  err?: string | null;
  images?: Record<string, string | null>;
}

/** Fetches the temporary rendered-PNG URL for a node from Figma's images endpoint. */
async function fetchRenderedImageUrl(fileKey: string, nodeId: string, token: string): Promise<string> {
  const res = await fetch(buildImageRequestUrl(fileKey, nodeId), { headers: buildAuthHeaders(token) });
  if (res.status === 403 || res.status === 401) {
    throw new FigmaConfigError('Figma отклонила токен (401/403). Проверьте, что FIGMA_TOKEN в .env актуален и не истёк.');
  }
  if (!res.ok) {
    throw new FigmaApiError(`Запрос рендера к Figma API завершился с ошибкой (HTTP ${res.status}).`);
  }
  const json = (await res.json()) as FigmaImagesResponse;
  if (json.err) {
    throw new FigmaApiError(`Figma API вернул ошибку: ${json.err}`);
  }
  const imageUrl = json.images?.[nodeId];
  if (!imageUrl) {
    throw new FigmaApiError(
      `Figma не вернула изображение для node-id "${nodeId}". Проверьте, что этот узел существует в файле и не был удалён.`,
    );
  }
  return imageUrl;
}

async function downloadImageBuffer(imageUrl: string): Promise<Buffer> {
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new FigmaApiError(`Не удалось скачать рендер из Figma (HTTP ${res.status}).`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * End-to-end: figma.com URL -> PNG buffer of the referenced (or first
 * top-level) frame, rendered by Figma itself at 2x scale.
 */
export async function fetchFigmaReferenceImage(figmaUrl: string): Promise<Buffer> {
  const parsed = parseFigmaUrl(figmaUrl);
  if (!parsed) {
    throw new FigmaConfigError(
      'Не удалось распознать ссылку на Figma. Ожидается URL вида https://www.figma.com/file/<key>/... или /design/<key>/..., в идеале с ?node-id=...',
    );
  }

  const token = getFigmaToken();
  const nodeId = parsed.nodeId ?? (await resolveFirstTopLevelFrameId(parsed.fileKey, token));
  const imageUrl = await fetchRenderedImageUrl(parsed.fileKey, nodeId, token);
  return downloadImageBuffer(imageUrl);
}
