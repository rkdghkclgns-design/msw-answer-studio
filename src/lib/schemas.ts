// LLM 구조화 출력 스키마 (질문 분석 · 팩트체크)

import { z } from 'zod';
import { CATEGORY_IDS } from './taxonomy';

export const AnalysisSchema = z.object({
  language: z.enum(['ko', 'en', 'zh']).describe('질문자가 사용한 언어'),
  category: z.enum(CATEGORY_IDS),
  questionShapes: z
    .array(z.enum(['yes-no', 'how-to', 'troubleshoot', 'policy-permission', 'spec-limit', 'feature-request', 'clarification']))
    .describe('질문 형태(복수 가능)'),
  restatement: z.string().describe('서포터가 답변 첫머리에서 질문을 재진술하는 한 문장 (질문 언어)'),
  subQuestions: z
    .array(
      z.object({
        question: z.string().describe('하위 질문 하나 (원문 언어)'),
        searchQueries: z.array(z.string()).describe('공식 문서 검색용 한국어 키워드 쿼리 2~4개 (API 이름 포함)'),
      }),
    )
    .describe('질문에 포함된 개별 질문들 (1~5개)'),
  apiIdentifiers: z.array(z.string()).describe('관련 MSW API 식별자 (예: _DataStorageService, SpriteRendererComponent.SpriteRUID)'),
  needsOperatorDecision: z.boolean().describe('콘테스트 심사/정책 판단처럼 공식 문서만으로 답할 수 없고 운영 측 결정이 필요한가'),
  imageFindings: z
    .string()
    .describe('첨부 이미지에서 읽은 내용: 오류 메시지·로그·코드·설정값은 원문 그대로, 화면 상태는 짧게 (이미지가 없으면 빈 문자열)'),
});

export type Analysis = z.infer<typeof AnalysisSchema>;

export const VerificationSchema = z.object({
  claims: z.array(
    z.object({
      claim: z.string().describe('답변에 들어 있는 원자적 사실 주장 하나'),
      sources: z.array(z.number().int()).describe('답변이 이 주장에 붙인 출처 번호'),
      quote: z.string().describe('출처 원문에서 그대로 복사한 근거 구절 (없으면 빈 문자열)'),
      verdict: z.enum(['supported', 'partial', 'unsupported', 'contradicted']),
      note: z.string().describe('판정 이유 (한국어, 짧게)'),
      sentenceIds: z.array(z.string()).describe('이 주장이 들어 있는 <fact_sentences> 문장 ID (예: ["S2"])'),
    }),
  ),
  excludedSentences: z
    .array(z.object({ sentenceId: z.string(), reason: z.string().describe('사실 주장이 없는 이유 (한국어, 짧게)') }))
    .describe('사실 주장이 전혀 없어 대조하지 않은 문장 (숫자·날짜·가능/불가·허용/금지가 있는 문장은 넣지 않음)'),
});

export type VerificationOutput = z.infer<typeof VerificationSchema>;
