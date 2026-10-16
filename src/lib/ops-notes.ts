// 운영 내부 메모(internal/ops-notes.json): 대외비 일정·운영 계획을 답변 판단에만 쓰고 답변에는 드러내지 않는다.
// 이 파일은 저장소·배포에 포함되지 않으며(.gitignore), 개발 서버(로컬 앱)에서만 읽는다.

import { z } from 'zod';
import { neutralizePromptTags as safe } from './sources';

export const OpsNotesSchema = z.object({
  updatedAt: z.string(),
  origin: z.string(),
  notes: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      /** shareable: 이미 공개된 내용, internal: 공지 전 대외비 */
      disclosure: z.enum(['shareable', 'internal']),
      text: z.string(),
    }),
  ),
  answerGuidance: z.array(z.string()),
  /** 답변에 나오면 대외비 노출로 보는 표현 (질문·출처에 이미 있으면 제외) */
  confidentialTerms: z.array(z.string()),
});

export type OpsNotes = z.infer<typeof OpsNotesSchema>;

export function parseOpsNotes(raw: unknown): OpsNotes | null {
  const parsed = OpsNotesSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** 로컬 개발 서버에서만 메모를 읽는다. 배포본에는 파일이 없고 읽으려 하지도 않는다. */
export async function loadOpsNotes(): Promise<OpsNotes | null> {
  if (!import.meta.env.DEV) return null;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}internal/ops-notes.json`, { cache: 'no-store' });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
    return parseOpsNotes(await res.json());
  } catch {
    return null;
  }
}

/**
 * 답변이 질문·출처에 없는 대외비 표현을 스스로 꺼냈는지 찾는다(대소문자 무시).
 * @param context 질문과 검색된 출처 원문을 이은 텍스트
 */
export function findConfidentialLeaks(answer: string, terms: readonly string[], context: string): string[] {
  const lowerAnswer = answer.toLowerCase();
  const lowerContext = context.toLowerCase();
  const leaks = terms.filter((t) => t.trim() && lowerAnswer.includes(t.toLowerCase()) && !lowerContext.includes(t.toLowerCase()));
  return [...new Set(leaks.map((t) => t.toLowerCase()))];
}

const DISCLOSURE_LABEL = { shareable: '공유 가능', internal: '내부 전용' } as const;

export function formatOpsNotesForPrompt(notes: OpsNotes): string {
  const items = notes.notes.map((n) => `- [${DISCLOSURE_LABEL[n.disclosure]}] ${safe(n.title)}: ${safe(n.text)}`);
  const guidance = notes.answerGuidance.map((g) => `- ${safe(g)}`);
  return [`기준일: ${safe(notes.updatedAt)}`, ...items, '답변 지침:', ...guidance].join('\n');
}
