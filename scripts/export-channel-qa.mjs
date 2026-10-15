// 서버 전체 채널 수집본에서 Q&A 항목만 뽑아 익명화 분석용 배치 파일로 저장한다.
// 사용법: node scripts/export-channel-qa.mjs [배치 수=2]

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { channelToEntries } from './lib/channels.mjs';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'discord');
const BATCHES = Number(process.argv[2] ?? 2);

const files = (await readdir(DIR)).filter((f) => /^ch-\d+\.json$/.test(f));
const entries = [];
for (const f of files) {
  const ch = JSON.parse(await readFile(join(DIR, f), 'utf8'));
  for (const { section, entry } of channelToEntries(ch, (t) => t)) {
    if (section === 'qa') entries.push({ id: entry.id, channel: entry.trail[1], title: entry.title, text: entry.text.slice(0, 3000) });
  }
}
const size = Math.ceil(entries.length / BATCHES);
for (let b = 0; b < BATCHES; b += 1) {
  await writeFile(join(DIR, `channel-qa-batch-${b + 1}.json`), JSON.stringify(entries.slice(b * size, (b + 1) * size), null, 1));
}
console.log(`Q&A ${entries.length}건 → ${BATCHES}개 배치`);
