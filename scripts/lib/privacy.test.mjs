import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanKnowledgeBase } from '../scan-kb.mjs';
import { findPrivateData, sanitizeText } from './privacy.mjs';

const KB_DIR = join(process.cwd(), 'public', 'kb');

describe.skipIf(!existsSync(join(KB_DIR, 'qa.json')))('published knowledge base', () => {
  it('contains no private links, ids, emails or phone numbers', async () => {
    expect(await scanKnowledgeBase(KB_DIR)).toEqual([]);
  });
});

describe('sanitizeText', () => {
  it('restores the npm scope that Discord rendered as a mention', () => {
    expect(sanitizeText('npx @user/ai-cli init')).toBe('npx @maplestoryworlds/ai-cli init');
  });

  it('masks emails and phone numbers in common Korean formats', () => {
    const out = sanitizeText('메일 a.b@test.com / 010-1234-5678 / 010 1234 5678 / +82 10-1234-5678');
    expect(out).toBe('메일 [이메일] / [전화번호] / [전화번호] / [전화번호]');
  });

  it('does not treat digits inside Discord channel ids as phone numbers', () => {
    const url = 'https://discord.com/channels/1460161189207212196/1508686803882999859';
    expect(sanitizeText(url)).toBe(url);
  });

  it('masks group ids, world play ids and other 32-hex ids', () => {
    const out = sanitizeText('● 개발 그룹ID: 3Id4N\n월드: https://maplestoryworlds.nexon.com/ko/play/12172097c6eb425db6c12b2dee7a8942/ 키 0123456789abcdef0123456789abcdef');
    expect(out).toContain('개발 그룹ID: [ID]');
    expect(out).toContain('/ko/play/[월드ID]/');
    expect(out).toContain('키 [ID]');
  });

  it('removes form, drive and workspace links everywhere', () => {
    const out = sanitizeText('신청: https://forms.gle/AbC123 녹화본 (https://drive.google.com/drive/folders/17KS) 보드 https://padlet.com/x/y');
    expect(out).toBe('신청: (링크 생략) 녹화본 ((링크 생략)) 보드 (링크 생략)');
  });

  it('keeps official links in public channels', () => {
    const text = '가이드 https://maplestoryworlds-creators.nexon.com/ko/docs?postId=204 영상 https://youtu.be/ZI9Ixq3xKhM 예제 https://github.com/MSW-Git/GlobalContestExamples';
    expect(sanitizeText(text)).toBe(text);
  });

  it('keeps only Nexon and server links in restricted (cohort) channels', () => {
    const out = sanitizeText('영상 https://youtu.be/abc 가이드 https://guide.nexon.com/ko/x 채널 https://discord.com/channels/1460161189207212196/1 초대 https://discord.gg/xyz', { restricted: true });
    expect(out).toBe('영상 (링크 생략) 가이드 https://guide.nexon.com/ko/x 채널 https://discord.com/channels/1460161189207212196/1 초대 (링크 생략)');
  });

  it('does not mistake a versioned npm package for an email address', () => {
    expect(sanitizeText('npm i @maplestoryworlds/ai-cli@1.2.3')).toBe('npm i @maplestoryworlds/ai-cli@1.2.3');
  });

  it('removes blocked links written without a scheme or with a trailing dot in the host', () => {
    expect(sanitizeText('폼: forms.gle/AbC123 / 드라이브 https://drive.google.com./x')).toBe('폼: (링크 생략) / 드라이브 (링크 생략)');
    expect(findPrivateData('www.padlet.com/team/board').map((f) => f.kind)).toEqual(['link']);
  });

  it('does not join digits across line breaks into a phone number', () => {
    expect(sanitizeText('010\n1234\n5678')).toBe('010\n1234\n5678');
  });

  it('cleans Discord rendering leftovers', () => {
    expect(sanitizeText('본문\n,\n끝(수정됨)\n\n\n\n다음')).toBe('본문\n\n끝\n\n다음');
  });
});

describe('findPrivateData', () => {
  it('reports every kind of leftover private data', () => {
    const kinds = findPrivateData('https://forms.gle/a 0123456789abcdef0123456789abcdef x@y.com 그룹ID: abc12 010-1111-2222').map((f) => f.kind);
    expect(kinds).toEqual(expect.arrayContaining(['link', 'hex-id', 'email', 'group-id', 'phone']));
  });

  it('returns nothing for sanitized text', () => {
    expect(findPrivateData(sanitizeText('그룹ID: abc12 https://forms.gle/a x@y.com'))).toEqual([]);
  });
});
