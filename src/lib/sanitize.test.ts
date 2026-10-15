import { describe, expect, it } from 'vitest';
import { classifyHref } from './sanitize';

describe('classifyHref', () => {
  it('accepts in-page citation anchors', () => {
    expect(classifyHref('#src-3')).toBe('citation');
  });

  it('accepts https links to official domains regardless of case', () => {
    expect(classifyHref('HTTPS://maplestoryworlds-creators.nexon.com/ko/docs?postId=1')).toBe('external');
    expect(classifyHref('https://discord.com/channels/1/2')).toBe('external');
  });

  it('blocks other hosts, plain http, javascript urls and garbage', () => {
    expect(classifyHref('https://evil.example/phish')).toBe('blocked');
    expect(classifyHref('http://maplestoryworlds.nexon.com')).toBe('blocked');
    expect(classifyHref('javascript:alert(1)')).toBe('blocked');
    expect(classifyHref('#other')).toBe('blocked');
    expect(classifyHref(null)).toBe('blocked');
  });
});
