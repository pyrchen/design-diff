// Structural unit tests for the Figma-import transform (Feature 4). No
// network calls, no real token/file required — feeds a small synthetic
// Figma node-tree fixture straight into the pure functions.
// Run with: npx tsx --test server/figmaImport.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nodeTreeToBlockTree, blockTreeToHtml, buildBlockSummaries, buildImplementationPrompt, type FigmaNode } from './figmaImport.js';

// A small but representative fixture:
//  - root FRAME, layoutMode NONE (no auto-layout) -> absolute-positioned children
//  - Header FRAME, layoutMode HORIZONTAL (auto-layout) -> flex row, containing a TEXT leaf
//  - Card FRAME, layoutMode NONE, with cornerRadius + a DROP_SHADOW effect, containing
//    a RECTANGLE with an IMAGE fill and a second TEXT leaf
const fixture: FigmaNode = {
  id: '0:1',
  name: 'Landing',
  type: 'FRAME',
  absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 },
  fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }],
  layoutMode: 'NONE',
  children: [
    {
      id: '0:2',
      name: 'Header',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 60 },
      fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.2, b: 0.9, a: 1 } }],
      layoutMode: 'HORIZONTAL',
      itemSpacing: 8,
      paddingLeft: 16,
      paddingRight: 16,
      paddingTop: 12,
      paddingBottom: 12,
      primaryAxisAlignItems: 'SPACE_BETWEEN',
      counterAxisAlignItems: 'CENTER',
      children: [
        {
          id: '0:3',
          name: 'Logo',
          type: 'TEXT',
          absoluteBoundingBox: { x: 16, y: 20, width: 80, height: 20 },
          characters: 'Acme',
          style: { fontFamily: 'Inter', fontWeight: 700, fontSize: 18, lineHeightPx: 22, textAlignHorizontal: 'LEFT' },
          fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }],
        },
      ],
    },
    {
      id: '0:4',
      name: 'Card',
      type: 'FRAME',
      absoluteBoundingBox: { x: 20, y: 80, width: 360, height: 180 },
      fills: [{ type: 'SOLID', color: { r: 0.93, g: 0.93, b: 0.93, a: 1 } }],
      cornerRadius: 12,
      effects: [{ type: 'DROP_SHADOW', visible: true, color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 0, y: 4 }, radius: 12, spread: 0 }],
      layoutMode: 'NONE',
      children: [
        {
          id: '0:5',
          name: 'Photo',
          type: 'RECTANGLE',
          absoluteBoundingBox: { x: 36, y: 96, width: 100, height: 100 },
          fills: [{ type: 'IMAGE', imageRef: 'abc123' }],
        },
        {
          id: '0:6',
          name: 'Title',
          type: 'TEXT',
          absoluteBoundingBox: { x: 150, y: 100, width: 200, height: 24 },
          characters: 'Card title',
          style: { fontFamily: 'Inter', fontWeight: 600, fontSize: 20, lineHeightPx: 24, textAlignHorizontal: 'LEFT' },
          fills: [{ type: 'SOLID', color: { r: 0.08, g: 0.09, b: 0.12, a: 1 } }],
        },
      ],
    },
  ],
};

test('nodeTreeToBlockTree: root with layoutMode NONE -> absolute children', () => {
  const { root } = nodeTreeToBlockTree(fixture);
  assert.equal(root.layout.childrenMode, 'absolute');
  assert.deepEqual(root.position, { x: 0, y: 0, width: 400, height: 300 });
  assert.equal(root.children.length, 2);
});

test('nodeTreeToBlockTree: FRAME with auto-layout (HORIZONTAL) -> flex row + gap/justify/align', () => {
  const { root } = nodeTreeToBlockTree(fixture);
  const header = root.children[0];
  assert.equal(header.name, 'Header');
  assert.equal(header.layout.childrenMode, 'flex');
  assert.equal(header.layout.direction, 'row');
  assert.equal(header.layout.gap, 8);
  assert.equal(header.layout.justifyContent, 'space-between');
  assert.equal(header.layout.alignItems, 'center');
  assert.deepEqual(header.layout.padding, { top: 12, right: 16, bottom: 12, left: 16 });
  // Absolutely positioned under its (absolute-mode) parent root.
  assert.deepEqual(header.position, { x: 0, y: 0, width: 400, height: 60 });
});

test('nodeTreeToBlockTree: TEXT node -> characters + font styles', () => {
  const { root } = nodeTreeToBlockTree(fixture);
  const logo = root.children[0].children[0];
  assert.equal(logo.kind, 'text');
  assert.equal(logo.text, 'Acme');
  assert.equal(logo.styles['font-family'], "'Inter', sans-serif");
  assert.equal(logo.styles['font-weight'], '700');
  assert.equal(logo.styles['font-size'], '18px');
  assert.equal(logo.styles['line-height'], '22px');
  assert.equal(logo.styles['text-align'], 'left');
  assert.equal(logo.styles.color, 'rgb(255, 255, 255)'); // white fill -> text color
  // Positioned relative to its flex parent (Header) — offset stored even though flex flow ignores it for placement.
  assert.deepEqual(logo.position, { x: 16, y: 20, width: 80, height: 20 });
});

