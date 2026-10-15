// 지식베이스 조립(순수 함수). 네트워크 로딩은 kb.ts 가 담당한다.

import { buildIndex, type Bm25Index } from './bm25';
import { createSymbolLookup, type SymbolLookup } from './symbols';
import type { KbChunk, KbDoc, KbMeta, SymbolRegistry } from './types';

export interface KnowledgeBase {
  readonly docs: readonly KbDoc[];
  readonly chunks: readonly KbChunk[];
  readonly registry: SymbolRegistry;
  readonly lookup: SymbolLookup;
  readonly index: Bm25Index;
  readonly chunksByDoc: ReadonlyMap<number, readonly number[]>;
  /** 멤버 이름 → 그 멤버를 가진 타입들 */
  readonly memberOwners: ReadonlyMap<string, readonly string[]>;
  readonly meta: KbMeta;
}

export function chunkSearchText(doc: KbDoc, chunk: KbChunk): string {
  return `${doc.title} ${doc.title} ${doc.trail.join(' ')} ${chunk.h}\n${chunk.t}`;
}

export function createKnowledgeBase(
  docs: readonly KbDoc[],
  chunks: readonly KbChunk[],
  registry: SymbolRegistry,
  meta: KbMeta,
): KnowledgeBase {
  const chunksByDoc = new Map<number, number[]>();
  chunks.forEach((c, id) => chunksByDoc.set(c.d, [...(chunksByDoc.get(c.d) ?? []), id]));
  const memberOwners = new Map<string, string[]>();
  for (const [typeName, type] of Object.entries(registry.types)) {
    for (const name of new Set(type.members.map((m) => m.n))) {
      memberOwners.set(name, [...(memberOwners.get(name) ?? []), typeName]);
    }
  }
  return {
    docs,
    chunks,
    registry,
    lookup: createSymbolLookup(registry),
    index: buildIndex(chunks.map((c) => chunkSearchText(docs[c.d], c))),
    chunksByDoc,
    memberOwners,
    meta,
  };
}
