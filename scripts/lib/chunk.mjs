// 정제된 문서 텍스트를 검색 단위(청크)로 분할한다. 코드 펜스는 쪼개지 않는다.

export const CHUNK_TARGET = 1100;
export const CHUNK_MAX = 1800;

/** 빈 줄 기준 문단 분할 (``` 코드 블록은 하나의 문단으로 유지) */
export function toParagraphs(text) {
  const lines = text.split('\n');
  const paras = [];
  let buf = [];
  let inFence = false;
  const flush = () => {
    const p = buf.join('\n').trim();
    if (p) paras.push(p);
    buf = [];
  };
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (!inFence) flush();
      inFence = !inFence;
      buf.push(line);
      if (!inFence) flush();
      continue;
    }
    if (!inFence && line.trim() === '') {
      flush();
      continue;
    }
    buf.push(line);
  }
  flush();
  return paras;
}

/** 아주 긴 문단(대형 코드·표)은 줄 단위로 잘라 CHUNK_MAX 이하로 만든다 */
function splitOversized(para) {
  if (para.length <= CHUNK_MAX) return [para];
  const out = [];
  let cur = '';
  for (const line of para.split('\n')) {
    if (cur.length + line.length + 1 > CHUNK_MAX && cur) {
      out.push(cur);
      cur = '';
    }
    cur += (cur ? '\n' : '') + line;
  }
  if (cur) out.push(cur);
  return out;
}

/** 문단 배열을 목표 크기 청크로 묶는다 */
export function packParagraphs(paras) {
  const chunks = [];
  let cur = '';
  for (const para of paras.flatMap(splitOversized)) {
    if (cur && cur.length + para.length + 2 > CHUNK_TARGET) {
      chunks.push(cur);
      cur = '';
    }
    cur += (cur ? '\n\n' : '') + para;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

// 약관·정책 문서의 조항 머리줄: 제16조 / 16. 제목 / 6. 제목. 본문… / [4-2-1] / Article 5 / 第5條 / ■ 제목
const MAX_HEADING = 60;
const HEADING_RULES = [
  (l) => /^\s*(제\s*\d+\s*조(\s*\([^)]{0,30}\))?)/.exec(l)?.[1],
  (l) => {
    const m = /^\s*(\d{1,2})\.\s+([^.\n]{1,40}?)\.\s/.exec(l);
    return m ? `${m[1]}. ${m[2].trim()}` : undefined;
  },
  (l) => (/^\s*\d{1,2}\.\s+\S.{0,40}$/.test(l) ? l.trim() : undefined),
  (l) => /^\s*(\[\d+(?:-\d+)*\][^\n]{0,40})/.exec(l)?.[1],
  (l) => /^\s*((?:Article|Section)\s+\d+[^\n]{0,40})/i.exec(l)?.[1],
  (l) => /^\s*(第\s*[\d一二三四五六七八九十]+\s*[條条章][^\n]{0,30})/.exec(l)?.[1],
  (l) => /^\s*([■▶◆]\s*[^\n]{1,40})/.exec(l)?.[1],
  // 콘테스트 정책처럼 짧은 항목줄/단독줄이 소제목인 문서: "- 신규 공개 출시", "본선 진출"
  (l) => /^\s*-\s+([^.\n:：。"“]{2,24})\s*$/.exec(l)?.[1],
  (l) => /^\s*([^\s\-(①-⑳\d][^.\n:：。,"“]{1,16})\s*$/.exec(l)?.[1],
];

function articleHeading(line) {
  for (const rule of HEADING_RULES) {
    const h = rule(line);
    if (h) return h.trim().slice(0, MAX_HEADING);
  }
  return undefined;
}

/** 약관·정책 평문을 조항 단위로 나눠 청크화. heading 은 해당 조항 머리줄. */
export function chunkPolicyText(text) {
  const sections = [];
  let heading = '';
  let body = [];
  const flush = () => {
    const t = body.join('\n').trim();
    if (t) sections.push({ heading, text: t });
    body = [];
  };
  for (const line of text.split('\n')) {
    const next = articleHeading(line);
    if (next) {
      flush();
      heading = next;
    }
    body.push(line);
  }
  flush();
  return sections.flatMap((s) =>
    packParagraphs(s.text.split('\n').filter((l) => l.trim())).map((t) => ({ heading: s.heading, text: t })),
  );
}

/** Markdown 을 제목(#) 단위 섹션으로 나눈 뒤 청크화. heading 은 상위 제목 경로. */
export function chunkMarkdown(md) {
  const sections = [];
  const path = [];
  let body = [];
  let inFence = false;
  const flush = () => {
    const text = body.join('\n').trim();
    if (text) sections.push({ heading: path.filter(Boolean).join(' > '), text });
    body = [];
  };
  for (const line of md.split('\n')) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const m = !inFence && /^(#{1,4})\s+(.+?)\s*#*$/.exec(line);
    if (m) {
      flush();
      const level = m[1].length;
      path.length = level - 1;
      path[level - 1] = m[2].replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim();
      continue;
    }
    body.push(line);
  }
  flush();
  return sections.flatMap((s) => packParagraphs(toParagraphs(s.text)).map((text) => ({ heading: s.heading, text })));
}
