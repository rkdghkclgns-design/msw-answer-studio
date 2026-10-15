// data/discord/analysis-batch-*.json → analysis-summary.json (유형 분포 + 스타일 관찰 통합)

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'discord');

function countBy(items) {
  return Object.fromEntries(
    Object.entries(items.reduce((acc, k) => ({ ...acc, [k]: (acc[k] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]),
  );
}

async function main() {
  const files = (await readdir(DIR)).filter((f) => /^analysis-batch-\d+\.json$/.test(f)).sort();
  const batches = await Promise.all(files.map(async (f) => JSON.parse(await readFile(join(DIR, f), 'utf8'))));
  const threads = batches.flatMap((b) => b.threads);
  const style = batches.map((b) => b.styleObservations);
  const merge = (key) => [...new Set(style.flatMap((s) => s?.[key] ?? []))];
  const summary = {
    threadCount: threads.length,
    categories: countBy(threads.map((t) => t.category)),
    langs: countBy(threads.map((t) => t.lang)),
    questionShapes: countBy(threads.flatMap((t) => t.questionShape ?? [])),
    answerTypes: countBy(threads.flatMap((t) => t.answerType ?? [])),
    topTopics: Object.fromEntries(Object.entries(countBy(threads.flatMap((t) => t.mswTopics ?? []))).slice(0, 40)),
    style: {
      greetings: merge('greetings'),
      closings: merge('closings'),
      tone: style.map((s) => s?.tone).filter(Boolean),
      structurePatterns: merge('structurePatterns'),
      formatting: merge('formatting'),
      docCitationPatterns: merge('docCitationPatterns'),
      uncertaintyPatterns: merge('uncertaintyPatterns'),
      languageHandling: style.map((s) => s?.languageHandling).filter(Boolean),
      lengthNotes: style.map((s) => s?.lengthNotes).filter(Boolean),
      doNots: merge('doNots'),
    },
    newCategorySuggestions: batches.flatMap((b) => b.newCategorySuggestions ?? []),
    examples: threads.map((t) => ({
      threadId: t.threadId,
      category: t.category,
      lang: t.lang,
      subTopic: t.subTopic,
      questionSummary: t.questionSummary,
      answerSummary: t.answerSummary,
      answerStructure: t.answerStructure,
      answerType: t.answerType,
    })),
  };
  await writeFile(join(DIR, 'analysis-summary.json'), JSON.stringify(summary, null, 1));
  const { examples, ...head } = summary;
  console.log(JSON.stringify(head, null, 1));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
