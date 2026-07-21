// Structural unit tests for the Figma URL parser and request-building
// helpers (Feature 3). No network calls, no real token/file required.
// Run with: npx tsx --test server/figma.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFigmaUrl, normalizeNodeId, buildImageRequestUrl, buildAuthHeaders, getFigmaToken, FigmaConfigError } from './figma.js';

test('parseFigmaUrl: /file/ URL with dash-form node-id', () => {
  const parsed = parseFigmaUrl('https://www.figma.com/file/AbC123xyz/My-Design?node-id=1-2&t=abc');
  assert.deepEqual(parsed, { fileKey: 'AbC123xyz', nodeId: '1:2' });
});

test('parseFigmaUrl: /design/ URL with url-encoded colon node-id', () => {
  const parsed = parseFigmaUrl('https://www.figma.com/design/XyZ789/Landing-Page?node-id=42%3A108&m=dev');
  assert.deepEqual(parsed, { fileKey: 'XyZ789', nodeId: '42:108' });
});

test('parseFigmaUrl: URL with already-decoded colon node-id', () => {
  const parsed = parseFigmaUrl('https://www.figma.com/design/XyZ789/Landing-Page?node-id=42:108');
  assert.deepEqual(parsed, { fileKey: 'XyZ789', nodeId: '42:108' });
});

test('parseFigmaUrl: missing node-id -> nodeId null (caller falls back to first frame)', () => {
  const parsed = parseFigmaUrl('https://www.figma.com/file/AbC123xyz/My-Design');
  assert.deepEqual(parsed, { fileKey: 'AbC123xyz', nodeId: null });
});

test('parseFigmaUrl: non-figma host returns null', () => {
  assert.equal(parseFigmaUrl('https://example.com/file/AbC123/x?node-id=1-2'), null);
});

test('parseFigmaUrl: figma.com URL with no file/design path returns null', () => {
  assert.equal(parseFigmaUrl('https://www.figma.com/pricing'), null);
});

test('parseFigmaUrl: malformed URL returns null (no throw)', () => {
  assert.equal(parseFigmaUrl('not a url'), null);
});

test('normalizeNodeId: dash form', () => {
  assert.equal(normalizeNodeId('123-456'), '123:456');
});

test('normalizeNodeId: encoded colon form', () => {
  assert.equal(normalizeNodeId('123%3A456'), '123:456');
});

test('normalizeNodeId: plain colon form passthrough', () => {
  assert.equal(normalizeNodeId('123:456'), '123:456');
});

test('buildImageRequestUrl: builds correct endpoint + query', () => {
  const url = buildImageRequestUrl('FILEKEY1', '1:2');
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, 'https://api.figma.com/v1/images/FILEKEY1');
  assert.equal(parsed.searchParams.get('ids'), '1:2');
  assert.equal(parsed.searchParams.get('format'), 'png');
  assert.equal(parsed.searchParams.get('scale'), '2');
});

test('buildAuthHeaders: sets X-Figma-Token header', () => {
  const headers = buildAuthHeaders('secret-token-value');
  assert.deepEqual(headers, { 'X-Figma-Token': 'secret-token-value' });
});

test('getFigmaToken: throws a clear, actionable error when FIGMA_TOKEN is missing', () => {
  const prev = process.env.FIGMA_TOKEN;
  delete process.env.FIGMA_TOKEN;
  try {
    assert.throws(() => getFigmaToken(), (err: unknown) => {
      assert.ok(err instanceof FigmaConfigError);
      assert.match((err as Error).message, /FIGMA_TOKEN/);
      assert.match((err as Error).message, /\.env/);
      assert.match((err as Error).message, /Personal access token/i);
      return true;
    });
  } finally {
    if (prev !== undefined) process.env.FIGMA_TOKEN = prev;
  }
});

test('getFigmaToken: returns the token when set', () => {
  const prev = process.env.FIGMA_TOKEN;
  process.env.FIGMA_TOKEN = 'figd_test_dummy_value';
  try {
    assert.equal(getFigmaToken(), 'figd_test_dummy_value');
  } finally {
    if (prev === undefined) delete process.env.FIGMA_TOKEN;
    else process.env.FIGMA_TOKEN = prev;
  }
});
