import { describe, expect, it } from 'vitest';
import { linkCitations, toDiscordPost } from './answer-format';
import type { KbDoc, Source } from './types';

const doc = (i: number, title: string): KbDoc => ({ i, id: i, title, trail: [title], section: 'docs', url: `https://docs/${i}`, modifiedAt: null });
const source = (n: number, d: KbDoc): Source => ({ n, chunkId: n, doc: d, heading: '', text: '', score: 1, pinned: false });

describe('linkCitations', () => {
  it('turns [n] markers into anchor superscripts', () => {
    expect(linkCitations('설정입니다 [1].')).toBe('설정입니다 <sup class="cite"><a href="#src-1" data-src="1">1</a></sup>.');
  });

  it('expands lists and ranges', () => {
    expect(linkCitations('A [1, 3]')).toContain('data-src="1">1</a>,<a href="#src-3" data-src="3">3</a></sup>');
  });

  it('leaves policy clause numbers as plain text', () => {
    expect(linkCitations('운영정책 [4-2-1] 에 따라')).toBe('운영정책 [4-2-1] 에 따라');
  });

  it('leaves code blocks, inline code and markdown links untouched', () => {
    const md = '`t[1]` [링크](https://x)\n```lua\nlocal a = t[2]\n```';
    expect(linkCitations(md)).toBe(md);
  });
});

describe('toDiscordPost', () => {
  const sources = [source(1, doc(1, 'WorldOrientation 가이드')), source(2, doc(2, 'DataStorage')), source(3, doc(1, 'WorldOrientation 가이드'))];

  it('removes citation markers and appends unique cited doc links', () => {
    const post = toDiscordPost('설정입니다 [1]. 저장합니다 [2][3].', sources);
    expect(post).toContain('설정입니다. 저장합니다.');
    expect(post).toContain('📎 참고 문서');
    expect(post).toContain('- WorldOrientation 가이드: <https://docs/1>');
    expect(post).toContain('- DataStorage: <https://docs/2>');
    expect(post.match(/docs\/1/g)).toHaveLength(1);
  });

  it('does not append a second reference list when the answer already has one', () => {
    const post = toDiscordPost('설정입니다 [1].\n\n**참고 자료**\n- WorldOrientation 가이드: https://docs/1', sources);
    expect(post).not.toContain('📎');
    expect(post).toContain('**참고 자료**');
  });

  it('keeps clause numbers when preparing the discord post', () => {
    expect(toDiscordPost('운영정책 [4-2-1] 에 따라 제한됩니다 [1].', sources)).toContain('운영정책 [4-2-1] 에 따라 제한됩니다.');
  });

  it('omits the reference section when nothing is cited', () => {
    expect(toDiscordPost('감사합니다.', sources)).toBe('감사합니다.');
  });
});
