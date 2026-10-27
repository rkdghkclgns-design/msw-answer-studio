// 답변 Markdown 후처리: 화면용 인용 링크, Discord 게시용 변환

import { CITATION_GROUP, extractCitationNumbers } from './citations';
import type { Source } from './types';

const PROTECTED = /```[\s\S]*?```|`[^`\n]*`|\[[^\]]*\]\([^)]*\)/g;
const HAS_REFERENCE_SECTION = /^\**\s*(참고 자료|References?|參考資料)\s*\**\s*$/im;

/** 코드·링크 영역을 건드리지 않고 나머지 텍스트에만 변환을 적용 */
function mapUnprotected(md: string, fn: (text: string) => string): string {
  let out = '';
  let last = 0;
  for (const m of md.matchAll(PROTECTED)) {
    out += fn(md.slice(last, m.index)) + m[0];
    last = (m.index ?? 0) + m[0].length;
  }
  return out + fn(md.slice(last));
}

export function linkCitations(md: string): string {
  return mapUnprotected(md, (text) =>
    text.replace(CITATION_GROUP, (raw) => {
      const links = extractCitationNumbers(raw).map((n) => `<a href="#src-${n}" data-src="${n}">${n}</a>`);
      return links.length ? `<sup class="cite">${links.join(',')}</sup>` : raw;
    }),
  );
}

/** 인용 번호를 지우고, 답변에 참고 자료 섹션이 없으면 실제로 인용된 문서 링크 목록을 붙인 Discord 게시용 텍스트 */
export function toDiscordPost(answer: string, sources: readonly Source[]): string {
  const cited = extractCitationNumbers(answer);
  const body = mapUnprotected(answer, (text) => text.replace(new RegExp(`\\s?${CITATION_GROUP.source}`, 'g'), ''))
    .replace(/[ \t]+([.,!?。])/g, '$1')
    .trim();
  if (HAS_REFERENCE_SECTION.test(body)) return body;
  const seen = new Set<string>();
  // 운영 배포 문서는 링크가 없으므로 제목으로 중복을 거른다
  const key = (s: Source) => s.doc.url || `title:${s.doc.title}`;
  const refs = cited
    .map((n) => sources.find((s) => s.n === n))
    .filter((s): s is Source => Boolean(s))
    .filter((s) => (seen.has(key(s)) ? false : (seen.add(key(s)), true)))
    .map((s) => (s.doc.url ? `- ${s.doc.title}: <${s.doc.url}>` : `- ${s.doc.title} (운영 배포 문서)`));
  return refs.length ? `${body}\n\n📎 참고 문서\n${refs.join('\n')}` : body;
}
