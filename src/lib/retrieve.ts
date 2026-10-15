// 다중 쿼리 BM25 + RRF 융합 + API 식별자 핀 고정으로 답변 근거(출처)를 고른다.

import { search, type Hit } from './bm25';
import type { KnowledgeBase } from './kb-core';
import type { Source } from './types';

const RRF_K = 60;
const HITS_PER_QUERY = 40;
const MAX_OWNER_PINS = 2;

export interface RetrieveRequest {
  readonly queries: readonly string[];
  readonly identifiers: readonly string[];
}

export interface RetrieveOptions {
  readonly limit?: number;
  readonly perDoc?: number;
  readonly maxQa?: number;
  readonly maxPinned?: number;
}

export function rrfFuse(lists: readonly (readonly Hit[])[]): Hit[] {
  const scores = new Map<number, number>();
  for (const list of lists) {
    list.forEach((hit, rank) => scores.set(hit.id, (scores.get(hit.id) ?? 0) + 1 / (RRF_K + rank + 1)));
  }
  return [...scores.entries()].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
}

function findMemberChunk(kb: KnowledgeBase, ids: readonly number[], owner: string, member: string): number | undefined {
  const marker = `${owner}.${member} —`;
  return ids.find((id) => kb.chunks[id].t.includes(marker));
}

/** 질문 분석에서 나온 API 식별자에 해당하는 레퍼런스 청크(멤버 → 개요 순) */
export function pinnedChunkIds(kb: KnowledgeBase, identifiers: readonly string[]): number[] {
  const out: number[] = [];
  const add = (id: number | undefined) => {
    if (id !== undefined && !out.includes(id)) out.push(id);
  };
  for (const raw of identifiers) {
    const [left, right] = raw.trim().split(/[:.]/);
    if (!left) continue;
    const typeName = kb.lookup.resolveType(left);
    if (typeName) {
      const ids = kb.chunksByDoc.get(kb.registry.types[typeName].doc) ?? [];
      if (right) add(findMemberChunk(kb, ids, typeName, right));
      add(ids.find((id) => kb.chunks[id].h === '개요'));
      continue;
    }
    for (const owner of (kb.memberOwners.get(left.replace(/^_+/, '')) ?? []).slice(0, MAX_OWNER_PINS)) {
      const ids = kb.chunksByDoc.get(kb.registry.types[owner].doc) ?? [];
      add(findMemberChunk(kb, ids, owner, left.replace(/^_+/, '')));
    }
  }
  return out;
}

export function retrieve(kb: KnowledgeBase, request: RetrieveRequest, options: RetrieveOptions = {}): Source[] {
  // 식별자 하나당 멤버+개요 2개가 고정되므로, 3개 식별자까지 고정되도록 6
  const { limit = 10, perDoc = 3, maxQa = 2, maxPinned = 6 } = options;
  const fused = rrfFuse(request.queries.filter((q) => q.trim()).map((q) => search(kb.index, q, HITS_PER_QUERY)));
  const pinned = pinnedChunkIds(kb, request.identifiers).slice(0, maxPinned);

  const picked: { id: number; score: number; pinned: boolean }[] = [];
  const perDocCount = new Map<number, number>();
  let qaCount = 0;
  const tryAdd = (id: number, score: number, isPinned: boolean) => {
    if (picked.length >= limit || picked.some((p) => p.id === id)) return;
    const chunk = kb.chunks[id];
    if ((perDocCount.get(chunk.d) ?? 0) >= perDoc) return;
    const isQa = kb.docs[chunk.d].section === 'qa';
    if (isQa && qaCount >= maxQa) return;
    if (isQa) qaCount += 1;
    perDocCount.set(chunk.d, (perDocCount.get(chunk.d) ?? 0) + 1);
    picked.push({ id, score, pinned: isPinned });
  };
  pinned.forEach((id) => tryAdd(id, 1, true));
  fused.forEach((hit) => tryAdd(hit.id, hit.score, false));

  return picked.map((p, i) => {
    const chunk = kb.chunks[p.id];
    return {
      n: i + 1,
      chunkId: p.id,
      doc: kb.docs[chunk.d],
      heading: chunk.h,
      text: chunk.t,
      score: p.score,
      pinned: p.pinned,
    };
  });
}
