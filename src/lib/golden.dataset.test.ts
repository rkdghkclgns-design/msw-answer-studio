// eval/golden.json 자체의 품질 검사: 형식·개인정보·구성(언어·함정 비율)과, 질문만으로도 근거 문서가 검색되는지.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GoldenItemSchema, validateGoldenSet, type GoldenItem } from './golden';
import { createKnowledgeBase, type KnowledgeBase } from './kb-core';
import { retrieve } from './retrieve';
import type { KbChunk, KbDoc } from './types';

const FILE = join(process.cwd(), 'eval', 'golden.json');
const KB_DIR = join(process.cwd(), 'public', 'kb');
const hasGolden = existsSync(FILE);
const MIN_RETRIEVAL_HIT = 0.7;

function loadKb(): KnowledgeBase {
  const read = <T>(f: string): T => JSON.parse(readFileSync(join(KB_DIR, f), 'utf8')) as T;
  const base = read<{ docs: KbDoc[]; chunks: KbChunk[] }>('docs.json');
  const qa = read<{ docs: KbDoc[]; chunks: KbChunk[] }>('qa.json');
  const offset = base.docs.length;
  return createKnowledgeBase(
    [...base.docs, ...qa.docs.map((d) => ({ ...d, i: d.i + offset }))],
    [...base.chunks, ...qa.chunks.map((c) => ({ ...c, d: c.d + offset }))],
    read('symbols.json'),
    read('meta.json'),
  );
}

describe.skipIf(!hasGolden)('eval/golden.json', () => {
  const raw = hasGolden ? (JSON.parse(readFileSync(FILE, 'utf8')) as unknown[]) : [];
  const items: GoldenItem[] = raw.filter((x) => GoldenItemSchema.safeParse(x).success) as GoldenItem[];

  it('is well-formed, unique and free of personal data', () => {
    expect(validateGoldenSet(raw)).toEqual([]);
  });

  it('has about 100 items in the planned language mix with at least 20 traps', () => {
    const by = (lang: string) => items.filter((it) => it.lang === lang).length;
    expect(items.length).toBeGreaterThanOrEqual(95);
    expect(by('ko')).toBeGreaterThanOrEqual(60);
    expect(by('en')).toBeGreaterThanOrEqual(10);
    expect(by('zh')).toBeGreaterThanOrEqual(10);
    expect(items.filter((it) => it.trap).length).toBeGreaterThanOrEqual(20);
  });

  it(`finds a hinted source for most Korean questions from the question text alone (≥ ${MIN_RETRIEVAL_HIT})`, () => {
    const kb = loadKb();
    const korean = items.filter((it) => it.lang === 'ko' && it.expected.requiredSourceHints?.length);
    const hits = korean.filter((it) => {
      const titles = retrieve(kb, { queries: [it.question], identifiers: [] }, { limit: 12 }).map((s) => s.doc.title.toLowerCase());
      return it.expected.requiredSourceHints!.some((h) => titles.some((t) => t.includes(h.toLowerCase())));
    });
    const rate = hits.length / Math.max(1, korean.length);
    console.info(`[golden retrieval] ko=${korean.length} hit=${hits.length} rate=${rate.toFixed(2)}`);
    expect(rate).toBeGreaterThanOrEqual(MIN_RETRIEVAL_HIT);
  });
});
