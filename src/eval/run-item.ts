// 골든 문항 하나를 실제 파이프라인으로 돌려 채점 입력(RunOutcome)을 만든다.

import type { GoldenItem, RunOutcome } from '../lib/golden';
import type { KnowledgeBase } from '../lib/kb-core';
import { runPipeline, type PipelineCallbacks } from '../lib/pipeline';
import type { Settings } from '../lib/settings';

const silent: PipelineCallbacks = {
  stage: () => undefined,
  analysis: () => undefined,
  sources: () => undefined,
  answer: () => undefined,
  verification: () => undefined,
};

export interface ItemRun extends RunOutcome {
  readonly id: string;
  readonly seconds: number;
}

export async function runGoldenItem(item: GoldenItem, kb: KnowledgeBase, settings: Settings, signal: AbortSignal): Promise<ItemRun> {
  const started = performance.now();
  const seconds = () => Math.round((performance.now() - started) / 1000);
  try {
    const result = await runPipeline({ question: item.question, kb, settings, callbacks: silent, signal });
    return {
      id: item.id,
      answer: result.final,
      status: result.finalVerification.summary.status,
      sourceTitles: result.sources.map((s) => s.doc.title),
      needsOperatorDecision: result.analysis.needsOperatorDecision,
      seconds: seconds(),
    };
  } catch (error) {
    return {
      id: item.id,
      answer: '',
      status: 'error',
      sourceTitles: [],
      needsOperatorDecision: false,
      error: error instanceof Error ? error.message : String(error),
      seconds: seconds(),
    };
  }
}
