// public/kb 의 정적 지식베이스를 내려받아 검색 색인을 만든다.

import { createKnowledgeBase, type KnowledgeBase } from './kb-core';
import type { KbChunk, KbDoc, KbMeta, SymbolRegistry } from './types';

interface DocsFile {
  readonly docs: KbDoc[];
  readonly chunks: KbChunk[];
}

async function fetchJson<T>(path: string, optional = false): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(`${import.meta.env.BASE_URL}${path}`);
  } catch (error) {
    if (optional) return null;
    throw new Error(`지식베이스 파일을 내려받지 못했습니다: ${path} (${error instanceof Error ? error.message : String(error)})`);
  }
  const isJson = (res.headers.get('content-type') ?? '').includes('json');
  if (!res.ok || !isJson) {
    if (optional) return null;
    throw new Error(`지식베이스 파일을 불러오지 못했습니다: ${path} (HTTP ${res.status})`);
  }
  return (await res.json()) as T;
}

/** 과거 공식 답변(qa.json)을 문서 목록 뒤에 이어 붙인다 */
function mergeQa(base: DocsFile, qa: DocsFile | null): DocsFile {
  if (!qa) return base;
  const offset = base.docs.length;
  return {
    docs: [...base.docs, ...qa.docs.map((d) => ({ ...d, i: d.i + offset }))],
    chunks: [...base.chunks, ...qa.chunks.map((c) => ({ ...c, d: c.d + offset }))],
  };
}

let cached: Promise<KnowledgeBase> | null = null;

/** 한 번만 내려받아 색인한다(StrictMode 이중 실행·재마운트 시 재사용). 실패하면 다음 호출에서 재시도. */
export function loadKnowledgeBaseOnce(onProgress?: (message: string) => void): Promise<KnowledgeBase> {
  cached ??= loadKnowledgeBase(onProgress).catch((error: unknown) => {
    cached = null;
    throw error;
  });
  return cached;
}

export async function loadKnowledgeBase(onProgress?: (message: string) => void): Promise<KnowledgeBase> {
  onProgress?.('공식 문서 지식베이스 내려받는 중…');
  const [docsFile, registry, meta, qa] = await Promise.all([
    fetchJson<DocsFile>('kb/docs.json'),
    fetchJson<SymbolRegistry>('kb/symbols.json'),
    fetchJson<KbMeta>('kb/meta.json'),
    fetchJson<DocsFile & { meta?: { threadCount: number } }>('kb/qa.json', true),
  ]);
  if (!docsFile || !registry || !meta) throw new Error('지식베이스 파일이 비어 있습니다.');
  const merged = mergeQa(docsFile, qa);
  onProgress?.(`검색 색인 생성 중… (청크 ${merged.chunks.length.toLocaleString()}개)`);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return createKnowledgeBase(merged.docs, merged.chunks, registry, {
    ...meta,
    qaThreadCount: qa?.meta?.threadCount ?? 0,
  });
}
