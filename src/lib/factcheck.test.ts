import { describe, expect, it } from 'vitest';
import { applyQuoteChecks, findUnlinkedSentences, normalizeForMatch, quoteFound, summarizeVerification, type Claim } from './factcheck';

const sources = new Map<number, string>([
  [1, 'WorldOrientation은 Landscape, Portrait, Responsive 중 하나를 선택하면 월드 전체에 동일한 설정이 적용됩니다.'],
  [2, 'SpawnByModelId(string id, string name, Vector3 spawnPosition, Entity parent)\nid에 해당하는 모델을 바탕으로 새로운 엔티티를 스폰합니다.'],
]);

describe('normalizeForMatch', () => {
  it('drops whitespace, punctuation and markdown markers', () => {
    expect(normalizeForMatch('**월드 전체** 에, "동일한"  설정!')).toBe('월드전체에동일한설정');
  });
});

describe('quoteFound', () => {
  it('matches despite spacing and punctuation differences', () => {
    expect(quoteFound('월드 전체에 동일한 설정이 적용됩니다', sources.get(1)!)).toBe(true);
  });

  it('matches elided quotes segment by segment', () => {
    expect(quoteFound('Landscape, Portrait ... 월드 전체에 동일한 설정', sources.get(1)!)).toBe(true);
  });

  it('rejects text that is not in the source', () => {
    expect(quoteFound('PC와 모바일을 각각 다르게 설정할 수 있습니다', sources.get(1)!)).toBe(false);
  });

  it('tolerates a single small typo through fuzzy matching', () => {
    expect(quoteFound('모델을 바탕으로 새로운 엔티티를 스폰함니다', sources.get(2)!)).toBe(true);
  });

  it('rejects empty quotes', () => {
    expect(quoteFound('  ', sources.get(1)!)).toBe(false);
  });
});

// 레드팀 H-3: 퍼지 매칭이 의미를 뒤집는 1~2자 변경까지 '원문 일치'로 받아들이던 문제
describe('quoteFound rejects meaning-changing edits', () => {
  const rule = '공정한 심사를 위해 심사 기간에는 출품하신 월드를 수정할 수 없습니다. 모집 종료 시점은 10월 7일 02:00 UTC입니다. 공개 출시로 테스트하는 것은 가능합니다. 쿨타임은 1.5초이며 최대 40%까지 줄일 수 있습니다.';

  it('rejects a flipped negation', () => {
    expect(quoteFound('심사 기간에는 출품하신 월드를 수정할 수 있습니다', rule)).toBe(false);
  });

  it('rejects an inserted negation', () => {
    expect(quoteFound('공개 출시로 테스트하는 것은 불가능합니다', rule)).toBe(false);
  });

  it('rejects a changed number', () => {
    expect(quoteFound('모집 종료 시점은 10월 17일 02:00 UTC입니다', rule)).toBe(false);
  });

  it('keeps decimal points and percent signs significant', () => {
    expect(quoteFound('쿨타임은 15초이며', rule)).toBe(false);
    expect(quoteFound('쿨타임은 1.5초이며 최대 40까지', rule)).toBe(false);
    expect(quoteFound('쿨타임은 1.5초이며 최대 40%까지', rule)).toBe(true);
  });

  it('rejects elided fragments stitched together out of order', () => {
    expect(quoteFound('공개 출시로 테스트하는 것은 … 심사 기간에는 출품하신 월드를', rule)).toBe(false);
    expect(quoteFound('심사 기간에는 출품하신 월드를 … 공개 출시로 테스트하는 것은', rule)).toBe(true);
  });

  // 코드 리뷰 지적 (HIGH 1, MEDIUM 2~4)
  it('does not let fuzzy matching re-admit a quote blocked by a negation prefix', () => {
    expect(quoteFound('가능한 경우에만 사용할 수 있습니다', '이 기능은 불가능한 경우에만 사용할 수 있습니다')).toBe(false);
    expect(quoteFound('공개 상태를 유지해야 합니다', '출품작은 비공개 상태를 유지해야 합니다')).toBe(false);
  });

  it('does not match a number inside a longer number', () => {
    expect(quoteFound('5초', rule)).toBe(false);
    expect(quoteFound('최대 4', rule)).toBe(false);
    expect(quoteFound('최대 40% 까지', '최대 140%까지 줄일 수 있습니다')).toBe(false);
  });

  it('treats contracted and polite negations as negation', () => {
    expect(quoteFound('출품 시 커뮤니티 등록은 필수입니다 꼭 확인', '출품 시 커뮤니티 등록은 필수가 아닙니다 꼭 확인')).toBe(false);
    expect(quoteFound('You can upload the world during the review period', "You can't upload the world during the review period")).toBe(false);
  });

  it('keeps comparison operators in code quotes', () => {
    expect(quoteFound('if count > maxCount then return end', 'if count < maxCount then return end')).toBe(false);
  });

  // 실제 E2E 회귀: 공백을 지우면서 이웃한 숫자가 붙어 정상 인용을 거부하던 문제
  it('does not glue numbers that were separated by whitespace or list markers', () => {
    expect(quoteFound('content 스킬 maplestory-skill-maker 1.1.0', '@maplestoryworlds/ai-cli 0.11.0\n\ncontent 스킬 maplestory-skill-maker 1.1.0\n\n① 엔진 26.10 대응')).toBe(true);
    expect(quoteFound('0.8.6이 안 뜨거나 여전히 느리다면', 'mswai --version\n→ 0.8.6\n```\n\n0.8.6이 안 뜨거나 여전히 느리다면')).toBe(true);
    expect(quoteFound('02:00 UTC', '10월 7일 02:00 UTC')).toBe(true);
  });

  it('ignores invisible format characters such as word joiners and emoji variation selectors', () => {
    expect(quoteFound('느리다면 🖥 토론방으로 알려 주세요', '느리다면\n⁠🖥️ 토론방으로 알려 주세요')).toBe(true);
  });

  it('retries a later occurrence when the first one is too far from the next fragment', () => {
    const far = `심사 기간 안내 ${'가나다라마바사아자차카타파하'.repeat(40)} 심사 기간 안내 이후 업데이트 가능`;
    expect(quoteFound('심사 기간 안내 … 업데이트 가능', far)).toBe(true);
  });

  it('still tolerates a typo that does not touch numbers or negation', () => {
    expect(quoteFound('심사 기간에는 출품하신 월드를 수정할 수 업습니다', rule)).toBe(false);
    expect(quoteFound('공정한 심사를 위해 심사 기갼에는 출품하신 월드를', rule)).toBe(true);
  });
});