test('nodeTreeToBlockTree: SOLID fill -> background, cornerRadius -> border-radius, DROP_SHADOW -> box-shadow', () => {
  const { root } = nodeTreeToBlockTree(fixture);
  const card = root.children[1];
  assert.equal(card.name, 'Card');
  assert.equal(card.styles.background, 'rgb(237, 237, 237)');
  assert.equal(card.styles['border-radius'], '12px');
  assert.equal(card.styles['box-shadow'], '0px 4px 12px 0px rgba(0, 0, 0, 0.25)');
  assert.equal(card.layout.childrenMode, 'absolute');
  assert.deepEqual(card.position, { x: 20, y: 80, width: 360, height: 180 });
});

test('nodeTreeToBlockTree: IMAGE fill -> kind "image" + imageFill flag, position relative to its own parent (Card)', () => {
  const { root } = nodeTreeToBlockTree(fixture);
  const photo = root.children[1].children[0];
  assert.equal(photo.name, 'Photo');
  assert.equal(photo.kind, 'image');
  assert.equal(photo.imageFill, true);
  assert.deepEqual(photo.position, { x: 16, y: 16, width: 100, height: 100 });
  assert.equal(photo.styles.background, undefined); // image fill never sets a background color
});

test('nodeTreeToBlockTree: block ids are the raw Figma node ids (needed for the /v1/images round-trip)', () => {
  const { blocks } = nodeTreeToBlockTree(fixture);
  const ids = blocks.map((b) => b.id).sort();
  assert.deepEqual(ids, ['0:1', '0:2', '0:3', '0:4', '0:5', '0:6']);
});

test('blockTreeToHtml: produces an openable HTML document with flex/absolute CSS, colors, and text content', () => {
  const { root } = nodeTreeToBlockTree(fixture);
  const html = blockTreeToHtml(root, { title: 'Landing preview' });

  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<\/html>\s*$/);
  assert.match(html, /<title>Landing preview<\/title>/);

  // Header: auto-layout -> flex row + justify/align, positioned absolutely under root.
  assert.match(html, /data-block-id="0:2"[^>]*style="[^"]*display:flex[^"]*flex-direction:row[^"]*justify-content:space-between[^"]*align-items:center/);
  assert.match(html, /data-block-id="0:2"[^>]*style="[^"]*position:absolute;left:0px;top:0px/);

  // TEXT content + font styles round-trip into the markup.
  assert.match(html, /data-block-id="0:3"[^>]*>Acme<\/p>/);
  assert.match(html, /data-block-id="0:6"[^>]*>Card title<\/p>/);

  // Visual styles from fills/cornerRadius/effects.
  assert.match(html, /border-radius:12px/);
  assert.match(html, /box-shadow:0px 4px 12px 0px rgba\(0, 0, 0, 0\.25\)/);
});

test('blockTreeToHtml: an image-fill block with a resolved imageMap entry gets a background-image url()', () => {
  const { root } = nodeTreeToBlockTree(fixture);
  const html = blockTreeToHtml(root, { title: 'Landing preview', imageMap: { '0:5': 'images/0-5.png' } });
  assert.match(html, /data-block-id="0:5"[^>]*style="[^"]*background-image:url\('images\/0-5\.png'\)/);
});

test('buildBlockSummaries: flat, doc-order list with stable data-attribute selectors and the exact style set', () => {
  const { root } = nodeTreeToBlockTree(fixture);
  const blocks = buildBlockSummaries(root);
  assert.equal(blocks.length, 6);
  assert.deepEqual(
    blocks.map((b) => b.id),
    ['0:1', '0:2', '0:3', '0:4', '0:5', '0:6'],
  );
  for (const b of blocks) {
    assert.equal(b.selector, `[data-block-id="${b.id}"]`);
  }
  const header = blocks.find((b) => b.id === '0:2')!;
  assert.equal(header.styleSet.display, 'flex');
  assert.equal(header.styleSet['flex-direction'], 'row');
  const card = blocks.find((b) => b.id === '0:4')!;
  assert.equal(card.styleSet['border-radius'], '12px');
  const title = blocks.find((b) => b.id === '0:6')!;
  assert.equal(title.text, 'Card title');
});

test('buildImplementationPrompt: deterministic, section-by-section, top-level frames first', () => {
  const { root } = nodeTreeToBlockTree(fixture);
  const blocks = buildBlockSummaries(root);
  const steps1 = buildImplementationPrompt(root, blocks, { sourceUrl: 'https://www.figma.com/design/ABC123/Landing?node-id=0-1' });
  const steps2 = buildImplementationPrompt(root, blocks, { sourceUrl: 'https://www.figma.com/design/ABC123/Landing?node-id=0-1' });

  assert.equal(steps1, steps2); // deterministic — no randomness, no model call
  assert.match(steps1, /## План реализации/);
  assert.match(steps1, /## Полный список блоков/);
  assert.match(steps1, /Landing/);
  assert.match(steps1, /Блоков всего: 6/);
  // Section ordering: root container first, then its top-level children (Header, Card) as their own steps.
  const rootIdx = steps1.indexOf('[data-block-id="0:1"]');
  const headerIdx = steps1.indexOf('[data-block-id="0:2"]');
  const cardIdx = steps1.indexOf('[data-block-id="0:4"]');
  assert.ok(rootIdx >= 0 && headerIdx > rootIdx && cardIdx > headerIdx);
});
