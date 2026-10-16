// LLM이 제시한 주장별 근거 인용문을 출처 원문과 결정론적으로 대조한다.
// LLM의 "supported" 판정도 인용문이 원문에 실제로 없으면 인정하지 않는다.

import { CITATION_GROUP, type FactSentence } from './citations';

export type Verdict = 'supported' | 'partial' | 'unsupported' | 'contradicted';

export interface Claim {
  readonly claim: string;
  readonly sources: readonly number[];
  readonly quote: string;
  readonly verdict: Verdict;
  readonly note: string;
}

export interface CheckedClaim extends Claim {
  readonly quoteVerified: boolean;
}

export type OverallStatus = 'verified' | 'partial' | 'failed';

const FUZZY_MIN_LENGTH = 12;
const FUZZY_THRESHOLD = 0.85;
const MIN_SEGMENT_LENGTH = 2;
/** 생략 부호로 이은 조각 사이의 최대 거리(정규화 글자 수) — 멀리 떨어진 문장을 이어 붙이지 못하게 */
const MAX_SEGMENT_GAP = 400;

// 의미를 바꾸는 기호(소수점·퍼센트·음수 부호·비교 연산자)는 문장부호를 지운 뒤에도 남도록
// 사용자 영역(Private Use) 문자로 바꿔 둔다. 편집기가 지우지 않도록 코드로 만든다.
const pua = (offset: number) => String.fromCharCode(0xe000 + offset);
const DECIMAL_POINT = pua(0);
const PERCENT = pua(1);
const MINUS = pua(2);
const LESS = pua(3);
const GREATER = pua(4);
const EQUALS = pua(5);
// 공백·기호로 떨어져 있던 두 숫자 사이 경계("1.1.0 ① …" → 1.1.0|1). 지우면 숫자가 붙어 다른 수처럼 보인다.
const NUMBER_GAP = pua(6);
const NUMBER_SYMBOLS = DECIMAL_POINT + PERCENT + MINUS;
const OPERATOR_SYMBOLS = LESS + GREATER + EQUALS;

// 퍼지 매칭에서도 정확히 같아야 하는 의미 표지: 숫자열, 비교 연산자, 부정·금지 표현(ko/en/zh)
const NUMBER_RUN = new RegExp(`[\\d${NUMBER_SYMBOLS}]+`, 'g');
const NUMBER_CHAR = new RegExp(`[\\d${NUMBER_SYMBOLS}]`);
const OPERATOR_RUN = new RegExp(`[${OPERATOR_SYMBOLS}]+`, 'g');
const NEGATION = /없|않|못|불|비|미|금지|아니|아닙|아닌|안되|not|no|cannot|never|不|無|无|禁|未|非|沒|没/g;
// 정확 일치라도 바로 앞 글자가 부정 접두사면("가능" ⊂ "불가능", "공개" ⊂ "비공개") 같은 뜻이 아니다
const NEGATION_PREFIX = /[불비미不無无非未]/;
const isNumberChar = (c: string | undefined) => c !== undefined && NUMBER_CHAR.test(c);

