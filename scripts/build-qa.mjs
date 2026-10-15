// Discord 수집본 → public/kb/qa.json
// - notice: 공식 공지 채널 메시지(공식 계정 글만)
// - qa: 문의 스레드(creation-qa · support)의 공식 답변 + 익명화한 질문 요약
// 크리에이터 닉네임·이메일 등은 싣지 않는다. 원본(data/discord)은 저장소에 커밋하지 않는다.

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packParagraphs, toParagraphs } from './lib/chunk.mjs';
import { channelToEntries } from './lib/channels.mjs';
import { GUILD, isOfficialMessage as isOfficial, TEMPLATE_MESSAGE as TEMPLATE } from './lib/discord.mjs';
import { findPrivateData, sanitizeText as sanitize } from './lib/privacy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'data', 'discord');
const OUT_FILE = join(ROOT, 'public', 'kb', 'qa.json');
const QUESTION_MAX = 600;

/** 채널 Q&A 익명화 분석(channel-qa-analysis-N.json) — id → {title, questionSummary, useful} */
async function readChannelQaAnalysis() {
  const { readdir } = await import('node:fs/promises');
  const files = (await readdir(DIR).catch(() => [])).filter((f) => /^channel-qa-analysis-\d+\.json$/.test(f));
  const map = new Map();
  for (const f of files) for (const item of (await readJson(f))?.items ?? []) map.set(item.id, item);
  return map;
}

/** 분석 결과가 있으면 질문·제목을 익명화 요약으로 바꾸고, 재사용 가치가 없는 답변은 뺀다 */
function applyChannelQaAnalysis(c, item) {
  if (!item) return c;
  if (item.useful === false) return null;
  const answers = c.entry.text.replace(/^질문 요약:[\s\S]*?\n\n(?=\[공식 답변)/, '');
  const restricted = c.entry.trail.some((t) => t.startsWith('적용 범위'));
  const clean = (text) => sanitize(text, { restricted });
  return {
    ...c,
    entry: { ...c.entry, title: clean(item.title || c.entry.title), text: `질문 요약: ${clean(item.questionSummary ?? '')}\n\n${answers}` },
  };
}

/** 서버 전체 채널 수집본(ch-*.json) */
async function readChannels() {
  const { readdir } = await import('node:fs/promises');
  const files = (await readdir(DIR).catch(() => [])).filter((f) => /^ch-\d+\.json$/.test(f));
  const channels = await Promise.all(files.map((f) => readJson(f)));
  return channels.filter(Boolean);
}

/** 배치 분석 결과(익명화된 제목·질문 요약)를 threadId 로 모은다 */
async function readAnalyses() {
  const { readdir } = await import('node:fs/promises');
  const files = (await readdir(DIR).catch(() => [])).filter((f) => /^(support-)?analysis-batch-\d+\.json$/.test(f));
  const map = new Map();
  for (const f of files) {
    const batch = await readJson(f);
    for (const t of batch?.threads ?? []) map.set(t.threadId, t);
  }
  return map;
}

async function readJson(name) {
  try {
    return JSON.parse(await readFile(join(DIR, name), 'utf8'));
  } catch {
    return null;
  }
}


function threadUrl(channelOrThreadId, messageId) {
  return `https://discord.com/channels/${GUILD}/${channelOrThreadId}${messageId ? `/${messageId}` : ''}`;
}

function buildNoticeDocs(notice, channelLabel) {
  const thread = notice?.threads?.[0];
  if (!thread) return [];
  return thread.messages
    .filter((m) => m.role === 'official' && m.text.trim().length > 40)
    .map((m) => {
      const text = sanitize(m.text);
      const title = text.split('\n')[0].slice(0, 80);
      return { id: `notice-${m.mid}`, title, trail: ['Discord 공식 공지', channelLabel], url: threadUrl(thread.threadId, m.mid), date: m.t, text };
    });
}

function buildQaDoc(thread, channelLabel, summary) {
  const messages = thread.messages.filter((m) => !TEMPLATE.test(m.text) && m.text.trim());
  const starterWho = messages.find((m) => m.role !== 'official')?.who;
  const answers = messages.filter((m) => isOfficial(m, starterWho));
  if (!answers.length) return null;
  const firstQuestion = messages.find((m) => !isOfficial(m, starterWho));
  const question = sanitize(summary?.questionSummary ?? firstQuestion?.text ?? '').slice(0, QUESTION_MAX);
  const answerText = answers.map((a) => `[공식 답변 ${a.t?.slice(0, 10) ?? ''}]\n${sanitize(a.text)}`).join('\n\n');
  const rawTitle = thread.title.replace(/^.*?"(.*)".*$/, '$1');
  // 익명화로 제목이 '[월드명]' 같은 자리표시자만 남으면 분석의 소주제를 제목으로 쓴다
  const anonTitle = summary?.title ?? rawTitle;
  const placeholderOnly = /^[\s[\]\w가-힣]*$/.test(anonTitle) && anonTitle.replace(/\[[^\]]*\]/g, '').trim().length < 2;
  return {
    id: `qa-${thread.threadId}`,
    title: sanitize(placeholderOnly && summary?.subTopic ? summary.subTopic : anonTitle).slice(0, 100),
    trail: ['Discord 과거 공식 답변', channelLabel],
    url: threadUrl(thread.threadId),
    date: answers.at(-1)?.t ?? null,
    text: `질문 요약: ${question}\n\n${answerText}`,
  };
}

