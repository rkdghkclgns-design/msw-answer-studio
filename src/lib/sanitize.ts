// 모델 출력 HTML 정화 규칙 (DOMPurify 설정) — 모델 출력과 지식베이스 텍스트는 신뢰하지 않는 입력으로 다룬다.

export const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'del', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li', 'a', 'sup', 'h1', 'h2', 'h3', 'h4',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
] as const;

export const ALLOWED_ATTR = ['href', 'data-src', 'class', 'target', 'rel'] as const;

/** 답변 링크로 허용하는 공식 도메인 (출처 URL 이 속한 도메인) */
const ALLOWED_LINK_HOSTS = [
  'maplestoryworlds-creators.nexon.com',
  'maplestoryworlds.nexon.com',
  'guide.nexon.com',
  'discord.com',
  'youtu.be',
  'www.youtube.com',
  'youtube.com',
];

export type LinkKind = 'citation' | 'external' | 'blocked';

/** href 를 인용 앵커 / 허용 외부 링크 / 차단으로 분류 */
export function classifyHref(href: string | null): LinkKind {
  if (!href) return 'blocked';
  const trimmed = href.trim();
  if (/^#src-\d+$/.test(trimmed)) return 'citation';
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:') return 'blocked';
    return ALLOWED_LINK_HOSTS.includes(url.hostname.toLowerCase()) ? 'external' : 'blocked';
  } catch {
    return 'blocked';
  }
}
