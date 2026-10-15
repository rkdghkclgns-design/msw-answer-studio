// 최소 BM25 역색인. 브라우저에서 수천 개 청크를 수백 ms 안에 색인/검색한다.

import { tokenize } from './tokenize';

const K1 = 1.2;
const B = 0.75;

export interface Bm25Index {
  readonly docCount: number;
  readonly avgDocLength: number;
  readonly docLengths: Uint32Array;
  readonly postings: ReadonlyMap<string, ReadonlyArray<readonly [number, number]>>;
}

export interface Hit {
  readonly id: number;
  readonly score: number;
}

function termFrequencies(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

export function buildIndex(texts: readonly string[]): Bm25Index {
  const postings = new Map<string, Array<readonly [number, number]>>();
  const docLengths = new Uint32Array(texts.length);
  let total = 0;
  texts.forEach((text, id) => {
    const tokens = tokenize(text);
    docLengths[id] = tokens.length;
    total += tokens.length;
    for (const [term, tf] of termFrequencies(tokens)) {
      const list = postings.get(term);
      if (list) list.push([id, tf]);
      else postings.set(term, [[id, tf]]);
    }
  });
  return {
    docCount: texts.length,
    avgDocLength: texts.length ? total / texts.length : 0,
    docLengths,
    postings,
  };
}

export function search(index: Bm25Index, query: string, k = 20): Hit[] {
  const scores = new Map<number, number>();
  const terms = new Set(tokenize(query));
  for (const term of terms) {
    const list = index.postings.get(term);
    if (!list) continue;
    const idf = Math.log(1 + (index.docCount - list.length + 0.5) / (list.length + 0.5));
    for (const [id, tf] of list) {
      const norm = 1 - B + (B * index.docLengths[id]) / (index.avgDocLength || 1);
      const s = idf * ((tf * (K1 + 1)) / (tf + K1 * norm));
      scores.set(id, (scores.get(id) ?? 0) + s);
    }
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
