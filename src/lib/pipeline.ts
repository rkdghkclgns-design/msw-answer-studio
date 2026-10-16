// 질문 → 분석 → 검색 → 답변(스트리밍) → 팩트체크 → (필요 시) 자동 수정 → 재검증

import type Anthropic from '@anthropic-ai/sdk';
import { createClient, streamText, structuredCall, type ModelId } from './claude';
import type { KnowledgeBase } from './kb-core';
import type { ImageInput } from './images';
import type { OpsNotes } from './ops-notes';
import { ANALYZE_SYSTEM, ANSWER_SYSTEM, buildAnalyzeUser, buildAnswerUser, buildReviseUser, REVISE_SYSTEM } from './prompts';
import { retrieve } from './retrieve';
import { AnalysisSchema, type Analysis } from './schemas';
import type { Settings } from './settings';
import { mergeSourceLists } from './sources';
import type { Source } from './types';
import { describeIssues, verifyAnswer, type VerificationResult } from './verify';

export type StageId = 'analyze' | 'retrieve' | 'answer' | 'verify' | 'revise';
export type StageStatus = 'idle' | 'running' | 'done' | 'skipped' | 'error';

export const STAGES: ReadonlyArray<{ id: StageId; label: string }> = [
  { id: 'analyze', label: '질문 분석' },
  { id: 'retrieve', label: '공식 문서 검색' },
  { id: 'answer', label: '답변 작성' },
  { id: 'verify', label: '팩트체크' },
  { id: 'revise', label: '자동 수정·재검증' },
];

const MAX_SOURCES = 12;
const SOURCES_PER_SUBQUESTION = 7;
// 사고(thinking)가 출력 토큰 한도를 공유하므로 넉넉히 둔다 (스트리밍은 SDK 권장 64K)
const STREAM_MAX_TOKENS = 64000;
const STRUCTURED_MAX_TOKENS = 32000;
const THINKING_REPORT_EVERY = 400;
// 팩트체크는 답변 모델과 관계없이 가장 강한 모델로 한다(작은 모델이 자기 답을 검증하지 않게, 레드팀 H-2)
const VERIFIER_MODEL: ModelId = 'claude-opus-5-5';

/** 사고 요약 글자 수를 일정 간격으로 단계 상세에 표시 */
function thinkingReporter(report: (detail: string) => void, label: string) {
  let chars = 0;
  let lastReported = 0;
  return (delta: string) => {
    chars += delta.length;
    if (chars - lastReported >= THINKING_REPORT_EVERY) {
      lastReported = chars;
      report(`${label} · 근거 검토 중 (${chars.toLocaleString()}자)`);
    }
  };
}

export interface PipelineCallbacks {
  stage(id: StageId, status: StageStatus, detail?: string): void;
  analysis(analysis: Analysis): void;
  sources(sources: readonly Source[]): void;
  answer(text: string, phase: 'draft' | 'revised'): void;
  verification(result: VerificationResult, phase: 'draft' | 'revised'): void;
}

export interface PipelineResult {
  readonly analysis: Analysis;
  readonly sources: readonly Source[];
  readonly draft: string;
  readonly draftVerification: VerificationResult;
  readonly final: string;
  readonly finalVerification: VerificationResult;
  readonly revised: boolean;
}

export function retrieveForAnalysis(kb: KnowledgeBase, question: string, analysis: Analysis): Source[] {
  const subQuestions = analysis.subQuestions.length ? analysis.subQuestions : [{ question, searchQueries: [] }];
  const lists = subQuestions.map((sq) =>
    retrieve(
      kb,
      { queries: [sq.question, ...sq.searchQueries], identifiers: analysis.apiIdentifiers },
      { limit: SOURCES_PER_SUBQUESTION },
    ),
  );
  const whole = retrieve(kb, { queries: [question], identifiers: [] }, { limit: SOURCES_PER_SUBQUESTION });
  return mergeSourceLists([...lists, whole], MAX_SOURCES);
}

