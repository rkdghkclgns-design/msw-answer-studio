// MSW 크리에이터 센터 공식 문서 크롤러
// 공개 JSON API(mverse-developers-api.nexon.com/v1/bbs)를 BFS로 순회해
// 모든 문서(가이드 · API 레퍼런스 · 리소스)를 data/raw/docs.json 에 저장한다.
//
// 사용법: node scripts/crawl-docs.mjs [--lang ko] [--concurrency 4]

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_BASE = 'https://mverse-developers-api.nexon.com/v1';
const SITE_BASE = 'https://maplestoryworlds-creators.nexon.com';
const ROOTS = [
  { id: 1, section: 'docs', label: '가이드' },
  { id: 2, section: 'apiReference', label: 'API 레퍼런스' },
  { id: 3, section: 'resource', label: '리소스' },
];
const MAX_RETRIES = 4;
const REQUEST_GAP_MS = 120;

const args = parseArgs(process.argv.slice(2));
const LANG = args.lang ?? 'ko';
const CONCURRENCY = Number(args.concurrency ?? 4);
const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = join(ROOT_DIR, 'data', 'raw', `docs.${LANG}.json`);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    if (key) out[key] = argv[i + 1];
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(path) {
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'msw-answer-studio-crawler/1.0' },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (body.code !== 0) throw new Error(`API code ${body.code}: ${body.message}`);
      return body.data;
    } catch (err) {
      lastError = err;
      await sleep(500 * 2 ** attempt);
    }
  }
  throw new Error(`GET ${path} 실패: ${lastError?.message}`);
}

/** 작업 큐를 동시성 제한으로 처리한다. */
async function runPool(items, worker, concurrency) {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
      await sleep(REQUEST_GAP_MS);
    }
  });
  await Promise.all(runners);
  return results;
}

function buildUrl(root, post) {
  if (root.section === 'apiReference') {
    const segments = [...(post.upper ?? []).map((u) => u.urlPath), post.urlPath].filter(Boolean);
    if (segments.length > 1) return `${SITE_BASE}/${LANG}/${segments.join('/')}`;
  }
  return `${SITE_BASE}/${LANG}/${root.section}?postId=${post.id}`;
}

async function crawlTree(root) {
  const nodes = [];
  const queue = [{ id: root.id, trail: [] }];
  const seen = new Set();
  while (queue.length) {
    const batch = queue.splice(0, CONCURRENCY);
    const children = await runPool(batch, (n) => getJson(`/bbs/child/${n.id}/${LANG}`), CONCURRENCY);
    batch.forEach((parent, i) => {
      for (const child of children[i] ?? []) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        const title = child.categoryContent?.title ?? '';
        const trail = [...parent.trail, title];
        nodes.push({
          id: child.id,
          parentId: child.parentId,
          order: child.order,
          title,
          summary: child.categoryContent?.summary ?? '',
          urlPath: child.urlPath ?? null,
          hasChildren: Boolean(child.isExistChild),
          trail,
        });
        if (child.isExistChild) queue.push({ id: child.id, trail });
      }
    });
    process.stdout.write(`\r[${root.section}] 트리 노드 ${nodes.length}개`);
  }
  process.stdout.write('\n');
  return nodes;
}

async function fetchPosts(root, nodes) {
  let done = 0;
  return runPool(
    nodes,
    async (node) => {
      let post = null;
      try {
        post = await getJson(`/bbs/${node.id}/${LANG}`);
      } catch (err) {
        console.warn(`\n  ! 본문 실패 id=${node.id}: ${err.message}`);
      }
      done += 1;
      if (done % 20 === 0 || done === nodes.length) {
        process.stdout.write(`\r[${root.section}] 본문 ${done}/${nodes.length}`);
      }
      const content = post?.content?.content ?? '';
      return {
        ...node,
        section: root.section,
        sectionLabel: root.label,
        url: post ? buildUrl(root, post) : `${SITE_BASE}/${LANG}/${root.section}?postId=${node.id}`,
        breadcrumb: (post?.upper ?? []).map((u) => u.categoryContent?.title).filter(Boolean),
        modifiedAt: post?.content?.modified?.at ?? post?.content?.created?.at ?? null,
        content,
      };
    },
    CONCURRENCY,
  ).finally(() => process.stdout.write('\n'));
}

async function main() {
  const started = Date.now();
  const all = [];
  for (const root of ROOTS) {
    const nodes = await crawlTree(root);
    const posts = await fetchPosts(root, nodes);
    all.push(...posts);
  }
  const withContent = all.filter((p) => p.content.trim().length > 0);
  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(
    OUT_FILE,
    JSON.stringify({ crawledAt: new Date().toISOString(), lang: LANG, source: API_BASE, posts: all }, null, 0),
  );
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`완료: 노드 ${all.length}개 (본문 있음 ${withContent.length}개) → ${OUT_FILE} (${secs}s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
