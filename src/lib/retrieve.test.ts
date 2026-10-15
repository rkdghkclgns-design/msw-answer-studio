import { describe, expect, it } from 'vitest';
import { createKnowledgeBase } from './kb-core';
import { pinnedChunkIds, retrieve, rrfFuse } from './retrieve';
import type { KbChunk, KbDoc, SymbolRegistry } from './types';

const doc = (i: number, title: string, section: KbDoc['section'] = 'docs'): KbDoc => ({
  i,
  id: i,
  title,
  trail: [title],
  section,
  url: `https://x/${i}`,
  modifiedAt: null,
});

const docs: KbDoc[] = [
  doc(0, 'SpawnService', 'apiReference'),
  doc(1, '엔티티 스폰하기'),
  doc(2, '데이터 저장소'),
  doc(3, '과거 공식 답변: 스폰 위치', 'qa'),
  doc(4, '과거 공식 답변: 스폰 부모', 'qa'),
  doc(5, '과거 공식 답변: 스폰 이름', 'qa'),
];

const chunks: KbChunk[] = [
  { d: 0, h: '개요', t: '엔티티 스폰 관련 기능을 제공합니다.\nmethod: SpawnByModelId, SpawnByEntity' },
  { d: 0, h: '멤버', t: 'SpawnService.SpawnByModelId — Entity SpawnByModelId(string id, string name, Vector3 spawnPosition, Entity parent)' },
  { d: 1, h: '스폰', t: '모델을 런타임에 스폰하려면 SpawnByModelId 를 사용하고 parent 에 맵 엔티티를 넘깁니다.' },
  { d: 1, h: '위치', t: '스폰 위치는 Vector3 로 지정합니다.' },
  { d: 2, h: '저장', t: 'DataStorageService 로 유저 데이터를 저장합니다.' },
  { d: 3, h: '', t: '스폰 위치 질문에 대한 공식 답변' },
  { d: 4, h: '', t: '스폰 부모 질문에 대한 공식 답변' },
  { d: 5, h: '', t: '스폰 이름 질문에 대한 공식 답변' },
];

const registry: SymbolRegistry = {
  types: {
    SpawnService: {
      cat: 'Services',
      doc: 0,
      url: 'https://x/0',
      summary: '',
      aliases: ['_SpawnService'],
      members: [{ k: 'method', n: 'SpawnByModelId', sig: 'Entity SpawnByModelId(...)', b: [], d: '' }],
    },
  },
};

const kb = createKnowledgeBase(docs, chunks, registry, {
  builtAt: '',
  crawledAt: '',
  docCount: docs.length,
  chunkCount: chunks.length,
  apiTypeCount: 1,
  apiMemberCount: 1,
});

describe('rrfFuse', () => {
  it('rewards ids that rank high in several lists', () => {
    const fused = rrfFuse([
      [{ id: 1, score: 9 }, { id: 2, score: 5 }],
      [{ id: 2, score: 7 }, { id: 3, score: 1 }],
    ]);
    expect(fused[0].id).toBe(2);
    expect(fused.map((h) => h.id).sort()).toEqual([1, 2, 3]);
  });
});

describe('pinnedChunkIds', () => {
  it('pins overview and member chunks for a qualified API identifier', () => {
    expect(pinnedChunkIds(kb, ['_SpawnService:SpawnByModelId'])).toEqual([1, 0]);
  });

  it('pins member chunks when only a member name is given', () => {
    expect(pinnedChunkIds(kb, ['SpawnByModelId'])).toEqual([1]);
  });

  it('ignores unknown identifiers', () => {
    expect(pinnedChunkIds(kb, ['NopeService'])).toEqual([]);
  });
});

describe('retrieve', () => {
  it('returns numbered sources with pinned API chunks first', () => {
    const sources = retrieve(kb, { queries: ['스폰 parent 맵 엔티티'], identifiers: ['_SpawnService:SpawnByModelId'] });
    expect(sources[0]).toMatchObject({ n: 1, chunkId: 1, pinned: true });
    expect(sources.map((s) => s.n)).toEqual(sources.map((_, i) => i + 1));
    expect(sources.some((s) => s.chunkId === 2)).toBe(true);
  });

  it('respects the overall limit and the past-answer cap', () => {
    const sources = retrieve(kb, { queries: ['스폰 공식 답변'], identifiers: [] }, { limit: 4, maxQa: 2 });
    expect(sources.length).toBeLessThanOrEqual(4);
    expect(sources.filter((s) => s.doc.section === 'qa').length).toBeLessThanOrEqual(2);
  });
});
