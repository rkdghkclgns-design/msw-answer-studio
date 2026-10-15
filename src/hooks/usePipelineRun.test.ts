import { describe, expect, it } from 'vitest';
import type { VerificationResult } from '../lib/verify';
import { INITIAL_RUN, runReducer, type RunState } from './usePipelineRun';

const verification = { summary: { status: 'partial' } } as unknown as VerificationResult;

function afterDraft(): RunState {
  let s = runReducer(INITIAL_RUN, { type: 'start', question: 'q' });
  s = runReducer(s, { type: 'answer', text: '초안 전체', phase: 'draft' });
  s = runReducer(s, { type: 'verification', result: verification, phase: 'draft' });
  return s;
}

describe('runReducer', () => {
  it('moves the draft aside when the revised stream starts', () => {
    const s = runReducer(afterDraft(), { type: 'answer', text: '수정', phase: 'revised' });
    expect(s).toMatchObject({ answer: '수정', draft: '초안 전체', phase: 'revised' });
  });

  it('restores the verified draft when the revision is cancelled midway', () => {
    let s = runReducer(afterDraft(), { type: 'answer', text: '수정 중간에 잘', phase: 'revised' });
    s = runReducer(s, { type: 'fail', error: '중단', cancelled: true });
    expect(s).toMatchObject({ status: 'cancelled', answer: '초안 전체', phase: 'draft', verification });
    expect(s.draft).toBeUndefined();
  });

  it('keeps the partial draft but marks the run as failed when drafting fails', () => {
    let s = runReducer(INITIAL_RUN, { type: 'start', question: 'q' });
    s = runReducer(s, { type: 'stage', id: 'answer', status: 'running' });
    s = runReducer(s, { type: 'answer', text: '부분', phase: 'draft' });
    s = runReducer(s, { type: 'fail', error: '네트워크', cancelled: false });
    expect(s).toMatchObject({ status: 'error', answer: '부분' });
    expect(s.stages.answer.status).toBe('error');
  });

  it('resets everything on a new start', () => {
    const s = runReducer(afterDraft(), { type: 'start', question: '새 질문' });
    expect(s).toMatchObject({ status: 'running', question: '새 질문', answer: '', sources: [] });
    expect(s.verification).toBeUndefined();
  });
});
