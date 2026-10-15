import { describe, expect, it } from 'vitest';
import { gradeOutcome, summarizeGrades, validateGoldenSet, type GoldenItem, type RunOutcome } from './golden';

const item: GoldenItem = {
  id: 'trap-01',
  lang: 'ko',
  category: 'contest_ops',
  question: '심사 기간에 썸네일만 바꿔도 되나요?',
  expected: {
    gist: '심사 기간에는 월드 정보·이미지를 포함한 모든 수정이 허용되지 않는다.',
    mustMention: [['허용되지 않', '불가', '할 수 없'], ['심사']],
    mustNotMention: ['(수정|변경)(하셔도|해도) (됩니다|괜찮)'],
    requiredSourceHints: ['FAQ', '공지'],
    operatorDecision: false,
  },
  sourceRef: 'trap:FAQ 6번',
  trap: '썸네일은 괜찮다고 답하기 쉬움',
};

const outcome = (answer: string, extra: Partial<RunOutcome> = {}): RunOutcome => ({
  answer,
  status: 'verified',
  sourceTitles: ['메이플스토리 월드 FAQ'],
  needsOperatorDecision: false,
  ...extra,
});

describe('gradeOutcome', () => {
  it('passes an answer that states every required point and no forbidden claim', () => {
    const g = gradeOutcome(item, outcome('심사 기간에는 썸네일을 포함한 모든 수정이 허용되지 않습니다 [1].'));
    expect(g).toMatchObject({ correct: true, forbiddenHits: [], missingGroups: [], sourceHit: true, passedButWrong: false });
  });

  it('fails an answer that makes the forbidden claim, and flags it when it was marked verified', () => {
    const g = gradeOutcome(item, outcome('심사 기간이지만 썸네일은 수정해도 괜찮습니다. 다른 수정은 불가합니다.'));
    expect(g.correct).toBe(false);
    expect(g.forbiddenHits).toHaveLength(1);
    expect(g.passedButWrong).toBe(true);
  });

  it('reports the missing point groups', () => {
    const g = gradeOutcome(item, outcome('썸네일 변경은 불가합니다.'));
    expect(g.missingGroups).toEqual([['심사']]);
    expect(g.correct).toBe(false);
  });

  it('marks a correct answer that the app failed as a false alarm', () => {
    const g = gradeOutcome(item, outcome('심사 기간에는 수정이 불가합니다.', { status: 'failed' }));
    expect(g).toMatchObject({ correct: true, correctButFailed: true });
  });

  it('treats a run error as incorrect', () => {
    expect(gradeOutcome(item, outcome('', { status: 'error', error: 'timeout' })).correct).toBe(false);
  });

  it('checks retrieval hints and the operator-decision flag separately from correctness', () => {
    const g = gradeOutcome({ ...item, expected: { ...item.expected, operatorDecision: true } }, outcome('심사 기간에는 수정이 불가합니다.', { sourceTitles: ['SpawnService'] }));
    expect(g).toMatchObject({ correct: true, sourceHit: false, operatorFlagOk: false });
  });
});

describe('summarizeGrades', () => {
  it('computes the red-team release metrics', () => {
    const grades = [
      gradeOutcome(item, outcome('심사 기간에는 수정이 불가합니다.')),
      gradeOutcome(item, outcome('썸네일은 수정해도 됩니다. 심사와 무관합니다.')),
      gradeOutcome(item, outcome('심사 기간에는 수정이 불가합니다.', { status: 'failed' })),
      gradeOutcome(item, outcome('', { status: 'error', error: 'x' })),
    ];
    const s = summarizeGrades(grades);
    expect(s).toMatchObject({
      total: 4,
      correct: 2,
      forbiddenAnswers: 1,
      passedButWrong: 1,
      verifiedCount: 2,
      correctButFailed: 1,
      errors: 1,
    });
    expect(s.accuracy).toBeCloseTo(0.5);
    expect(s.passedButWrongRate).toBeCloseTo(0.5);
    expect(s.falseFailRate).toBeCloseTo(0.5);
    expect(s.byLang.ko).toEqual({ total: 4, correct: 2 });
  });
});

describe('validateGoldenSet', () => {
  it('accepts a well-formed set', () => {
    expect(validateGoldenSet([item])).toEqual([]);
  });

  it('rejects duplicate ids, invalid regexes, empty keyword groups and personal data', () => {
    const bad = [
      item,
      { ...item, expected: { ...item.expected, mustNotMention: ['(unclosed'] } },
      { ...item, id: 'x-2', expected: { ...item.expected, mustMention: [[]] } },
      { ...item, id: 'x-3', question: '문의는 someone@example.com 으로 주세요' },
    ];
    const errors = validateGoldenSet(bad).join('\n');
    expect(errors).toContain('중복 id');
    expect(errors).toContain('정규식');
    expect(errors).toContain('빈 키워드 묶음');
    expect(errors).toContain('개인정보');
  });

  it('rejects items that do not match the schema', () => {
    expect(validateGoldenSet([{ id: 'x' }]).length).toBeGreaterThan(0);
  });
});
