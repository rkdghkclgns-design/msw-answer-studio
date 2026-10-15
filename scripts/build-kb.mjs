// data/raw/docs.ko.json → public/kb/{docs,symbols,meta}.json
// docs.json   : 문서 목록 + 검색용 청크
// symbols.json: API 레퍼런스 타입/멤버 레지스트리 (답변 속 식별자 검증용)

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aliasesFor, isApiPage, parseApiPage } from './lib/api-parse.mjs';
import { chunkMarkdown, chunkPolicyText, packParagraphs } from './lib/chunk.mjs';
import { cleanMarkdown } from './lib/html-text.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_FILE = join(ROOT, 'data', 'raw', 'docs.ko.json');
const POLICY_FILE = join(ROOT, 'data', 'raw', 'policies.json');
const POLICY_TRAIL = { legal: ['약관·운영정책'], faq: ['공지·FAQ'], contest: ['글로벌 개발 콘테스트 정책'] };

async function readPolicies() {
  try {
    return JSON.parse(await readFile(POLICY_FILE, 'utf8'));
  } catch {
    console.warn('policies.json 없음 — 약관·정책 문서 없이 빌드합니다 (node scripts/crawl-policies.mjs)');
    return { docs: [], crawledAt: null };
  }
}
const OUT_DIR = join(ROOT, 'public', 'kb');
const MIN_CHUNK_CHARS = 40;

function memberLine(owner, m) {
  const badges = m.b.length ? ` ${m.b.join(' ')}` : '';
  const desc = m.d ? `\n${m.d}` : '';
  return `${owner}.${m.n} — ${m.sig}${badges}${desc}`;
}

function buildApiChunks(post, parsed) {
  const owner = post.title.trim();
  const chunks = [];
  const groups = new Map();
  for (const m of parsed.members) groups.set(m.k, [...(groups.get(m.k) ?? []), m.n]);
  const overview = [
    parsed.summary,
    ...[...groups.entries()].map(([k, names]) => `${k}: ${[...new Set(names)].join(', ')}`),
  ]
    .filter(Boolean)
    .join('\n');
  if (overview) chunks.push({ heading: '개요', text: overview });
  const memberParas = parsed.members.map((m) => memberLine(owner, m));
  for (const text of packParagraphs(memberParas)) chunks.push({ heading: '멤버', text });
  for (const extra of parsed.extras) {
    for (const c of chunkMarkdown(extra.text)) {
      chunks.push({ heading: [extra.heading, c.heading].filter(Boolean).join(' > '), text: c.text });
    }
  }
  return chunks;
}

async function main() {
  const raw = JSON.parse(await readFile(RAW_FILE, 'utf8'));
  const docs = [];
  const chunks = [];
  const types = {};
  let apiPages = 0;

  for (const post of raw.posts) {
    const content = post.content ?? '';
    const docIndex = docs.length;
    const category = post.section === 'apiReference' ? post.trail[0] : null;
    docs.push({
      i: docIndex,
      id: post.id,
      title: post.title.trim(),
      trail: post.trail.map((t) => t.trim()),
      section: post.section,
      url: post.url,
      modifiedAt: post.modifiedAt,
    });

    let docChunks;
    if (post.section === 'apiReference' && isApiPage(content)) {
      apiPages += 1;
      const parsed = parseApiPage(content);
      docChunks = buildApiChunks(post, parsed);
      types[post.title.trim()] = {
        cat: category,
        doc: docIndex,
        url: post.url,
        summary: parsed.summary.slice(0, 300),
        aliases: aliasesFor(category, post.title.trim()),
        members: parsed.members.map((m) => ({ k: m.k, n: m.n, sig: m.sig, b: m.b, d: m.d.slice(0, 400) })),
      };
    } else {
      docChunks = chunkMarkdown(cleanMarkdown(content));
      if (!docChunks.length && post.summary) docChunks = [{ heading: '', text: post.summary }];
    }

    for (const c of docChunks) {
      if (c.text.trim().length < MIN_CHUNK_CHARS && !c.heading) continue;
      chunks.push({ d: docIndex, h: c.heading, t: c.text });
    }
  }

  const policies = await readPolicies();
  for (const p of policies.docs) {
    const docIndex = docs.length;
    docs.push({
      i: docIndex,
      id: p.id,
      title: p.title,
      trail: [...(POLICY_TRAIL[p.kind] ?? ['정책']), p.title],
      section: 'policy',
      url: p.url,
      // 약관·정책 페이지는 개정일을 알 수 없다. 크롤링 시각을 넣으면 이후의 정정 공지보다 최신처럼 보이므로 비워 둔다.
      modifiedAt: null,
    });
    for (const c of chunkPolicyText(p.text)) chunks.push({ d: docIndex, h: c.heading, t: c.text });
  }

  await mkdir(OUT_DIR, { recursive: true });
  const meta = {
    builtAt: new Date().toISOString(),
    crawledAt: raw.crawledAt,
    policyCrawledAt: policies.crawledAt,
    policyDocCount: policies.docs.length,
    source: raw.source,
    docCount: docs.length,
    chunkCount: chunks.length,
    apiTypeCount: Object.keys(types).length,
    apiMemberCount: Object.values(types).reduce((a, t) => a + t.members.length, 0),
  };
  await writeFile(join(OUT_DIR, 'docs.json'), JSON.stringify({ docs, chunks }));
  await writeFile(join(OUT_DIR, 'symbols.json'), JSON.stringify({ types }));
  await writeFile(join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2));
  console.log(meta, `apiPages=${apiPages}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
