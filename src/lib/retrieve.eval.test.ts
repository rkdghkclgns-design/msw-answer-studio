// 검색 품질 회귀 평가: 실제 KB(docs.json + qa.json)에 대표 문의 36건을 던져
// 기대 문서가 근거 목록(상위 10개) 안에 들어오는지 본다. KB가 없으면 건너뛴다.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createKnowledgeBase, type KnowledgeBase } from './kb-core';
import { retrieve } from './retrieve';
import type { KbChunk, KbDoc } from './types';

const KB_DIR = join(process.cwd(), 'public', 'kb');
const hasKb = ['docs.json', 'symbols.json', 'meta.json', 'qa.json'].every((f) => existsSync(join(KB_DIR, f)));
const MIN_HIT_RATE = 0.9;
const MIN_MRR = 0.6;

interface DocsFile {
  readonly docs: KbDoc[];
  readonly chunks: KbChunk[];
}

/** 앱(kb.ts)과 같은 방식으로 qa.json 을 docs.json 뒤에 이어 붙인다 */
function loadKb(): KnowledgeBase {
  const read = <T>(f: string): T => JSON.parse(readFileSync(join(KB_DIR, f), 'utf8')) as T;
  const base = read<DocsFile>('docs.json');
  const qa = read<DocsFile>('qa.json');
  const offset = base.docs.length;
  const docs = [...base.docs, ...qa.docs.map((d) => ({ ...d, i: d.i + offset }))];
  const chunks = [...base.chunks, ...qa.chunks.map((c) => ({ ...c, d: c.d + offset }))];
  return createKnowledgeBase(docs, chunks, read('symbols.json'), read('meta.json'));
}

interface Case {
  readonly area: string;
  readonly queries: readonly string[];
  readonly identifiers?: readonly string[];
  /** 근거 목록 중 하나라도 제목이 맞으면 적중 */
  readonly expect: RegExp;
}

