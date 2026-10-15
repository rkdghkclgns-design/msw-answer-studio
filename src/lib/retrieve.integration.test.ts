// 실제 크롤링 KB(public/kb)로 검색 품질을 점검하는 통합 테스트. KB가 없으면 건너뛴다.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createKnowledgeBase, type KnowledgeBase } from './kb-core';
import { retrieve } from './retrieve';

const KB_DIR = join(process.cwd(), 'public', 'kb');
const hasKb = existsSync(join(KB_DIR, 'docs.json')) && existsSync(join(KB_DIR, 'symbols.json'));

function loadKb(): KnowledgeBase {
  const { docs, chunks } = JSON.parse(readFileSync(join(KB_DIR, 'docs.json'), 'utf8'));
  const registry = JSON.parse(readFileSync(join(KB_DIR, 'symbols.json'), 'utf8'));
  const meta = JSON.parse(readFileSync(join(KB_DIR, 'meta.json'), 'utf8'));
  return createKnowledgeBase(docs, chunks, registry, meta);
}

describe.skipIf(!hasKb)('retrieve on the real knowledge base', () => {
  const kb = hasKb ? loadKb() : (null as unknown as KnowledgeBase);
  const titles = (queries: string[], identifiers: string[] = []) =>
    retrieve(kb, { queries, identifiers }).map((s) => s.doc.title);

  it('finds the SpawnService reference for a spawn question', () => {
    expect(titles(['몬스터를 스크립트로 스폰하는 방법', 'SpawnByModelId parent'], ['_SpawnService:SpawnByModelId'])).toContain('SpawnService');
  });

  it('finds DataStorage material for a save question', () => {
    const found = titles(['유저 데이터 저장', 'DataStorageService 저장 조회'], ['DataStorageService']);
    expect(found.some((t) => /DataStorage/i.test(t))).toBe(true);
  });

  it('finds orientation docs for a landscape/portrait question', () => {
    const sources = retrieve(kb, { queries: ['월드 화면 방향 가로 세로 Landscape Portrait Responsive'], identifiers: ['WorldOrientation'] });
    expect(sources.some((s) => /Landscape|Portrait|Responsive/.test(s.text))).toBe(true);
  });
});