export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/(\w)n['’]t\b/g, '$1n not')
    .replace(/(\d)\.(?=\d)/g, `$1${DECIMAL_POINT}`)
    .replace(/(\d)\s*%/g, `$1${PERCENT}`)
    .replace(/(^|[^\p{L}\p{N}])-(?=\d)/gu, `$1${MINUS}`)
    .replace(/</g, LESS)
    .replace(/>/g, GREATER)
    .replace(/=/g, EQUALS)
    .replace(/[\p{Cf}\p{Variation_Selector}]+/gu, '')
    .replace(/(\d)[\s\p{P}\p{S}]+(?=\d)/gu, `$1${NUMBER_GAP}`)
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function meaningMarkers(s: string): string {
  const all = (re: RegExp) => (s.match(re) ?? []).join('|');
  return `${all(NUMBER_RUN)}#${all(OPERATOR_RUN)}#${all(NEGATION)}`;
}

/**
 * 표지를 비교할 창을 넓힌다. 경계가 숫자 중간을 자르거나("40|%까지") 바로 앞이 부정 접두사면("불|가능")
 * 그 글자까지 포함해, 잘라 낸 기호로 비교를 피하지 못하게 한다.
 */
function markerWindow(haystack: string, start: number, end: number): string {
  let s = start;
  let e = end;
  while (s > 0 && isNumberChar(haystack[s - 1]) && isNumberChar(haystack[s])) s -= 1;
  if (s > 0 && NEGATION_PREFIX.test(haystack[s - 1])) s -= 1;
  while (e < haystack.length && isNumberChar(haystack[e]) && isNumberChar(haystack[e - 1])) e += 1;
  return haystack.slice(s, e);
}

function bigramCounts(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i += 1) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

function dice(a: Map<string, number>, aLen: number, b: string): number {
  const bCounts = bigramCounts(b);
  let overlap = 0;
  for (const [g, n] of bCounts) overlap += Math.min(n, a.get(g) ?? 0);
  return (2 * overlap) / (aLen - 1 + (b.length - 1));
}

/** 오탈자를 허용해 찾되, 숫자·연산자·부정 표지가 다르면(의미가 바뀐 경우) 일치로 보지 않는다. 찾은 위치 또는 -1 */
function fuzzyIndexOf(segment: string, haystack: string, from: number): number {
  if (segment.length < FUZZY_MIN_LENGTH || haystack.length - from < segment.length - 2) return -1;
  const target = bigramCounts(segment);
  const markers = meaningMarkers(segment);
  for (const width of [segment.length, segment.length - 1, segment.length + 1]) {
    for (let i = from; i + width <= haystack.length; i += 1) {
      if (dice(target, segment.length, haystack.slice(i, i + width)) < FUZZY_THRESHOLD) continue;
      if (meaningMarkers(markerWindow(haystack, i, i + width)) === markers) return i;
    }
  }
  return -1;
}

/** 글자는 같아도 뜻이 다른 위치: 부정 접두사 뒤("불|가능"), 더 긴 숫자의 일부("1.|5초", "최대 40|0") */
function changesMeaning(segment: string, haystack: string, at: number): boolean {
  const before = haystack[at - 1];
  const after = haystack[at + segment.length];
  if (before !== undefined && NEGATION_PREFIX.test(before)) return true;
  if (isNumberChar(segment[0]) && isNumberChar(before)) return true;
  return isNumberChar(segment[segment.length - 1]) && isNumberChar(after);
}

/** 조각이 나타나는 후보 위치(앞에서부터). 정확 일치가 뜻이 다른 위치에만 있으면 퍼지로 우회하지 않는다. */
function candidatePositions(segment: string, haystack: string, from: number): number[] {
  const exact: number[] = [];
  let blocked = false;
  for (let at = haystack.indexOf(segment, from); at >= 0; at = haystack.indexOf(segment, at + 1)) {
    if (changesMeaning(segment, haystack, at)) blocked = true;
    else exact.push(at);
  }
  if (exact.length || blocked) return exact;
  const fuzzy = fuzzyIndexOf(segment, haystack, from);
  return fuzzy >= 0 ? [fuzzy] : [];
}

function matchSegments(segments: readonly string[], haystack: string, index: number, cursor: number): boolean {
  if (index === segments.length) return true;
  const segment = segments[index];
  for (const at of candidatePositions(segment, haystack, cursor)) {
    if (index > 0 && at - cursor > MAX_SEGMENT_GAP) return false;
    if (matchSegments(segments, haystack, index + 1, at + segment.length)) return true;
  }
  return false;
}

/**
 * 인용문이 원문에 있는지(공백·문장부호 무시, 오탈자 1~2자 허용).
 * … 로 생략한 조각은 원문 순서대로, 서로 가까이 있어야 한다(먼 조각이면 뒤쪽 출현 위치로 다시 시도).
 */
export function quoteFound(quote: string, source: string): boolean {
  const segments = quote
    .split(/\.{3}|…/)
    .map(normalizeForMatch)
    .filter((s) => s.length >= MIN_SEGMENT_LENGTH);
  if (!segments.length) return false;
  return matchSegments(segments, normalizeForMatch(source), 0, 0);
}

const joinNote = (...parts: string[]) => parts.filter(Boolean).join(' · ');

export function applyQuoteChecks(claims: readonly Claim[], sources: ReadonlyMap<number, string>): CheckedClaim[] {
  return claims.map((claim) => {
    const needsEvidence = claim.verdict === 'supported' || claim.verdict === 'partial';
    // 인용 번호가 없거나 잘못된 경우: 전체 출처에서 인용문을 찾아 근거 자체는 확인하되 인용 오류로 표시
    const cited = claim.sources.map((n) => sources.get(n)).filter((t): t is string => Boolean(t));
    if (!cited.length) {
      const foundAnywhere = [...sources.values()].some((t) => quoteFound(claim.quote, t));
      if (needsEvidence && foundAnywhere) {
        return { ...claim, verdict: 'partial', quoteVerified: true, note: joinNote(claim.note, '근거는 출처에 있으나 인용 번호가 없거나 잘못됨') };
      }
      if (needsEvidence) {
        return { ...claim, verdict: 'unsupported', quoteVerified: false, note: joinNote(claim.note, '근거 인용문이 출처에서 확인되지 않음') };
      }
      return { ...claim, quoteVerified: foundAnywhere };
    }
    const quoteVerified = cited.some((t) => quoteFound(claim.quote, t));
    if (needsEvidence && !quoteVerified) {
      return { ...claim, verdict: 'unsupported', quoteVerified, note: joinNote(claim.note, '근거 인용문이 인용한 출처 원문에서 확인되지 않음') };
    }
    return { ...claim, quoteVerified };
  });
}

export interface ExcludedSentence {
  readonly sentenceId: string;
  readonly reason: string;
}

// 검증기가 "사실 주장 아님"으로 빼도 받아 주지 않는 문장: 숫자·날짜, 가능/불가, 허용/금지, 의무·제한 표현
const MUST_CHECK = /\d|가능|불가|허용|금지|필수|제한|의무|불이익|실격|수 있|수 없|않습니다|못합니다|\bcan\b|cannot|must|\bnot\b|allowed|prohibit|required|可以|不|禁止|必須|限制/i;

/**
 * 어떤 주장에도 연결되지 않은 사실 문장을 찾는다(레드팀 H-2: 검증기가 위험한 문장을 건너뛰어도 통과하던 문제).
 * 검증기가 제외한 문장은 위험 표현이 없을 때만 제외를 인정한다.
 */
export function findUnlinkedSentences(
  sentences: readonly FactSentence[],
  claims: readonly { readonly sentenceIds?: readonly string[] }[],
  excluded: readonly ExcludedSentence[],
): { unlinked: FactSentence[]; excluded: { text: string; reason: string }[] } {
  const linked = new Set(claims.flatMap((c) => c.sentenceIds ?? []));
  const reasons = new Map(excluded.map((e) => [e.sentenceId, e.reason]));
  const unlinked: FactSentence[] = [];
  const accepted: { text: string; reason: string }[] = [];
  for (const sentence of sentences) {
    if (linked.has(sentence.id)) continue;
    const reason = reasons.get(sentence.id);
    if (reason !== undefined && !MUST_CHECK.test(sentence.text.replace(CITATION_GROUP, ''))) accepted.push({ text: sentence.text, reason });
    else unlinked.push(sentence);
  }
  return { unlinked, excluded: accepted };
}

export interface VerificationSummary {
  readonly status: OverallStatus;
  readonly counts: Readonly<Record<Verdict, number>> & { readonly apiUnknown: number; readonly apiDeprecated: number };
  readonly reasons: readonly string[];
}

export function summarizeVerification(
  claims: readonly CheckedClaim[],
  mentionChecks: readonly { readonly status: string; readonly fromQuestion?: boolean }[],
  citations: { readonly invalid: readonly number[]; readonly coverage: number; readonly unknownLinks?: readonly string[] },
  /** 어떤 주장에도 연결되지 않은 사실 문장 수 */
  unlinkedSentences = 0,
  /** 답변에 드러난 운영 메모(대외비) 표현 수 */
  confidentialLeaks = 0,
): VerificationSummary {
  const unknownLinks = citations.unknownLinks ?? [];
  const count = (v: Verdict) => claims.filter((c) => c.verdict === v).length;
  const counts = {
    supported: count('supported'),
    partial: count('partial'),
    unsupported: count('unsupported'),
    contradicted: count('contradicted'),
    apiUnknown: mentionChecks.filter((m) => m.status === 'unknown-member' || m.status === 'unknown-type').length,
    apiDeprecated: mentionChecks.filter((m) => m.status === 'deprecated').length,
  };
  // 질문자가 직접 쓴 이름은 답변의 창작이 아니므로 실패가 아닌 확인 요청으로 돌린다
  const inventedMembers = mentionChecks.filter((m) => m.status === 'unknown-member' && !m.fromQuestion).length;
  const unknownTypes = mentionChecks.filter((m) => m.status === 'unknown-type' && !m.fromQuestion).length;
  const askedUnknown = mentionChecks.filter((m) => (m.status === 'unknown-member' || m.status === 'unknown-type') && m.fromQuestion).length;
  const reasons = [
    confidentialLeaks > 0 && `운영 메모(대외비) 노출 의심 ${confidentialLeaks}건`,
    counts.contradicted && `출처와 모순되는 주장 ${counts.contradicted}건`,
    inventedMembers && `공식 레퍼런스에 없는 API 멤버 ${inventedMembers}건`,
    counts.unsupported && `근거가 확인되지 않은 주장 ${counts.unsupported}건`,
    counts.partial && `부분적으로만 뒷받침되는 주장 ${counts.partial}건`,
    unlinkedSentences > 0 && `주장으로 대조되지 않은 사실 문장 ${unlinkedSentences}건`,
    unknownTypes && `레퍼런스에 없는 타입명 ${unknownTypes}건`,
    askedUnknown && `질문에 나온, 레퍼런스에 없는 API 이름 ${askedUnknown}건 (답변이 사실처럼 설명하지 않는지 확인)`,
    counts.apiDeprecated && `Deprecated API 사용 ${counts.apiDeprecated}건`,
    citations.invalid.length && `잘못된 출처 번호 ${citations.invalid.join(', ')}`,
    citations.coverage < 0.8 && `인용 없는 사실 문장 비율 ${Math.round((1 - citations.coverage) * 100)}%`,
    unknownLinks.length && `출처에 없는 링크 ${unknownLinks.length}건`,
    !claims.length && '검증 가능한 사실 진술이 없음',
  ].filter((r): r is string => Boolean(r));
  const failed = confidentialLeaks > 0 || counts.contradicted > 0 || inventedMembers > 0 || unknownLinks.length > 0;
  const status: OverallStatus = failed ? 'failed' : reasons.length ? 'partial' : 'verified';
  return { status, counts, reasons };
}
