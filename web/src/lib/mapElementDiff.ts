// Maps a real backend ElementDiffEntry (server/styles.ts diffElements()) into
// the same {tag, text, kind, rows} shape the sample/mock content uses, so
// ElementDiffRow / InspectCallout / pins can render either real or sample
// data through one code path.
import type { ElementBox, ElementDiffEntry } from '../types';
import type { DiffKind } from './sampleContent';

export interface MappedRow {
  k: string;
  a: string;
  b: string;
  ca?: string;
  cb?: string;
}

export interface MappedElementDiff {
  key: string;
  tag: string;
  text: string;
  kind: DiffKind;
  rows: MappedRow[];
  /** Best-available box to anchor a pin on the TARGET board — targetBox when
   * present; for `missing` entries (present in ref, absent in target) falls
   * back to refBox as a best-effort approximation of where it should be.
   * shortcut: no attempt to re-project ref coordinates onto target's own
   * layout — fine for same-shaped pages, imprecise if the two pages diverge
   * structurally above the missing element. */
  anchorBox: ElementBox | undefined;
}

function isColorProp(prop: string): boolean {
  return /color/i.test(prop) || /background/i.test(prop) || /fill|border-color/i.test(prop);
}

function looksLikeColor(value: string): boolean {
  return /^#[0-9a-f]{3,8}$/i.test(value.trim()) || /^rgba?\(/i.test(value.trim());
}

export function elementDiffKind(entry: ElementDiffEntry): DiffKind {
  if (entry.status === 'missing') return 'miss';
  if (entry.status === 'extra') return 'extra';
  return 'diff';
}

/** label is `<tag> (cssPath)` (see server/styles.ts elementLabel) — split into a short tag chip + the rest as display text. */
export function elementDiffTagText(entry: ElementDiffEntry): { tag: string; text: string } {
  const m = /^(<[^>]+>)\s*(.*)$/.exec(entry.label);
  if (m) return { tag: m[1], text: m[2] || entry.key };
  return { tag: '<el>', text: entry.label };
}

export function mapElementDiff(entry: ElementDiffEntry): MappedElementDiff {
  const { tag, text } = elementDiffTagText(entry);
  const rows: MappedRow[] = entry.styleDeltas.map((sd) => {
    const row: MappedRow = { k: sd.prop, a: sd.reference, b: sd.target };
    if (isColorProp(sd.prop) && looksLikeColor(sd.reference) && looksLikeColor(sd.target)) {
      row.ca = sd.reference;
      row.cb = sd.target;
    }
    return row;
  });
  if (entry.geometryDelta?.significant) {
    const { dx, dy, dw, dh } = entry.geometryDelta;
    rows.push({ k: 'сдвиг (x/y)', a: `${dx >= 0 ? '+' : ''}${Math.round(dx)}px`, b: `${dy >= 0 ? '+' : ''}${Math.round(dy)}px` });
    if (Math.abs(dw) > 1 || Math.abs(dh) > 1) {
      rows.push({ k: 'размер (w/h)', a: `${dw >= 0 ? '+' : ''}${Math.round(dw)}px`, b: `${dh >= 0 ? '+' : ''}${Math.round(dh)}px` });
    }
  }
  if (entry.status === 'missing') rows.push({ k: 'статус', a: 'есть в ref', b: 'нет в target' });
  if (entry.status === 'extra') rows.push({ k: 'статус', a: 'нет в ref', b: 'есть в target' });

  return {
    key: entry.key,
    tag,
    text,
    kind: elementDiffKind(entry),
    rows,
    anchorBox: entry.targetBox ?? entry.refBox,
  };
}

/** Only entries that actually have something to show (a real visual diff, not a same-position/same-style structural match). */
export function isNotableElementDiff(entry: ElementDiffEntry): boolean {
  if (entry.status !== 'matched') return true;
  return entry.styleDeltas.length > 0 || !!entry.geometryDelta?.significant;
}
