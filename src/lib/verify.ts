// 답변 팩트체크: LLM 주장 추출 + 인용문 원문 대조 + API 식별자 대조 + 인용 커버리지

import type Anthropic from '@anthropic-ai/sdk';
import { analyzeCitations, factualSentences, type CitationReport } from './citations';
import { structuredCall, type Effort, type ModelId } from './claude';
import { applyQuoteChecks, findUnlinkedSentences, summarizeVerification, type CheckedClaim, type VerificationSummary } from './factcheck';
import type { KnowledgeBase } from './kb-core';
import { findConfidentialLeaks } from './ops-notes';
import { buildVerifyUser, VERIFY_SYSTEM } from './prompts';
import { VerificationSchema } from './schemas';
import { extractApiMentions, markQuestionMentions, verifyApiMentions, type MentionCheck } from './symbols';
import type { Source } from './types';

export interface VerificationResult {
  readonly claims: readonly CheckedClaim[];
  readonly apiChecks: readonly MentionCheck[];
  readonly citations: CitationReport;
  /** 어떤 주장에도 연결되지 않아 대조하지 못한 사실 문장 */
  readonly unlinkedSentences: readonly string[];
  /** 검증기가 사실 주장이 없다고 보고 뺀 문장(위험 표현이 없는 것만 인정) */
  readonly excludedSentences: readonly { readonly text: string; readonly reason: string }[];
  /** 답변에 드러난 운영 메모(대외비) 표현 */
  readonly confidentialLeaks: readonly string[];
  readonly summary: VerificationSummary;
}

/** LLM 없이 계산 가능한 검사(식별자·인용)만 수행 — 스트리밍 중 미리보기에도 사용 */
export function deterministicChecks(answer: string, sources: readonly Source[], kb: KnowledgeBase, question = '') {
  return {
    apiChecks: markQuestionMentions(verifyApiMentions(extractApiMentions(answer), kb.lookup), question),
    citations: analyzeCitations(
      answer,
      sources.length,
      sources.map((s) => s.doc.url),
    ),
  };
}

export async function verifyAnswer(params: {
  readonly client: Anthropic;
  readonly model: ModelId;
  readonly effort: Effort;
  readonly question: string;
  readonly answer: string;
  readonly sources: readonly Source[];
  readonly kb: KnowledgeBase;
  readonly signal?: AbortSignal;
  /** 운영 메모의 대외비 표현 (질문·출처에 없는데 답변에 나오면 실패) */
  readonly confidentialTerms?: readonly string[];
}): Promise<VerificationResult> {
  const { apiChecks, citations } = deterministicChecks(params.answer, params.sources, params.kb, params.question);
  const sentences = factualSentences(params.answer);
  const output = await structuredCall(params.client, {
    model: params.model,
    effort: params.effort,
    system: VERIFY_SYSTEM,
    user: buildVerifyUser(params.answer, params.sources, sentences),
    schema: VerificationSchema,
    maxTokens: 32000,
    signal: params.signal,
  });
  const sourceTexts = new Map(params.sources.map((s) => [s.n, `${s.doc.title}\n${s.heading}\n${s.text}`]));
  const claims = applyQuoteChecks(output.claims, sourceTexts);
  const coverage = findUnlinkedSentences(sentences, output.claims, output.excludedSentences);
  const context = [params.question, ...params.sources.map((s) => `${s.doc.title}\n${s.text}`)].join('\n');
  const confidentialLeaks = findConfidentialLeaks(params.answer, params.confidentialTerms ?? [], context);
  return {
    claims,
    apiChecks,
    citations,
    unlinkedSentences: coverage.unlinked.map((s) => s.text),
    excludedSentences: coverage.excluded,
    confidentialLeaks,
    summary: summarizeVerification(claims, apiChecks, citations, coverage.unlinked.length, confidentialLeaks.length),
  };
}

/** 수정 단계에 넘길 문제 목록 (사람이 읽을 수 있는 한국어) */
export function describeIssues(result: VerificationResult): string[] {
  const claimIssues = result.claims
    .filter((c) => c.verdict !== 'supported')
    .map((c) => `- [${c.verdict}] "${c.claim}" — ${c.note || '근거 부족'}`);
  const apiIssues = result.apiChecks
    // 질문자가 쓴 이름을 지우라고 하면 상황 재진술이 망가지므로 수정 대상에서 뺀다
    .filter((a) => a.status !== 'verified' && !a.fromQuestion)
    .map((a) => `- [API:${a.status}] ${a.text} — ${a.note}`);
  const citationIssues = [
    ...result.citations.invalid.map((n) => `- [인용] 존재하지 않는 출처 번호 [${n}]`),
    ...result.citations.uncited.map((s) => `- [인용 누락] "${s}"`),
    ...result.citations.unknownLinks.map((u) => `- [링크] 출처 목록에 없는 URL: ${u} (출처 url 로 바꾸거나 삭제)`),
  ];
  const coverageIssues = result.unlinkedSentences.map(
    (s) => `- [대조 누락] "${s}" — 근거 출처를 [n]으로 인용하거나, 근거가 없으면 삭제하거나 "공식 문서상 확인되지 않습니다"로 바꿀 것`,
  );
  const leakIssues = result.confidentialLeaks.map((t) => `- [대외비] "${t}" 관련 내용은 공지 전 내부 정보이므로 답변에서 삭제할 것`);
  return [...leakIssues, ...claimIssues, ...apiIssues, ...citationIssues, ...coverageIssues];
}
