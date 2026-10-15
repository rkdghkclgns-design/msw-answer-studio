import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { createKnowledgeBase } from './kb-core';
import { runPipeline, type PipelineCallbacks, type StageId, type StageStatus } from './pipeline';
import type { Analysis } from './schemas';
import { DEFAULT_SETTINGS } from './settings';
import type { KbChunk, KbDoc, SymbolRegistry } from './types';

const docs: KbDoc[] = [
  { i: 0, id: 1, title: 'SpawnService', trail: ['Services', 'SpawnService'], section: 'apiReference', url: 'https://docs/spawn', modifiedAt: null },
  { i: 1, id: 2, title: '엔티티 스폰하기', trail: ['가이드'], section: 'docs', url: 'https://docs/guide', modifiedAt: null },
];
const chunks: KbChunk[] = [
  { d: 0, h: '개요', t: '엔티티 스폰 관련 기능을 제공합니다.' },
  { d: 0, h: '멤버', t: 'SpawnService.SpawnByModelId — Entity SpawnByModelId(string id, string name, Vector3 spawnPosition, Entity parent)\nid에 해당하는 모델을 바탕으로 새로운 엔티티를 스폰합니다.' },
  { d: 1, h: '스폰', t: '런타임에 모델을 스폰하려면 SpawnByModelId 를 사용하고 parent 에 맵 엔티티를 넘깁니다.' },
];
const registry: SymbolRegistry = {
  types: {
    SpawnService: {
      cat: 'Services',
      doc: 0,
      url: 'https://docs/spawn',
      summary: '',
      aliases: ['_SpawnService'],
      members: [{ k: 'method', n: 'SpawnByModelId', sig: 'Entity SpawnByModelId(string id, string name, Vector3 spawnPosition, Entity parent)', b: [], d: '' }],
    },
  },
};
const kb = createKnowledgeBase(docs, chunks, registry, { builtAt: '', crawledAt: '', docCount: 2, chunkCount: 3, apiTypeCount: 1, apiMemberCount: 1 });

const analysis: Analysis = {
  language: 'ko',
  category: 'scripting_api',
  questionShapes: ['how-to'],
  restatement: '스크립트로 몬스터를 스폰하고자 하시는 상황으로 파악됩니다.',
  subQuestions: [{ question: '스크립트로 몬스터를 스폰하는 방법', searchQueries: ['SpawnByModelId 스폰 parent'] }],
  apiIdentifiers: ['_SpawnService:SpawnByModelId'],
  needsOperatorDecision: false,
};

const supportedClaims = {
  claims: [
    {
      claim: 'SpawnByModelId 는 모델 id 로 엔티티를 스폰한다',
      sources: [1],
      quote: 'id에 해당하는 모델을 바탕으로 새로운 엔티티를 스폰합니다',
      verdict: 'supported',
      note: '',
      sentenceIds: ['S1'],
    },
  ],
  excludedSentences: [],
};

