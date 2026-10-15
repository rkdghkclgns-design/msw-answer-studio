// 약관·운영정책·FAQ·콘테스트 정책 페이지 크롤러 → data/raw/policies.json
// - maplestoryworlds.nexon.com: SSR HTML의 페이로드에서 본문 HTML 문자열 리터럴만 꺼낸다(원격 JS 실행 없음)
// - guide.nexon.com: 공개 JSON API(/apis/pages/{id})
// 사용법: node scripts/crawl-policies.mjs

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlToText } from './lib/html-text.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = join(ROOT, 'data', 'raw', 'policies.json');
const MSW = 'https://maplestoryworlds.nexon.com';
const GUIDE = 'https://guide.nexon.com';
const MIN_CONTENT_CHARS = 200;

const LEGAL = [
  ['tos', 735, 'Toben Studio 이용약관'],
  ['tos', 736, '크리에이터 이용약관'],
  ['tos', 734, '개인정보처리방침'],
  ['tos', 992, '콘텐츠 제작의 IP 사용 가이드'],
  ['tos', 1022, '생성형 AI를 활용한 CGC 제작 가이드'],
  ['policy', 698, '플랫폼 운영정책'],
  ['policy', 699, '크리에이터 운영정책'],
  ['policy', 700, '커뮤니티 운영정책'],
  ['policy', 742, '청소년보호정책'],
  ['policy', 1021, '권리침해신고 안내'],
  ['policy', 1089, '오리지널 월드 운영정책'],
];

const CONTEST_PAGES = [
  [2494, 'ko', '글로벌 개발 콘테스트 2026 공모전 정책', 'kr'],
  [2495, 'en', 'GLOBAL CREATOR CHALLENGE 2026 POLICY', 'en'],
  [2498, 'zh', '全球開發競賽2026競賽活動政策', 'tw'],
];

const FAQ_POSTS = [['/ko/community/5005/2120/3443627', '메이플스토리 월드 FAQ']];

async function getText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'msw-answer-studio-crawler/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

/** JS 문자열 리터럴 본문을 실행 없이 해석 */
function unescapeJsString(literal) {
  const jsonSafe = literal.replace(/\\'/g, "'").replace(/\\x([0-9a-fA-F]{2})/g, '\\u00$1');
  return JSON.parse(`"${jsonSafe}"`);
}

/** SSR HTML의 스크립트에서 HTML 마크업을 담은 가장 긴 문자열 리터럴을 본문으로 간주 */
export function extractLongestHtmlLiteral(html) {
  let best = '';
  for (const script of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
    for (const m of script[1].matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) {
      // Nuxt 페이로드는 '<' 를 < 로 이스케이프한다
      if (m[1].length <= best.length || !/(<|\\u003C)(p|div|h\d|table|li|span)\b/i.test(m[1])) continue;
      try {
        const value = unescapeJsString(m[1]);
        if (value.length > best.length) best = value;
      } catch {
        // 해석 불가 리터럴은 건너뜀
      }
    }
  }
  return best;
}

async function crawlMswPage(path, title, kind) {
  const url = `${MSW}${path}`;
  const html = await getText(url);
  const text = htmlToText(extractLongestHtmlLiteral(html));
  if (text.length < MIN_CONTENT_CHARS) throw new Error(`본문 추출 실패: ${url}`);
  return { id: path, title, kind, lang: 'ko', url, text };
}

async function crawlContest([id, lang, title, tag]) {
  const page = JSON.parse(await getText(`${GUIDE}/apis/pages/${id}?language=ko`));
  const text = htmlToText(page.contents ?? '');
  if (text.length < MIN_CONTENT_CHARS) throw new Error(`콘테스트 정책 본문 없음: ${id}`);
  return {
    id: `guide-${id}`,
    title: page.title || title,
    kind: 'contest',
    lang,
    url: `${GUIDE}/ko/game/maplestoryworlds/guides/globalcreatorchallenge/pages/${tag}`,
    text,
  };
}

async function main() {
  const docs = [];
  const failures = [];
  const attempt = async (label, fn) => {
    try {
      const doc = await fn();
      docs.push(doc);
      console.log(`✓ ${label} (${doc.text.length.toLocaleString()}자)`);
    } catch (err) {
      failures.push(`${label}: ${err.message}`);
      console.warn(`✗ ${label}: ${err.message}`);
    }
  };
  for (const [type, id, title] of LEGAL) await attempt(title, () => crawlMswPage(`/ko/legal/${type}/${id}`, title, 'legal'));
  for (const [path, title] of FAQ_POSTS) await attempt(title, () => crawlMswPage(path, title, 'faq'));
  for (const page of CONTEST_PAGES) await attempt(page[2], () => crawlContest(page));
  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify({ crawledAt: new Date().toISOString(), docs, failures }, null, 1));
  console.log(`완료: ${docs.length}건, 실패 ${failures.length}건 → ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
