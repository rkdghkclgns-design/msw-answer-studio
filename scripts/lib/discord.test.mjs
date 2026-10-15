import { describe, expect, it } from 'vitest';
import { isOfficialMessage, TEMPLATE_MESSAGE } from './discord.mjs';

describe('isOfficialMessage', () => {
  it('trusts messages classified as official at collection time', () => {
    expect(isOfficialMessage({ role: 'official', who: 'S1', text: '공지' }, 'C0')).toBe(true);
  });

  it('accepts official greetings from someone other than the thread starter', () => {
    expect(isOfficialMessage({ role: 'creator', who: 'C2', text: 'Answer\n,\n안녕하세요 크리에이터님, ...' }, 'C0')).toBe(true);
    expect(isOfficialMessage({ role: 'creator', who: 'C3', text: '創作者您好，感謝您' }, 'C0')).toBe(true);
  });

  it('never treats the asker as official even if they copy the greeting', () => {
    expect(isOfficialMessage({ role: 'creator', who: 'C0', text: '안녕하세요 크리에이터님, 저도 질문' }, 'C0')).toBe(false);
  });
});

describe('TEMPLATE_MESSAGE', () => {
  it('matches both bot templates but not real questions', () => {
    expect(TEMPLATE_MESSAGE.test('질의 전 확인\n문의를 남겨주실 때')).toBe(true);
    expect(TEMPLATE_MESSAGE.test('운영 시간\n• 월–금: 09:00')).toBe(true);
    expect(TEMPLATE_MESSAGE.test('운영 시간이 궁금합니다')).toBe(false);
  });
});
