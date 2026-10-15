// 빌드 게이트: public/kb/*.json 에 개인정보·비공개 링크가 남아 있으면 빌드를 멈춘다.
// 사용법: node scripts/scan-kb.mjs  (npm run build 가 먼저 실행)

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPrivateData } from './lib/privacy.mjs';

const KB_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'kb');
// 크리에이터·참가자가 쓴 글이 들어가는 Discord 유래 파일만 검사한다.
// docs.json·symbols.json 은 공개 공식 문서라 예시 번호·리소스 RUID·회사 연락처가 정상적으로 들어 있다.
const DISCORD_FILES = ['qa.json'];

export async function scanKnowledgeBase(dir = KB_DIR) {
  const present = new Set(await readdir(dir));
  const findings = [];
  for (const file of DISCORD_FILES.filter((f) => present.has(f))) {
    const { docs = [], chunks = [] } = JSON.parse(await readFile(join(dir, file), 'utf8'));
    const texts = [...docs.map((d) => d.title ?? ''), ...chunks.map((c) => c.t ?? '')];
    for (const text of texts) for (const f of findPrivateData(text)) findings.push({ file, ...f });
  }
  return findings;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const findings = await scanKnowledgeBase();
  if (findings.length) {
    console.error(`지식베이스에 개인정보·비공개 링크 ${findings.length}건이 남아 있습니다:`);
    // 원문 전체를 로그에 남기지 않도록 앞부분만 보여 준다
    for (const f of findings.slice(0, 20)) console.error(`- ${f.file} [${f.kind}] ${f.match.slice(0, 6)}…`);
    process.exit(1);
  }
  console.log('지식베이스 개인정보·비공개 링크 검사 통과');
}