function toKb(entries, section) {
  return entries.map((e) => ({
    doc: { id: e.id, title: e.title, trail: e.trail, section, url: e.url, modifiedAt: e.date ? Date.parse(e.date) : null },
    chunks: packParagraphs(toParagraphs(e.text)).map((t, i) => ({ h: i === 0 ? '' : '(이어서)', t })),
  }));
}

async function main() {
  const creation = await readJson('threads.json');
  const support = await readJson('support-threads.json');
  const aiNotice = await readJson('ai-toolkit-notice.json');
  const summaries = await readAnalyses();

  const channels = await readChannels();
  const channelQaAnalysis = await readChannelQaAnalysis();
  const fromChannels = channels
    .flatMap((ch) => channelToEntries(ch, sanitize))
    .map((c) => (c.section === 'qa' ? applyChannelQaAnalysis(c, channelQaAnalysis.get(c.entry.id)) : c))
    .filter(Boolean);
  const unique = (entries) => [...new Map(entries.map((e) => [e.id, e])).values()];

  const qaEntries = unique([
    ...(creation?.threads ?? []).map((t) => buildQaDoc(t, 'creation-qa · 개발문의', summaries.get(t.threadId))),
    ...(support?.threads ?? []).map((t) => buildQaDoc(t, 'support · 문의', summaries.get(t.threadId))),
    ...fromChannels.filter((c) => c.section === 'qa').map((c) => c.entry),
  ].filter(Boolean));
  const noticeEntries = unique([
    ...buildNoticeDocs(aiNotice, 'ai-toolkit-공지'),
    ...fromChannels.filter((c) => c.section === 'notice').map((c) => c.entry),
  ]);

  const items = [...toKb(noticeEntries, 'notice'), ...toKb(qaEntries, 'qa')];
  const docs = items.map((it, i) => ({ ...it.doc, i }));
  const chunks = items.flatMap((it, i) => it.chunks.map((c) => ({ d: i, h: c.h, t: c.t })));
  const leaks = [...docs.map((d) => d.title), ...chunks.map((c) => c.t)].flatMap(findPrivateData);
  // 발견한 원문은 로그에 남기지 않고 종류만 알린다
  if (leaks.length) throw new Error(`개인정보·비공개 링크 ${leaks.length}건이 남아 있어 qa.json 을 쓰지 않습니다: ${[...new Set(leaks.map((l) => l.kind))].join(', ')}`);
  const meta = {
    builtAt: new Date().toISOString(),
    threadCount: qaEntries.length,
    noticeCount: noticeEntries.length,
    sources: {
      creationQa: creation?.threads?.length ?? 0,
      support: support?.threads?.length ?? 0,
      supportPartial: Boolean(support?.partial),
      channels: channels.length,
    },
  };
  await writeFile(OUT_FILE, JSON.stringify({ meta, docs, chunks }));
  console.log(meta, `chunks=${chunks.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