/** SDK 의 beta.messages.parse/stream 모양만 흉내 내는 가짜 클라이언트 */
function fakeClient(parseOutputs: unknown[], streamTexts: string[], models: string[] = []) {
  const parseQueue = [...parseOutputs];
  const streamQueue = [...streamTexts];
  const calls = { parse: 0, stream: 0 };
  const client = {
    beta: {
      messages: {
        create: async (body: { model: string }) => {
          calls.parse += 1;
          models.push(body.model);
          return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(parseQueue.shift()) }] };
        },
        stream: () => {
          calls.stream += 1;
          const text = streamQueue.shift() ?? '';
          const listeners: ((delta: string) => void)[] = [];
          return {
            on: (event: string, fn: (delta: string) => void) => {
              if (event === 'text') listeners.push(fn);
            },
            finalMessage: async () => {
              for (const piece of text.match(/.{1,12}/gs) ?? []) listeners.forEach((fn) => fn(piece));
              return { stop_reason: 'end_turn', content: [{ type: 'text', text }] };
            },
          };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

function recorder() {
  const stages: [StageId, StageStatus][] = [];
  const answers: string[] = [];
  const callbacks: PipelineCallbacks = {
    stage: (id, status) => stages.push([id, status]),
    analysis: () => undefined,
    sources: () => undefined,
    answer: (text) => answers.push(text),
    verification: () => undefined,
  };
  return { stages, answers, callbacks };
}

const settings = { ...DEFAULT_SETTINGS, apiKey: 'sk-ant-test' };
const goodAnswer = '안녕하세요 크리에이터님,\n`_SpawnService:SpawnByModelId` 는 id에 해당하는 모델로 엔티티를 스폰합니다 [1].\n감사합니다.';

describe('runPipeline', () => {
  it('skips revision when the draft passes every check', async () => {
    const { client, calls } = fakeClient([analysis, supportedClaims], [goodAnswer]);
    const rec = recorder();
    const result = await runPipeline({ question: '몬스터 스폰 방법?', kb, settings, callbacks: rec.callbacks, client });

    expect(result.sources[0]).toMatchObject({ pinned: true, doc: { title: 'SpawnService' } });
    expect(result.finalVerification.summary.status).toBe('verified');
    expect(result.revised).toBe(false);
    expect(calls).toEqual({ parse: 2, stream: 1 });
    expect(rec.stages.at(-1)).toEqual(['revise', 'skipped']);
    expect(rec.answers.at(-1)).toBe(goodAnswer);
  });

  it('revises and re-verifies when the draft invents an API member', async () => {
    const badDraft = '안녕하세요 크리에이터님,\n`_SpawnService:SpawnMonster()` 로 스폰할 수 있습니다 [1].\n감사합니다.';
    const draftClaims = {
      claims: [{ claim: 'SpawnMonster 로 스폰 가능', sources: [1], quote: '', verdict: 'unsupported', note: '출처에 없음', sentenceIds: ['S1'] }],
      excludedSentences: [],
    };
    const { client, calls } = fakeClient([analysis, draftClaims, supportedClaims], [badDraft, goodAnswer]);
    const rec = recorder();
    const result = await runPipeline({ question: '몬스터 스폰 방법?', kb, settings, callbacks: rec.callbacks, client });

    expect(result.draftVerification.summary.status).toBe('failed');
    expect(result.draftVerification.apiChecks.some((c) => c.status === 'unknown-member')).toBe(true);
    expect(result.revised).toBe(true);
    expect(result.final).toBe(goodAnswer);
    expect(result.finalVerification.summary.status).toBe('verified');
    expect(calls).toEqual({ parse: 3, stream: 2 });
    expect(rec.stages.at(-1)).toEqual(['revise', 'done']);
  });

  it('does not revise when auto-revise is turned off', async () => {
    const draftClaims = { claims: [{ claim: 'x', sources: [1], quote: '없는 문장', verdict: 'supported', note: '', sentenceIds: ['S1'] }], excludedSentences: [] };
    const { client } = fakeClient([analysis, draftClaims], [goodAnswer]);
    const rec = recorder();
    const result = await runPipeline({ question: 'q', kb, settings: { ...settings, autoRevise: false }, callbacks: rec.callbacks, client });
    expect(result.revised).toBe(false);
    expect(result.finalVerification.claims[0]).toMatchObject({ verdict: 'unsupported', quoteVerified: false });
  });

  // 레드팀 H-2: 쉬운 주장만 뽑고 위험한 문장을 빠뜨린 검증기 응답으로는 verified 가 나오면 안 된다
  it('does not report verified when the checker skips a risky sentence', async () => {
    const riskyAnswer = [
      '안녕하세요 크리에이터님,',
      '`_SpawnService:SpawnByModelId` 는 id에 해당하는 모델로 엔티티를 스폰합니다 [1].',
      '심사 기간에도 출품 월드를 자유롭게 수정할 수 있습니다 [1].',
      '감사합니다.',
    ].join('\n');
    const lazyChecker = { ...supportedClaims, excludedSentences: [{ sentenceId: 'S2', reason: '사실 주장 아님' }] };
    const { client } = fakeClient([analysis, lazyChecker], [riskyAnswer]);
    const rec = recorder();
    const result = await runPipeline({ question: 'q', kb, settings: { ...settings, autoRevise: false }, callbacks: rec.callbacks, client });
    expect(result.finalVerification.summary.status).toBe('partial');
    expect(result.finalVerification.unlinkedSentences).toEqual(['심사 기간에도 출품 월드를 자유롭게 수정할 수 있습니다 [1].']);
  });

  it('checks answers with the strongest model even when a smaller model writes them', async () => {
    const models: string[] = [];
    const { client } = fakeClient([analysis, supportedClaims], [goodAnswer], models);
    await runPipeline({ question: 'q', kb, settings: { ...settings, model: 'claude-haiku-5-5' }, callbacks: recorder().callbacks, client });
    expect(models).toEqual(['claude-haiku-5-5', 'claude-opus-5-5']);
  });
});