describe('applyQuoteChecks', () => {
  const claims: Claim[] = [
    { claim: 'WorldOrientation은 월드 단위 설정이다', sources: [1], quote: '월드 전체에 동일한 설정이 적용됩니다', verdict: 'supported', note: '' },
    { claim: 'PC/모바일 분리 지정 가능', sources: [1], quote: 'PC와 모바일을 각각 지정', verdict: 'supported', note: '' },
    { claim: '없는 출처', sources: [7], quote: '무엇', verdict: 'supported', note: '' },
  ];

  it('keeps supported claims whose quote exists and downgrades the rest', () => {
    const checked = applyQuoteChecks(claims, sources);
    expect(checked[0]).toMatchObject({ verdict: 'supported', quoteVerified: true });
    expect(checked[1]).toMatchObject({ verdict: 'unsupported', quoteVerified: false });
    expect(checked[2]).toMatchObject({ verdict: 'unsupported', quoteVerified: false });
  });

  it('marks a claim as partial when the quote exists in another source but the citation is missing', () => {
    const [checked] = applyQuoteChecks(
      [{ claim: '모델 id 로 스폰', sources: [], quote: '모델을 바탕으로 새로운 엔티티를 스폰합니다', verdict: 'supported', note: '' }],
      sources,
    );
    expect(checked).toMatchObject({ verdict: 'partial', quoteVerified: true });
    expect(checked.note).toContain('인용 번호');
  });

  it('does not mutate the input claims', () => {
    applyQuoteChecks(claims, sources);
    expect(claims[1].verdict).toBe('supported');
  });
});

