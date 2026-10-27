// 하위 질문별 검색 결과 병합과 프롬프트용 출처 직렬화

import type { KbDoc, Source } from './types';

const KIND_LABELS: Readonly<Record<KbDoc['section'], string>> = {
  apiReference: 'API 레퍼런스',
  docs: '공식 가이드',
  resource: '공식 리소스/강좌',
  policy: '약관·정책·FAQ',
  notice: '공식 공지',
  qa: '과거 공식 답변',
  distributed: '운영 배포 문서',
};

export function sourceKindLabel(doc: KbDoc): string {
  return KIND_LABELS[doc.section];
}

/** 여러 검색 결과를 번갈아 섞어(round-robin) 중복 없이 합치고 번호를 다시 매긴다 */
export function mergeSourceLists(lists: readonly (readonly Source[])[], limit: number): Source[] {
  const out: Source[] = [];
  const seen = new Set<number>();
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let rank = 0; rank < longest && out.length < limit; rank += 1) {
    for (const list of lists) {
      const s = list[rank];
      if (!s || seen.has(s.chunkId) || out.length >= limit) continue;
      seen.add(s.chunkId);
      out.push({ ...s, n: out.length + 1 });
    }
  }
  return out;
}

const attr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const PROMPT_TAGS = /<(\/?)\s*(sources?|question|answer|draft_answer|issues|analysis|fact_sentences|ops_notes)\b/gi;

/** 신뢰할 수 없는 텍스트 안의 프롬프트 구분 태그를 무력화한다(＜ 로 바꿔 태그로 읽히지 않게). */
export function neutralizePromptTags(text: string): string {
  return text.replace(PROMPT_TAGS, (_, slash: string, name: string) => `＜${slash}${name}`);
}

/** 프롬프트의 오늘 날짜(KST)와 같은 기준으로 맞춘다 */
function dateLabel(ms: number | null): string {
  return ms ? new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 10) : '';
}

export function formatSourcesForPrompt(sources: readonly Source[]): string {
  return sources
    .map((s) => {
      const attrs = [
        `n="${s.n}"`,
        `kind="${sourceKindLabel(s.doc)}"`,
        `title="${attr(s.doc.title)}"`,
        `path="${attr(s.doc.trail.join(' > '))}"`,
        s.heading && `section="${attr(s.heading)}"`,
        s.doc.modifiedAt && `date="${dateLabel(s.doc.modifiedAt)}"`,
        s.doc.url && `url="${attr(s.doc.url)}"`,
      ].filter(Boolean);
      return `<source ${attrs.join(' ')}>\n${neutralizePromptTags(s.text)}\n</source>`;
    })
    .join('\n\n');
}
