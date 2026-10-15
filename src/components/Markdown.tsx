import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useMemo, type MouseEvent } from 'react';
import { linkCitations } from '../lib/answer-format';
import { ALLOWED_ATTR, ALLOWED_TAGS, classifyHref } from '../lib/sanitize';

marked.setOptions({ gfm: true, breaks: true });

// 링크는 인용 앵커와 공식 도메인 https 링크만 남기고, 나머지는 href 를 제거해 텍스트로 둔다.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName !== 'A') return;
  const kind = classifyHref(node.getAttribute('href'));
  if (kind === 'blocked') {
    node.removeAttribute('href');
    node.removeAttribute('target');
    return;
  }
  if (kind === 'external') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

interface Props {
  readonly text: string;
  readonly streaming?: boolean;
  readonly onCitationClick?: (n: number) => void;
}

export function Markdown({ text, streaming = false, onCitationClick }: Props) {
  const html = useMemo(() => {
    const raw = marked.parse(linkCitations(text), { async: false });
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: [...ALLOWED_TAGS],
      ALLOWED_ATTR: [...ALLOWED_ATTR],
      ALLOW_DATA_ATTR: false,
    });
  }, [text]);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest('a[data-src]');
    if (!anchor || !onCitationClick) return;
    event.preventDefault();
    onCitationClick(Number(anchor.getAttribute('data-src')));
  };

  return (
    <div
      className={`markdown${streaming ? ' streaming-cursor' : ''}`}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
