// 답변 생성 실행 상태 (불변 업데이트 리듀서)

import { useCallback, useReducer, useRef } from 'react';
import { toLlmError } from '../lib/claude';
import type { KnowledgeBase } from '../lib/kb-core';
import { runPipeline, STAGES, type StageId, type StageStatus } from '../lib/pipeline';
import type { OpsNotes } from '../lib/ops-notes';
import type { Analysis } from '../lib/schemas';
import type { Settings } from '../lib/settings';
import type { Source } from '../lib/types';
import type { VerificationResult } from '../lib/verify';

export interface StageState {
  readonly status: StageStatus;
  readonly detail?: string;
}

export interface RunState {
  readonly status: 'idle' | 'running' | 'done' | 'error' | 'cancelled';
  readonly question: string;
  readonly stages: Readonly<Record<StageId, StageState>>;
  readonly analysis?: Analysis;
  readonly sources: readonly Source[];
  readonly answer: string;
  readonly phase: 'draft' | 'revised';
  readonly draft?: string;
  readonly draftVerification?: VerificationResult;
  readonly verification?: VerificationResult;
  readonly error?: string;
  readonly startedAt?: number;
  readonly finishedAt?: number;
}

type Action =
  | { type: 'start'; question: string }
  | { type: 'stage'; id: StageId; status: StageStatus; detail?: string }
  | { type: 'analysis'; analysis: Analysis }
  | { type: 'sources'; sources: readonly Source[] }
  | { type: 'answer'; text: string; phase: 'draft' | 'revised' }
  | { type: 'verification'; result: VerificationResult; phase: 'draft' | 'revised' }
  | { type: 'finish' }
  | { type: 'fail'; error: string; cancelled: boolean };

const idleStages = Object.fromEntries(STAGES.map((s) => [s.id, { status: 'idle' }])) as Record<StageId, StageState>;

export const INITIAL_RUN: RunState = { status: 'idle', question: '', stages: idleStages, sources: [], answer: '', phase: 'draft' };

function markRunningStagesAsError(stages: Record<StageId, StageState>): Record<StageId, StageState> {
  return Object.fromEntries(
    Object.entries(stages).map(([id, s]) => [id, s.status === 'running' ? { ...s, status: 'error' as const } : s]),
  ) as Record<StageId, StageState>;
}

export function runReducer(state: RunState, action: Action): RunState {
  switch (action.type) {
    case 'start':
      return { ...INITIAL_RUN, status: 'running', question: action.question, startedAt: Date.now() };
    case 'stage':
      return { ...state, stages: { ...state.stages, [action.id]: { status: action.status, detail: action.detail } } };
    case 'analysis':
      return { ...state, analysis: action.analysis };
    case 'sources':
      return { ...state, sources: action.sources };
    case 'answer':
      return action.phase === 'revised' && state.phase === 'draft'
        ? { ...state, draft: state.answer, answer: action.text, phase: 'revised' }
        : { ...state, answer: action.text, phase: action.phase };
    case 'verification':
      return action.phase === 'draft'
        ? { ...state, draftVerification: action.result, verification: action.result }
        : { ...state, verification: action.result };
    case 'finish':
      return { ...state, status: 'done', finishedAt: Date.now() };
    case 'fail':
      // 수정본 스트리밍 도중 중단·실패하면 잘린 수정본 대신 검증까지 마친 초안으로 되돌린다
      return {
        ...state,
        ...(state.phase === 'revised' && state.draft !== undefined
          ? { answer: state.draft, phase: 'draft' as const, draft: undefined, verification: state.draftVerification }
          : {}),
        status: action.cancelled ? 'cancelled' : 'error',
        error: action.error,
        stages: markRunningStagesAsError(state.stages),
        finishedAt: Date.now(),
      };
  }
}

export function usePipelineRun() {
  const [state, dispatch] = useReducer(runReducer, INITIAL_RUN);
  const controller = useRef<AbortController | null>(null);

  const start = useCallback(async (question: string, kb: KnowledgeBase, settings: Settings, opsNotes: OpsNotes | null = null) => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    dispatch({ type: 'start', question });
    try {
      await runPipeline({
        question,
        kb,
        settings,
        opsNotes,
        signal: abort.signal,
        callbacks: {
          stage: (id, status, detail) => dispatch({ type: 'stage', id, status, detail }),
          analysis: (analysis) => dispatch({ type: 'analysis', analysis }),
          sources: (sources) => dispatch({ type: 'sources', sources }),
          answer: (text, phase) => dispatch({ type: 'answer', text, phase }),
          verification: (result, phase) => dispatch({ type: 'verification', result, phase }),
        },
      });
      dispatch({ type: 'finish' });
    } catch (error) {
      const cancelled = abort.signal.aborted;
      dispatch({ type: 'fail', error: cancelled ? '사용자가 생성을 중단했습니다.' : toLlmError(error).message, cancelled });
    }
  }, []);

  const cancel = useCallback(() => controller.current?.abort(), []);

  return { state, start, cancel };
}
