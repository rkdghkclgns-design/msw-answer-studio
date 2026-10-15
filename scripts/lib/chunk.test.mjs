import { describe, expect, it } from 'vitest';
import { chunkMarkdown, chunkPolicyText, packParagraphs, toParagraphs } from './chunk.mjs';

describe('toParagraphs', () => {
  it('keeps fenced code blocks intact', () => {
    const paras = toParagraphs('설명\n\n```lua\nlocal a = 1\n\nlocal b = 2\n```\n\n끝');
    expect(paras).toEqual(['설명', '```lua\nlocal a = 1\n\nlocal b = 2\n```', '끝']);
  });
});

describe('packParagraphs', () => {
  it('splits oversized paragraphs below the max chunk size', () => {
    const big = Array.from({ length: 200 }, (_, i) => `줄 ${i} ${'가'.repeat(20)}`).join('\n');
    const chunks = packParagraphs([big]);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 1800)).toBe(true);
  });
});

describe('chunkMarkdown', () => {
  it('records the heading path for each chunk', () => {
    const chunks = chunkMarkdown('# 상위\n본문 A\n## 하위\n본문 B');
    expect(chunks).toEqual([
      { heading: '상위', text: '본문 A' },
      { heading: '상위 > 하위', text: '본문 B' },
    ]);
  });
});

describe('chunkPolicyText', () => {
  it('starts a new chunk at each article header and keeps it as the heading', () => {
    const text = '크리에이터 이용약관\n제1조 (목적)\n이 약관은 ...\n제16조 (게시물의 이용)\n회사는 게시물을 ...\n[4-2-1] 금지 행위\n세부 내용은 다음과 같습니다.';
    const chunks = chunkPolicyText(text);
    expect(chunks.map((c) => c.heading)).toEqual(['크리에이터 이용약관', '제1조 (목적)', '제16조 (게시물의 이용)', '[4-2-1] 금지 행위']);
    expect(chunks[2].text).toContain('회사는 게시물을');
  });

  it('treats short bullet or standalone lines as headings (contest policy style)', () => {
    const chunks = chunkPolicyText('- 신규 공개 출시\n"출품작"은 기간 내 신규 공개 출시된 월드여야 합니다.\n본선 진출\n최대 30개 월드가 선정됩니다.');
    expect(chunks.map((c) => c.heading)).toEqual(['신규 공개 출시', '본선 진출']);
  });

  it('extracts inline numbered titles such as "6. 분쟁 해결. 본문"', () => {
    const chunks = chunkPolicyText('6. 분쟁 해결. 크리에이터는 신속하게 응답하고 ...\n16. 게시물. 본문 내용');
    expect(chunks.map((c) => c.heading)).toEqual(['6. 분쟁 해결', '16. 게시물']);
  });
});
