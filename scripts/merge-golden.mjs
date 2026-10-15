// eval/golden-part-*.json 초안을 합쳐 eval/golden.json 을 만든다. 검증은 src/lib/golden.dataset.test.ts 가 맡는다.
// 사용법: node scripts/merge-golden.mjs

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'eval');
const parts = (await readdir(DIR)).filter((f) => /^golden-part-\d+\.json$/.test(f)).sort();
const items = [];
for (const file of parts) items.push(...JSON.parse(await readFile(join(DIR, file), 'utf8')));
const ids = items.map((it) => it.id);
const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
if (duplicates.length) throw new Error(`중복 id: ${[...new Set(duplicates)].join(', ')}`);
await writeFile(join(DIR, 'golden.json'), `${JSON.stringify(items, null, 2)}\n`);
const count = (key) => items.reduce((acc, it) => ({ ...acc, [it[key]]: (acc[it[key]] ?? 0) + 1 }), {});
console.log(`${parts.length}개 조각 → ${items.length}문항`, count('lang'), `함정 ${items.filter((it) => it.trap).length}`);
