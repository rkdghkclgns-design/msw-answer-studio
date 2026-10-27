// 운영 측이 크리에이터에게 배포한 문서(PDF 등, 공개 URL 없음)를 지식베이스 항목으로 변환한다.
// data/distributed/*.json 에 사람이 옮겨 적은 Markdown 과, 공개 API 레퍼런스에 없는 API 의 레지스트리 항목을 둔다.

import { aliasesFor } from './api-parse.mjs';
import { chunkMarkdown } from './chunk.mjs';

const SCOPE_PREFIX = '적용 범위:';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function fail(message) {
  throw new Error(`배포 문서 형식 오류: ${message}`);
}

/** 문서 날짜(YYYY-MM-DD)를 KST 자정 기준 epoch ms 로 */
function kstMidnight(date) {
  return Date.parse(`${date}T00:00:00+09:00`);
}

export function parseDistributedSource(raw) {
  const docs = Array.isArray(raw?.docs) ? raw.docs : fail('docs 배열이 없습니다');
  const ids = new Set();
  for (const d of docs) {
    if (!d.id || !d.title || !d.markdown?.trim()) fail(`id·title·markdown 이 필요합니다 (${d.id ?? d.title ?? '?'})`);
    if (ids.has(d.id)) fail(`중복 id ${d.id}`);
    ids.add(d.id);
    if (!DATE.test(d.date ?? '')) fail(`${d.id}: date 는 YYYY-MM-DD 여야 합니다`);
    // 특정 행사 참여자에게만 해당하는 규칙이 일반 규정처럼 쓰이지 않도록 적용 범위를 반드시 밝힌다
    if (!d.trail?.some((t) => t.startsWith(SCOPE_PREFIX))) fail(`${d.id}: trail 에 "${SCOPE_PREFIX} …" 항목이 필요합니다`);
  }
  const symbols = raw.symbols ?? {};
  for (const [name, s] of Object.entries(symbols)) {
    if (!ids.has(s.doc)) fail(`${name}: 문서 ${s.doc} 가 docs 에 없습니다`);
    if (!s.cat || !Array.isArray(s.members)) fail(`${name}: cat·members 가 필요합니다`);
  }
  return { docs, symbols };
}

/** @returns {{ docs: object[], chunks: object[], types: Record<string, object> }} */
export function buildDistributedEntries(source, startIndex) {
  const indexById = new Map();
  const docs = [];
  const chunks = [];
  for (const d of source.docs) {
    const i = startIndex + docs.length;
    indexById.set(d.id, i);
    docs.push({ i, id: d.id, title: d.title, trail: d.trail, section: 'distributed', url: '', modifiedAt: kstMidnight(d.date) });
    for (const c of chunkMarkdown(d.markdown)) chunks.push({ d: i, h: c.heading, t: c.text });
  }
  const types = Object.fromEntries(
    Object.entries(source.symbols).map(([name, s]) => [
      name,
      { cat: s.cat, doc: indexById.get(s.doc), url: '', summary: s.summary ?? '', aliases: aliasesFor(s.cat, name), members: s.members },
    ]),
  );
  return { docs, chunks, types };
}
