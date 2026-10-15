import { describe, expect, it } from 'vitest';
import { badgeOf, cleanMarkdown, decodeEntities, htmlToText, parseTable } from './html-text.mjs';

describe('decodeEntities', () => {
  it('decodes named, decimal and hex entities', () => {
    expect(decodeEntities('&ldquo;주최자&rdquo; &amp; &#65;&#x42; &middot;')).toBe('“주최자” & AB ·');
  });

  it('keeps unknown entities as-is', () => {
    expect(decodeEntities('&unknown;')).toBe('&unknown;');
  });
});

describe('htmlToText', () => {
  it('drops style/script blocks and comments', () => {
    expect(htmlToText('<style>p{margin:0}</style><!-- x --><p>본문</p><script>var a</script>')).toBe('본문');
  });

  it('turns shields badges into tags and keeps line structure', () => {
    const html = '<span>int</span> <b>Count</b><img src="https://img.shields.io/static/v1?label=&amp;message=ReadOnly&amp;color=orange"><br/>설명<ul><li>하나</li><li>둘</li></ul>';
    expect(htmlToText(html)).toBe('int Count [ReadOnly]\n설명\n- 하나\n- 둘');
  });
});

describe('badgeOf', () => {
  it('includes the label when present', () => {
    expect(badgeOf('<img src="x?label=Space&amp;message=Client&amp;color=c">')).toBe('[Space:Client]');
  });
});

describe('parseTable', () => {
  it('returns rows of cell texts', () => {
    const rows = parseTable('<table><tr><th>이름</th><th>값</th></tr><tr><td>KR</td><td>0</td></tr></table>');
    expect(rows.map((r) => r.map((c) => c.text))).toEqual([
      ['이름', '값'],
      ['KR', '0'],
    ]);
  });
});

describe('cleanMarkdown', () => {
  it('absolutizes relative links and removes target hints and images', () => {
    const md = '[가이드](/docs?postId=1{"target":"_blank"}) ![img](a.png)';
    expect(cleanMarkdown(md)).toBe('[가이드](https://maplestoryworlds-creators.nexon.com/ko/docs?postId=1)');
  });

  it('replaces youtube embeds and drops child list markers', () => {
    expect(cleanMarkdown('$$youtube\n/abc123\n$$\n$$childList\n$$')).toBe('(영상: https://youtu.be/abc123)');
  });
});
