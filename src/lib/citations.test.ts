import { describe, expect, it } from 'vitest';
import { analyzeCitations, extractCitationNumbers, factualSentences, findUnknownLinks, splitSentences } from './citations';

describe('extractCitationNumbers', () => {
  it('reads single and list citations in order without duplicates', () => {
    expect(extractCitationNumbers('A [1] B [2, 4] C [3][1]')).toEqual([1, 2, 4, 3]);
  });

  it('does not treat policy clause numbers or ranges as citations', () => {
    expect(extractCitationNumbers('운영정책 [4-2-1] 과 [1-1], [3-1], 기간 [2024-2026]')).toEqual([]);
  });

  it('ignores markdown links and array indexes inside code', () => {
    expect(extractCitationNumbers('[문서](https://x) `arr[1]`')).toEqual([]);
  });
});

describe('splitSentences', () => {
  it('splits korean prose and skips code blocks and headings', () => {
    const text = '## 제목\n첫 문장입니다. 둘째 문장입니다!\n```lua\nlocal a = 1. b\n```\n- 목록 항목입니다';
    expect(splitSentences(text)).toEqual(['첫 문장입니다.', '둘째 문장입니다!', '목록 항목입니다']);
  });

  it('keeps a citation that follows the period with the previous sentence', () => {
    expect(splitSentences('설정은 월드 단위입니다. [1] 다음 문장입니다.')).toEqual(['설정은 월드 단위입니다. [1]', '다음 문장입니다.']);
  });

  it('skips whole-line bold headings even when they are numbered', () => {
    expect(splitSentences('**1. 모델 등록 문제**\n모델을 등록해야 합니다 [1].')).toEqual(['모델을 등록해야 합니다 [1].']);
  });

  it('does not split inside urls or version numbers', () => {
    expect(splitSentences('문서는 https://x.nexon.com/ko/apiReference 에 있고 v0.11.0 기준입니다.')).toEqual([
      '문서는 https://x.nexon.com/ko/apiReference 에 있고 v0.11.0 기준입니다.',
    ]);
  });

  it('splits chinese sentences without spaces', () => {
    expect(splitSentences('第一句。第二句。')).toEqual(['第一句。', '第二句。']);
  });
});

describe('analyzeCitations', () => {
  it('reports invalid source numbers and uncited factual sentences', () => {
    const answer = [
      '안녕하세요 크리에이터님, 문의 주셔서 감사합니다.',
      'WorldOrientation은 월드 전체 단위 설정입니다 [1].',
      'SpawnByModelId의 parent 인자에는 맵 엔티티를 넘겨야 합니다 [9].',
      'DataStorage 키는 최대 길이가 정해져 있으며 초과 시 오류가 발생합니다.',
    ].join('\n');
    const report = analyzeCitations(answer, 3);
    expect(report.used).toEqual([1, 9]);
    expect(report.invalid).toEqual([9]);
    expect(report.uncited).toEqual(['DataStorage 키는 최대 길이가 정해져 있으며 초과 시 오류가 발생합니다.']);
    expect(report.coverage).toBeCloseTo(2 / 3);
  });

  it('does not count the supporter template sentences as uncited facts', () => {
    const answer = [
      'Answer',
      '안녕하세요 크리에이터님, 글로벌 개발 콘테스트에 깊은 관심을 가지고 질문해 주셔서 감사합니다.',
      '다음과 같이 답변 드립니다.',
      'PC와 모바일을 다르게 설정하고자 하시는 상황으로 파악됩니다.',
      'WorldOrientation은 월드 전체 단위 설정입니다 [1].',
      '해당 방식을 통하여 원하시는 결과를 얻을 수 있을 것으로 예상됩니다.',
      '제공 드린 해결 방안의 적용이 어렵거나 추가적인 문의사항이 있으실 경우 편하게 문의 부탁 드립니다.',
    ].join('\n');
    expect(analyzeCitations(answer, 1).coverage).toBe(1);
  });

  it('does not require citations on hedged suggestions', () => {
    const answer = '클라이언트에서 호출했을 때의 동작은 공식 문서상 확인되지 않습니다.\n로그로 호출 시점을 비교해 보시길 권해 드립니다.';
    expect(analyzeCitations(answer, 1).uncited).toEqual([]);
  });

  it('treats an answer without factual sentences as fully covered', () => {
    expect(analyzeCitations('감사합니다.', 2).coverage).toBe(1);
  });

  it('ignores reference list lines when measuring coverage', () => {
    const answer = '**참고 자료**\n- 월드 설정 가이드: https://docs/1';
    expect(analyzeCitations(answer, 1, ['https://docs/1']).coverage).toBe(1);
  });
});

describe('findUnknownLinks', () => {
  it('flags links that are not among the source urls', () => {
    const answer = '자세한 내용은 https://docs/1 과 https://made-up.example/page 를 참고하세요. (https://docs/1).';
    expect(findUnknownLinks(answer, ['https://docs/1'])).toEqual(['https://made-up.example/page']);
  });

  it('accepts source urls with a hash fragment or wrapped in bold markers', () => {
    expect(findUnknownLinks('**https://docs/a?postId=1#sec** 참고', ['https://docs/a?postId=1'])).toEqual([]);
  });

  it('keeps the query string significant', () => {
    expect(findUnknownLinks('https://docs/a?postId=2', ['https://docs/a?postId=1'])).toEqual(['https://docs/a?postId=2']);
  });

  it('ignores urls inside code blocks', () => {
    expect(findUnknownLinks('```\nhttps://x.example\n```', [])).toEqual([]);
  });
});

describe('factualSentences', () => {
  it('numbers only the sentences that state facts, skipping greetings and references', () => {
    const answer = [
      '안녕하세요 크리에이터님, 질문해 주셔서 감사합니다.',
      '심사 기간 중에는 출품하신 월드를 수정할 수 없습니다 [1].',
      '**참고 자료**',
      '- 콘테스트 정책: https://guide.nexon.com/x',
      '참고 부탁드립니다. 감사합니다.',
    ].join('\n');
    expect(factualSentences(answer)).toEqual([{ id: 'S1', text: '심사 기간 중에는 출품하신 월드를 수정할 수 없습니다 [1].' }]);
  });
});

describe('restatements of attached images', () => {
  it('does not treat a plain description of the attached screen as a fact claim', () => {
    const answer = '첨부해 주신 화면에서 LEA-3004 MissingComponent 오류가 확인됩니다.';
    expect(factualSentences(answer)).toEqual([]);
    expect(factualSentences('The attached screenshot shows a LEA-3004 MissingComponent error in the console.')).toEqual([]);
  });

  it('still checks an image restatement that slips in a permission or prohibition', () => {
    const answer = '첨부해 주신 화면의 설정이라면 심사 기간에도 월드를 수정하실 수 있습니다.';
    expect(factualSentences(answer)).toHaveLength(1);
  });
});

describe('estimate disclaimers', () => {
  it('treats a sentence that labels something as the supporter\'s estimate as an uncertainty notice', () => {
    expect(factualSentences('위 원인은 오류 메시지와 컴포넌트 설명을 바탕으로 한 서포터의 추정입니다.')).toEqual([]);
    expect(factualSentences('이 해결 방법 자체는 공식 문서에 명시되어 있지 않으며 추정에 따른 제안입니다.')).toEqual([]);
  });

  it('still checks a disclaimer sentence that carries a permission claim', () => {
    expect(factualSentences('추정입니다만 심사 기간에도 수정이 가능합니다.')).toHaveLength(1);
  });
});