describe('summarizeVerification', () => {
  it('is verified only when every claim is supported and APIs and citations are clean', () => {
    const s = summarizeVerification(
      [{ claim: 'a', sources: [1], quote: 'q', verdict: 'supported', note: '', quoteVerified: true }],
      [{ status: 'verified' }],
      { invalid: [], coverage: 1 },
    );
    expect(s.status).toBe('verified');
  });

  it('is partial when some claims are unsupported', () => {
    const s = summarizeVerification(
      [
        { claim: 'a', sources: [1], quote: 'q', verdict: 'supported', note: '', quoteVerified: true },
        { claim: 'b', sources: [1], quote: 'q', verdict: 'unsupported', note: '', quoteVerified: false },
      ],
      [],
      { invalid: [], coverage: 0.9 },
    );
    expect(s.status).toBe('partial');
    expect(s.counts.unsupported).toBe(1);
  });

  it('fails when a claim contradicts the sources or an API name is invented', () => {
    expect(
      summarizeVerification([{ claim: 'a', sources: [1], quote: 'q', verdict: 'contradicted', note: '', quoteVerified: true }], [], {
        invalid: [],
        coverage: 1,
      }).status,
    ).toBe('failed');
    expect(summarizeVerification([], [{ status: 'unknown-member' }], { invalid: [], coverage: 1 }).status).toBe('failed');
  });

  it('does not fail for an unknown API name the asker used, but still asks for a human check', () => {
    const supported = [{ claim: 'a', sources: [1], quote: 'q', verdict: 'supported' as const, note: '', quoteVerified: true }];
    const s = summarizeVerification(supported, [{ status: 'unknown-member', fromQuestion: true }], { invalid: [], coverage: 1 });
    expect(s.status).toBe('partial');
    expect(s.reasons).toEqual(['질문에 나온, 레퍼런스에 없는 API 이름 1건 (답변이 사실처럼 설명하지 않는지 확인)']);
  });

  it('still fails when the answer invents a name next to one the asker used', () => {
    const s = summarizeVerification([], [{ status: 'unknown-member', fromQuestion: true }, { status: 'unknown-member' }], { invalid: [], coverage: 1 });
    expect(s.status).toBe('failed');
    expect(s.reasons[0]).toBe('공식 레퍼런스에 없는 API 멤버 1건');
  });

  it('fails when the answer links to a url that is not a source', () => {
    const s = summarizeVerification(
      [{ claim: 'a', sources: [1], quote: 'q', verdict: 'supported', note: '', quoteVerified: true }],
      [],
      { invalid: [], coverage: 1, unknownLinks: ['https://made-up.example'] },
    );
    expect(s.status).toBe('failed');
    expect(s.reasons).toContain('출처에 없는 링크 1건');
  });
});

// 레드팀 H-2: 검증기가 주장을 일부만 뽑으면 위험한 문장이 대조 없이 통과하던 문제
describe('findUnlinkedSentences', () => {
  const sentences = [
    { id: 'S1', text: 'SpawnByModelId 는 모델 id 로 엔티티를 스폰합니다 [1].' },
    { id: 'S2', text: '심사 기간에도 월드를 자유롭게 수정할 수 있습니다 [2].' },
    { id: 'S3', text: '위 방법을 차근차근 따라 해 보시면 도움이 될 것입니다.' },
  ];

  it('reports fact sentences that no claim was linked to', () => {
    const r = findUnlinkedSentences(sentences, [{ sentenceIds: ['S1'] }], []);
    expect(r.unlinked.map((s) => s.id)).toEqual(['S2', 'S3']);
  });

  it('accepts an exclusion only for sentences without numbers, permissions or prohibitions', () => {
    const r = findUnlinkedSentences(sentences, [{ sentenceIds: ['S1'] }], [
      { sentenceId: 'S2', reason: '인사' },
      { sentenceId: 'S3', reason: '일반 권고' },
    ]);
    expect(r.unlinked.map((s) => s.id)).toEqual(['S2']);
    expect(r.excluded).toEqual([{ text: sentences[2].text, reason: '일반 권고' }]);
  });

  it('ignores sentence ids the checker made up', () => {
    const r = findUnlinkedSentences(sentences.slice(0, 1), [{ sentenceIds: ['S9'] }], [{ sentenceId: 'S7', reason: 'x' }]);
    expect(r.unlinked.map((s) => s.id)).toEqual(['S1']);
  });
});

describe('summarizeVerification with sentence coverage', () => {
  it('downgrades to partial when a fact sentence was never checked', () => {
    const supported = [{ claim: 'a', sources: [1], quote: 'q', verdict: 'supported' as const, note: '', quoteVerified: true }];
    const s = summarizeVerification(supported, [], { invalid: [], coverage: 1 }, 2);
    expect(s.status).toBe('partial');
    expect(s.reasons).toEqual(['주장으로 대조되지 않은 사실 문장 2건']);
  });
});
