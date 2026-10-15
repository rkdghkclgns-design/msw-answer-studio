// data/discord/threads.json(브라우저 수집 원본) → 정규화 + 통계
// - 스레드 생성 시 자동 게시되는 '문의 양식' 메시지 제거
// - 공식 답변 인사말로 시작하는데 크리에이터로 분류된 메시지 보정
// - 분석용 배치 파일(batch-N.json)과 통계(stats.json) 생성
// 원본에는 사용자 글이 포함되므로 data/discord 는 저장소에 커밋하지 않는다(.gitignore).

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OFFICIAL_GREETING, TEMPLATE_MESSAGE as TEMPLATE_START } from './lib/discord.mjs';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'discord');
const BATCHES = Number(process.argv[2] ?? 4);
const INPUT = process.argv[3] ?? 'threads.json';
const PREFIX = process.argv[4] ?? '';


function detectLang(text) {
  const hangul = (text.match(/[가-힣]/g) ?? []).length;
  const han = (text.match(/[一-鿿]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  if (hangul >= han && hangul * 2 >= latin * 0.5 && hangul > 0) return 'ko';
  if (han > hangul && han * 2 >= latin * 0.3) return 'zh';
  return 'en';
}

/** Discord 렌더링 잔재(목록 구분 쉼표 줄 등) 정리 */
function tidy(text) {
  return text
    .replace(/^\s*,\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeThread(thread) {
  const messages = thread.messages
    .filter((m) => !TEMPLATE_START.test(m.text))
    .map((m) => {
      const text = tidy(m.text);
      const role = m.role === 'official' || OFFICIAL_GREETING.test(text) ? 'official' : 'creator';
      return { role, t: m.t, text, images: m.images, files: m.files, replyTo: m.replyTo ? tidy(m.replyTo) : null };
    })
    .filter((m) => m.text || m.images || m.files?.length);
  const firstQuestion = messages.find((m) => m.role === 'creator');
  const firstAnswer = messages.find((m) => m.role === 'official');
  const responseHours =
    firstQuestion?.t && firstAnswer?.t ? (Date.parse(firstAnswer.t) - Date.parse(firstQuestion.t)) / 36e5 : null;
  return {
    threadId: thread.threadId,
    title: thread.title,
    lang: detectLang(`${thread.title}\n${firstQuestion?.text ?? ''}`),
    responseHours: responseHours === null ? null : Math.round(responseHours * 10) / 10,
    messages,
  };
}

function features(answer) {
  return {
    chars: answer.length,
    hasHeadings: /^\s*(#{1,3} |\*\*[^*]+\*\*\s*$|\d+\.\s+\S.{0,40}$)/m.test(answer),
    numbered: /^\s*\d+[.)]\s/m.test(answer),
    bullets: /^\s*[-•*]\s/m.test(answer),
    code: /```|`[^`]+`/.test(answer),
    link: /https?:\/\//.test(answer),
    docsLink: /maplestoryworlds-creators\.nexon\.com|mod-developers\.nexon\.com/.test(answer),
    mentionsDocs: /공식 문서|가이드|API 레퍼런스|문서상|documentation|guide|官方文件|指南/i.test(answer),
    thanks: /감사합니다|감사드립니다|thank you|感謝/i.test(answer),
    apology: /죄송|양해|sorry|apolog|抱歉/i.test(answer),
    greeting: OFFICIAL_GREETING.test(answer),
  };
}

function rate(items, key) {
  return items.length ? Math.round((items.filter((x) => x[key]).length / items.length) * 100) : 0;
}

async function main() {
  const raw = JSON.parse(await readFile(join(DIR, INPUT), 'utf8'));
  const threads = raw.threads.map(normalizeThread);
  const answers = threads.flatMap((t) => t.messages.filter((m) => m.role === 'official').map((m) => m.text));
  const feats = answers.map(features);
  const sorted = [...feats].map((f) => f.chars).sort((a, b) => a - b);
  const hours = threads.map((t) => t.responseHours).filter((h) => h !== null).sort((a, b) => a - b);
  const stats = {
    collectedAt: raw.collectedAt,
    threads: threads.length,
    messages: threads.reduce((a, t) => a + t.messages.length, 0),
    officialAnswers: answers.length,
    unanswered: threads.filter((t) => !t.messages.some((m) => m.role === 'official')).map((t) => t.title),
    langs: threads.reduce((acc, t) => ({ ...acc, [t.lang]: (acc[t.lang] ?? 0) + 1 }), {}),
    answerChars: { p25: sorted[Math.floor(sorted.length * 0.25)], p50: sorted[Math.floor(sorted.length / 2)], p75: sorted[Math.floor(sorted.length * 0.75)], max: sorted.at(-1) },
    responseHours: { p50: hours[Math.floor(hours.length / 2)], p75: hours[Math.floor(hours.length * 0.75)] },
    answerFeaturePct: Object.fromEntries(Object.keys(feats[0] ?? {}).filter((k) => k !== 'chars').map((k) => [k, rate(feats, k)])),
  };
  await writeFile(join(DIR, `${PREFIX}threads.clean.json`), JSON.stringify({ ...stats, threadsData: threads }, null, 1));
  await writeFile(join(DIR, `${PREFIX}stats.json`), JSON.stringify(stats, null, 2));
  const size = Math.ceil(threads.length / BATCHES);
  for (let b = 0; b < BATCHES; b += 1) {
    const slice = threads.slice(b * size, (b + 1) * size);
    await writeFile(join(DIR, `${PREFIX}batch-${b + 1}.json`), JSON.stringify(slice, null, 1));
  }
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
