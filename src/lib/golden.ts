// 골든 평가셋(eval/golden.json) 스키마·채점·집계.
// 채점은 키워드·정규식 기반 결정론 규칙이라 API 비용 없이 재현할 수 있다(레드팀 H-9, 7.2).

import { z } from 'zod';
import type { OverallStatus } from './factcheck';

const KeywordGroup = z.array(z.string());

export const GoldenItemSchema = z.object({
  id: z.string().min(1),
  lang: z.enum(['ko', 'en', 'zh']),
  category: z.string(),
  question: z.string().min(5),
  expected: z.object({
    /** 정답 요지 (사람이 읽는 한 문장) */
    gist: z.string().min(1),
    /** 묶음마다 하나 이상 들어 있어야 정답 (대소문자 무시 부분 일치) */
    mustMention: z.array(KeywordGroup).min(1),
    /** 하나라도 맞으면 금지 주장 (정규식, 대소문자 무시) */
    mustNotMention: z.array(z.string()),
    /** 검색된 출처 제목 중 하나에 들어 있어야 할 문자열 */
    requiredSourceHints: z.array(z.string()).optional(),
    /** 운영 판단으로 넘겨야 하는 문의인가 */
    operatorDecision: z.boolean().optional(),
  }),
  sourceRef: z.string().optional(),
  trap: z.string().optional(),
});

export type GoldenItem = z.infer<typeof GoldenItemSchema>;

export interface RunOutcome {
  readonly answer: string;
  readonly status: OverallStatus | 'error';
  readonly sourceTitles: readonly string[];
  readonly needsOperatorDecision: boolean;
  readonly error?: string;
}

export interface Grade {
  readonly id: string;
  readonly lang: GoldenItem['lang'];
  readonly status: RunOutcome['status'];
  readonly correct: boolean;
  readonly forbiddenHits: string[];
  readonly missingGroups: string[][];
  /** 검색 힌트가 없으면 null */
  readonly sourceHit: boolean | null;
  /** 라벨에 운영 판단 여부가 없으면 null */
  readonly operatorFlagOk: boolean | null;
  /** 앱은 "팩트체크 통과"인데 실제로는 오답 */
  readonly passedButWrong: boolean;
  /** 정답인데 앱이 "검증 실패"로 막음 */
  readonly correctButFailed: boolean;
  readonly error?: string;
}

const CITATIONS = /\[\d{1,2}(?:\s*,\s*\d{1,2})*\]/g;
const normalize = (text: string) => text.normalize('NFKC').replace(CITATIONS, '').replace(/\s+/g, ' ').toLowerCase();

export function gradeOutcome(item: GoldenItem, outcome: RunOutcome): Grade {
  const answer = normalize(outcome.answer);
  const failedRun = outcome.status === 'error' || !answer.trim();
  const forbiddenHits = item.expected.mustNotMention.filter((src) => new RegExp(src, 'i').test(answer));
  const missingGroups = item.expected.mustMention.filter((group) => !group.some((k) => answer.includes(normalize(k)))).map((g) => [...g]);
  const correct = !failedRun && forbiddenHits.length === 0 && missingGroups.length === 0;
  const hints = item.expected.requiredSourceHints ?? [];
  return {
    id: item.id,
    lang: item.lang,
    status: outcome.status,
    correct,
    forbiddenHits,
    missingGroups,
    sourceHit: hints.length ? outcome.sourceTitles.some((t) => hints.some((h) => t.toLowerCase().includes(h.toLowerCase()))) : null,
    operatorFlagOk: item.expected.operatorDecision === undefined ? null : item.expected.operatorDecision === outcome.needsOperatorDecision,
    passedButWrong: outcome.status === 'verified' && !correct,
    correctButFailed: correct && outcome.status === 'failed',
    error: outcome.error,
  };
}

const rate = (n: number, d: number) => (d ? n / d : 0);

export function summarizeGrades(grades: readonly Grade[]) {
  const correct = grades.filter((g) => g.correct).length;
  const verifiedCount = grades.filter((g) => g.status === 'verified').length;
  const passedButWrong = grades.filter((g) => g.passedButWrong).length;
  const correctButFailed = grades.filter((g) => g.correctButFailed).length;
  const withHints = grades.filter((g) => g.sourceHit !== null);
  const byLang: Record<string, { total: number; correct: number }> = {};
  for (const g of grades) {
    const bucket = (byLang[g.lang] ??= { total: 0, correct: 0 });
    bucket.total += 1;
    if (g.correct) bucket.correct += 1;
  }
  const byStatus: Record<string, number> = {};
  for (const g of grades) byStatus[g.status] = (byStatus[g.status] ?? 0) + 1;
  return {
    total: grades.length,
    correct,
    accuracy: rate(correct, grades.length),
    /** 금지 주장이 하나라도 나온 답변 수 (목표 0) */
    forbiddenAnswers: grades.filter((g) => g.forbiddenHits.length > 0).length,
    verifiedCount,
    passedButWrong,
    /** "통과인데 오답" 비율 (목표 0%) */
    passedButWrongRate: rate(passedButWrong, verifiedCount),
    correctButFailed,
    /** 정상 답변이 실패로 막힌 비율 (목표 10% 이하) */
    falseFailRate: rate(correctButFailed, correct),
    sourceHitRate: rate(withHints.filter((g) => g.sourceHit).length, withHints.length),
    errors: grades.filter((g) => g.status === 'error').length,
    byLang,
    byStatus,
  };
}

// 평가셋에 개인정보가 섞이지 않았는지(이메일·전화번호·32자리 ID·협업 링크)
const PERSONAL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\b|01[016789][- ]?\d{3,4}[- ]?\d{4}|(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])|forms\.gle|drive\.google|padlet\.com|zep\.us/i;

/** 형식·정규식·중복·개인정보 검사. 문제 목록(한국어)을 돌려준다. */
export function validateGoldenSet(items: readonly unknown[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  items.forEach((raw, index) => {
    const parsed = GoldenItemSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(`#${index}: 형식 오류 — ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`);
      return;
    }
    const item = parsed.data;
    if (seen.has(item.id)) errors.push(`${item.id}: 중복 id`);
    seen.add(item.id);
    for (const src of item.expected.mustNotMention) {
      try {
        new RegExp(src, 'i');
      } catch {
        errors.push(`${item.id}: 잘못된 정규식 ${src}`);
      }
    }
    if (item.expected.mustMention.some((g) => g.length === 0 || g.some((k) => !k.trim()))) errors.push(`${item.id}: 빈 키워드 묶음`);
    if (PERSONAL.test(`${item.question}\n${item.expected.gist}`)) errors.push(`${item.id}: 개인정보·비공개 링크 의심`);
  });
  return errors;
}
