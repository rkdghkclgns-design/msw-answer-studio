// 크롤링한 문서 본문(Markdown + 인라인 HTML)을 검색·인용용 텍스트로 정제하는 유틸.

const SITE = 'https://maplestoryworlds-creators.nexon.com';

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  middot: '·',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  bull: '•',
  times: '×',
  rarr: '→',
  larr: '←',
  copy: '©',
  reg: '®',
  trade: '™',
};

export function decodeEntities(text) {
  return text
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

/** shields.io 배지 이미지 → [ServerOnly] 같은 태그 문자열 */
export function badgeOf(imgTag) {
  const msg = /message=([^&"\s]+)/.exec(imgTag)?.[1];
  if (!msg) return '';
  const label = /label=([^&"\s]*)/.exec(imgTag)?.[1];
  return label ? `[${decodeURIComponent(label)}:${decodeURIComponent(msg)}]` : `[${decodeURIComponent(msg)}]`;
}

export function extractBadges(html) {
  return [...html.matchAll(/<img[^>]*>/g)].map((m) => badgeOf(m[0])).filter(Boolean);
}

/** 인라인 HTML 조각을 평문으로 */
export function htmlToText(html) {
  const text = html
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<img[^>]*>/g, (tag) => {
      const badge = badgeOf(tag);
      return badge ? ` ${badge}` : '';
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h\d|ul|ol)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/t[hd]>/gi, ' | ')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text)
    .replace(/[ \t ]+/g, ' ')
    .replace(/ \|\s*$/gm, '')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** <table> 블록을 행 배열(셀 텍스트 배열)로 파싱 */
export function parseTable(tableHtml) {
  const rows = [];
  for (const tr of tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr[1].matchAll(/<(th|td)[^>]*>([\s\S]*?)<\/\1>/g)].map((c) => ({
      tag: c[1],
      html: c[2],
      text: htmlToText(c[2]),
    }));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function absolutize(url) {
  const clean = url.replace(/\{"target":"_(blank|self)"\}/g, '').trim();
  if (/^https?:/i.test(clean)) return clean.replace('mod-developers.nexon.com', 'maplestoryworlds-creators.nexon.com/ko');
  if (clean.startsWith('/')) return `${SITE}/ko${clean}`;
  return clean;
}

/** 가이드 Markdown 정제: 링크 절대화, 이미지/임베드 제거, HTML 표·목록을 텍스트로 */
export function cleanMarkdown(md) {
  return md
    .replace(/^\[comment\]: #.*$/gm, '')
    .replace(/\$\$childList[\s\S]*?\$\$/g, '')
    .replace(/\$\$youtube\s*\n?\s*\/?([\w-]+)[\s\S]*?\$\$/g, (_, id) => `(영상: https://youtu.be/${id})`)
    .replace(/\$\$[\s\S]*?\$\$/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => `[${text}](${absolutize(url)})`)
    .replace(/<table[\s\S]*?<\/table>/gi, (t) =>
      parseTable(t)
        .map((row) => row.map((c) => c.text.replace(/\n+/g, ' ')).join(' | '))
        .join('\n'),
    )
    .replace(/<[^>\n]+>/g, (tag) => (/^<br/i.test(tag) ? '\n' : /^<li/i.test(tag) ? '\n- ' : badgeOf(tag)))
    .replace(/\*\*\*\s*$/gm, '')
    .split('\n')
    .map((line) => decodeEntities(line).replace(/[ \t ]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