// 질문 분석 단계가 내놓는 형태(한국어 검색어 + API 식별자)를 흉내 낸 대표 문의
const CASES: readonly Case[] = [
  { area: 'API', queries: ['몬스터를 스크립트로 스폰', 'SpawnByModelId parent'], identifiers: ['_SpawnService:SpawnByModelId'], expect: /^SpawnService$/ },
  { area: 'API', queries: ['유저 데이터 저장 불러오기'], identifiers: ['DataStorageService'], expect: /DataStorage/ },
  { area: 'API', queries: ['카메라 흔들기 줌 제어'], identifiers: ['CameraService'], expect: /Camera|카메라/ },
  { area: 'API', queries: ['배경음 효과음 재생'], identifiers: ['SoundService'], expect: /Sound|사운드/ },
  { area: 'API', queries: ['발판 충돌 이벤트'], identifiers: ['FootholdComponent'], expect: /Foothold|발판/ },
  { area: '가이드', queries: ['렉트 타일맵 캐릭터 이동'], expect: /RectTile|렉트 타일/ },
  { area: '가이드', queries: ['UI 버튼 클릭 이벤트 연결'], identifiers: ['ButtonComponent'], expect: /UI|Button/ },
  { area: '가이드', queries: ['아바타 아이템 제작 방법'], expect: /아바타/ },
  { area: '가이드', queries: ['다국어 번역 현지화'], identifiers: ['LocalizationService'], expect: /LocaleDataSet|번역|Localization/ },
  { area: '가이드', queries: ['월드 출시 절차'], expect: /출시/ },
  { area: '가이드', queries: ['키보드 입력 처리 액션'], identifiers: ['InputService'], expect: /Input/ },
  { area: '약관·정책', queries: ['크리에이터가 만든 콘텐츠의 권리 귀속 약관'], expect: /이용약관/ },
  { area: '약관·정책', queries: ['개인정보 수집 항목 보관 기간'], expect: /개인정보처리방침/ },
  { area: '약관·정책', queries: ['메이플스토리 IP 리소스 사용 범위 2차 창작'], expect: /IP 사용 가이드/ },
  { area: '약관·정책', queries: ['생성형 AI 이미지 사용 규정'], expect: /생성형 AI/ },
  { area: '약관·정책', queries: ['청소년 유해 콘텐츠 보호'], expect: /청소년보호정책/ },
  { area: '콘테스트', queries: ['심사 기간 중 월드 업데이트 수정 가능 여부'], expect: /FAQ|공모전 정책|POLICY|심사|업데이트/ },
  { area: '콘테스트', queries: ['콘테스트 단체 참가 팀 구성 조건'], expect: /공모전 정책|POLICY|競賽/ },
  { area: '콘테스트', queries: ['출품 시작일 마감 일정'], expect: /출품|마감/ },
  { area: '콘테스트', queries: ['출품작 로컬라이제이션 출시 지역'], expect: /공모전 정책|POLICY|로컬라이제이션/ },
  { area: 'AI Toolkit', queries: ['AI Toolkit 최신 버전 업데이트 신규 스킬'], expect: /mswai|AI Tool[Kk]it/ },
  { area: 'AI Toolkit', queries: ['UIBuilder GridView 저장 오류'], expect: /UIBuilder|GridView|mswai/ },
  { area: '과거 답변', queries: ['DataStorage CAS expectedValue InternalError 1000001'], identifiers: ['DataStorageService'], expect: /DataStorage CAS/ },
  { area: '과거 답변', queries: ['출시 이후 카메라 화면 흔들림'], expect: /카메라 화면이 흔들리는/ },
  { area: '미션·출석 구현', queries: ['연속 출석 일수 저장과 보상 구현', 'DataStorage 유저 데이터 저장'], identifiers: ['DataStorageService'], expect: /DataStorage/ },
  { area: '미션·출석 구현', queries: ['출석 날짜 비교 하루 지나면 초기화', '날짜와 시간 활용'], expect: /날짜와 시간|DateTime|TimeSpan/ },
  { area: '미션·출석 구현', queries: ['월드코인으로 상점 아이템 판매', '월드코인 상점'], expect: /월드코인|상점/ },
  { area: '과거 답변(10/22 수집)', queries: ['TransactSet TimedOut 1000004 콜백 호출 여부'], identifiers: ['DataStorageService'], expect: /TransactSet/ },
  { area: '과거 답변(10/22 수집)', queries: ['가판대 개인 상점 GMS 고유 콘텐츠 IP 활용 범위'], expect: /가판대/ },
  { area: '다국어 적용', queries: ['인게임 다국어 자동 번역 적용 방법', 'SourceLanguage AllowAutomaticTranslation 지원 언어'], expect: /자동 번역/ },
  { area: '다국어 적용', queries: ['월드 이름 설명 대표 이미지 언어별 등록', '월드 정보 번역하기'], expect: /월드 정보와 배지/ },
  { area: '플랫폼 이벤트(배포 문서)', queries: ['이벤트 미션 진행도 전달 API 사용법', 'PlatformEventService SetProgressAndWait 미션 진행도'], identifiers: ['_PlatformEventService:SetProgressAndWait'], expect: /플랫폼 이벤트 API 명세/ },
  { area: '플랫폼 이벤트(배포 문서)', queries: ['SetProgressAndWait 101 102 응답 코드 크리티컬 리포트 EVENT_NOT_FOUND'], expect: /플랫폼 이벤트 API 명세/ },
  { area: '플랫폼 이벤트(배포 문서)', queries: ['이벤트 보상 받기 버튼이 활성화되지 않음 CS 응대', '이벤트 운영 가이드 CS 응대'], expect: /이벤트 운영 가이드/ },
  { area: '원문 그대로(영어)', queries: ['How do I spawn a monster from a script?'], identifiers: ['SpawnService'], expect: /^SpawnService$/ },
  { area: '원문 그대로(중국어)', queries: ['競賽 審查期間 可以更新世界嗎'], expect: /競賽|POLICY|공모전|FAQ/ },
];

function rankOf(kb: KnowledgeBase, c: Case): number {
  const sources = retrieve(kb, { queries: c.queries, identifiers: c.identifiers ?? [] });
  const i = sources.findIndex((s) => c.expect.test(s.doc.title));
  return i === -1 ? 0 : i + 1;
}

describe.skipIf(!hasKb)('retrieval quality on the real knowledge base', () => {
  const kb = hasKb ? loadKb() : (null as unknown as KnowledgeBase);

  it.each(CASES.map((c) => [`${c.area}: ${c.queries[0]}`, c] as const))('%s', (_name, c) => {
    expect(rankOf(kb, c)).toBeGreaterThan(0);
  });

  it(`keeps hit@10 ≥ ${MIN_HIT_RATE} and MRR ≥ ${MIN_MRR}`, () => {
    const ranks = CASES.map((c) => rankOf(kb, c));
    const hitRate = ranks.filter((r) => r > 0).length / ranks.length;
    const mrr = ranks.reduce((sum, r) => sum + (r ? 1 / r : 0), 0) / ranks.length;
    console.info(`[retrieval eval] cases=${ranks.length} hit@10=${hitRate.toFixed(2)} MRR=${mrr.toFixed(2)} ranks=${ranks.join(',')}`);
    expect(hitRate).toBeGreaterThanOrEqual(MIN_HIT_RATE);
    expect(mrr).toBeGreaterThanOrEqual(MIN_MRR);
  });

  it('answers a retrieval within the browser latency budget', () => {
    const started = performance.now();
    for (const c of CASES) retrieve(kb, { queries: c.queries, identifiers: c.identifiers ?? [] });
    const perQuery = (performance.now() - started) / CASES.length;
    console.info(`[retrieval eval] ${perQuery.toFixed(1)} ms/query over ${kb.chunks.length} chunks`);
    expect(perQuery).toBeLessThan(200);
  });
});