export async function runPipeline(params: {
  readonly question: string;
  readonly kb: KnowledgeBase;
  readonly settings: Settings;
  readonly callbacks: PipelineCallbacks;
  readonly signal?: AbortSignal;
  /** 테스트에서 가짜 클라이언트를 주입할 때만 사용 */
  readonly client?: Anthropic;
  /** 로컬 전용 운영 메모(대외비). 답변 판단에 쓰고, 답변에 드러나면 검증 실패로 처리한다. */
  readonly opsNotes?: OpsNotes | null;
  /** 문의에 첨부한 참고 이미지. 분석·답변 단계에만 보내고 검증 단계에는 보내지 않는다. */
  readonly images?: readonly ImageInput[];
}): Promise<PipelineResult> {
  const { question, kb, settings, callbacks: cb, signal } = params;
  const opsNotes = params.opsNotes ?? null;
  const images = params.images ?? [];
  const client = params.client ?? createClient(settings.apiKey, settings.workspaceId);
  const common = { model: settings.model, signal };

  cb.stage('analyze', 'running');
  const analysis = await structuredCall(client, {
    ...common,
    effort: 'low',
    system: ANALYZE_SYSTEM,
    user: buildAnalyzeUser(question, images.length),
    images,
    schema: AnalysisSchema,
    maxTokens: STRUCTURED_MAX_TOKENS,
  });
  cb.analysis(analysis);
  cb.stage('analyze', 'done', `${analysis.subQuestions.length}개 하위 질문`);

  cb.stage('retrieve', 'running');
  const sources = retrieveForAnalysis(kb, question, analysis);
  cb.sources(sources);
  cb.stage('retrieve', 'done', `근거 ${sources.length}건`);

  cb.stage('answer', 'running');
  let draft = '';
  draft = await streamText(client, {
    ...common,
    effort: settings.effort,
    system: ANSWER_SYSTEM,
    user: buildAnswerUser(question, analysis, sources, undefined, opsNotes),
    images,
    maxTokens: STREAM_MAX_TOKENS,
    onThinking: thinkingReporter((d) => cb.stage('answer', 'running', d), '답변 작성'),
    onText: (delta) => {
      draft += delta;
      cb.answer(draft, 'draft');
    },
  });
  cb.answer(draft, 'draft');
  cb.stage('answer', 'done', `${draft.length.toLocaleString()}자`);

  cb.stage('verify', 'running');
  const verifyParams = {
    client,
    model: VERIFIER_MODEL,
    signal,
    effort: settings.effort,
    question,
    sources,
    kb,
    confidentialTerms: opsNotes?.confidentialTerms ?? [],
  };
  const draftVerification = await verifyAnswer({ ...verifyParams, answer: draft });
  cb.verification(draftVerification, 'draft');
  cb.stage('verify', 'done', `주장 ${draftVerification.claims.length}건 검사`);

  const issues = describeIssues(draftVerification);
  const skipReason =
    draftVerification.summary.status === 'verified'
      ? '수정 불필요'
      : !settings.autoRevise
        ? '자동 수정 꺼짐'
        : !issues.length
          ? '고칠 항목 없음(검토 권장)'
          : null;
  if (skipReason) {
    cb.stage('revise', 'skipped', skipReason);
    return { analysis, sources, draft, draftVerification, final: draft, finalVerification: draftVerification, revised: false };
  }

  cb.stage('revise', 'running', `문제 ${issues.length}건 수정 중`);
  let revised = '';
  revised = await streamText(client, {
    ...common,
    effort: settings.effort,
    system: REVISE_SYSTEM,
    user: buildReviseUser(question, draft, issues, sources),
    maxTokens: STREAM_MAX_TOKENS,
    onThinking: thinkingReporter((d) => cb.stage('revise', 'running', d), '수정'),
    onText: (delta) => {
      revised += delta;
      cb.answer(revised, 'revised');
    },
  });
  cb.answer(revised, 'revised');
  const finalVerification = await verifyAnswer({ ...verifyParams, answer: revised });
  cb.verification(finalVerification, 'revised');
  cb.stage('revise', 'done', `재검증: ${finalVerification.summary.status}`);
  return { analysis, sources, draft, draftVerification, final: revised, finalVerification, revised: true };
}
