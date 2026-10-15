import { describe, expect, it } from 'vitest';
import { channelLabel, channelScope, channelToEntries, classifyChannel } from './channels.mjs';

const id = (s) => s;
const msg = (mid, role, who, text, extra = {}) => ({ mid, role, who, text, t: '2026-10-01T00:00:00Z', ...extra });

describe('classifyChannel', () => {
  it('routes channels by purpose', () => {
    expect(classifyChannel('📣・콘테스트공지', 'announcement')).toBe('notice');
    expect(classifyChannel('⚙️・creator-faq', 'forum')).toBe('notice');
    expect(classifyChannel('🤚1회차_질문하기', 'text')).toBe('qa');
    expect(classifyChannel('🖥️・ai-toolkit-토론방｜discussion｜討論區', 'text')).toBe('qa');
    expect(classifyChannel('🗨️・한국어', 'text')).toBe('community');
    expect(classifyChannel('🔒・ai-toolkit-테스트', 'text')).toBe('skip');
    expect(classifyChannel('🧭1회차_멘토링_신청', 'forum')).toBe('skip');
    expect(classifyChannel('🤝・team-up｜팀원구인｜組隊招募', 'forum')).toBe('skip');
  });
});

describe('channelLabel', () => {
  it('drops unread and type suffixes', () => {
    expect(channelLabel('읽지 않음, 🎁・이벤트참여(포럼 채널), 비공개 채널(잠김)')).toBe('🎁・이벤트참여');
    expect(channelLabel('📣・콘테스트공지 (공지 채널), 비공개 채널(잠김)')).toBe('📣・콘테스트공지');
  });
});

describe('channelToEntries', () => {
  it('keeps every post in announcement channels', () => {
    const ch = { channelId: '1', name: '📣・콘테스트공지 (공지 채널)', type: 'announcement', messages: [msg('10', 'creator', 'C0', '심사 기간 동안에는 출품 월드의 업데이트가 제한됩니다. 자세한 내용은 공지를 확인해 주세요.')], threads: [] };
    const entries = channelToEntries(ch, id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ section: 'notice', entry: { url: 'https://discord.com/channels/1460161189207212196/1/10' } });
  });

  it('pairs official replies in question channels with the replied-to question', () => {
    const ch = {
      channelId: '2',
      name: '🤚1회차_질문하기 (채팅 채널)',
      type: 'text',
      messages: [
        msg('1', 'creator', 'C0', '타일맵에서 충돌이 안 됩니다'),
        msg('2', 'official', 'S1', '안녕하세요 크리에이터님, 타일 속성에서 충돌 여부를 확인해 주세요. 관련 가이드를 참고해 주세요.', { replyTo: '타일맵에서 충돌이 안 됩니다' }),
      ],
      threads: [],
    };
    const [e] = channelToEntries(ch, id);
    expect(e.section).toBe('qa');
    expect(e.entry.text).toContain('질문 요약: 타일맵에서 충돌이 안 됩니다');
    expect(e.entry.text).toContain('[공식 답변 2026-10-01]');
  });

  it('publishes only official posts from community channels', () => {
    const ch = {
      channelId: '3',
      name: '🗨️・한국어 (채팅 채널)',
      type: 'text',
      messages: [
        msg('1', 'creator', 'C0', '개인적인 잡담 메시지입니다. 이 글은 지식베이스에 들어가면 안 됩니다. 길게 써도 마찬가지입니다.'),
        msg('2', 'official', 'S1', '안녕하세요 크리에이터 여러분, 오늘 18시에 점검이 진행됩니다. 점검 중에는 메이커 접속이 제한되니 참고 부탁드립니다.'),
      ],
      threads: [],
    };
    const entries = channelToEntries(ch, id);
    expect(entries).toHaveLength(1);
    expect(entries[0].entry.text).toContain('점검');
  });

  it('keeps only official opening posts from event forums', () => {
    const ch = {
      channelId: '5',
      name: '🎁・이벤트참여(포럼 채널)',
      type: 'forum',
      messages: [],
      threads: [
        { threadId: '50', title: '코드 문제 풀기', messages: [msg('1', 'official', 'S1', '이벤트 안내: 아래 Lua 코드의 결과를 맞혀 주세요. 참여 기간은 10/1~10/7 입니다.'), msg('2', 'creator', 'C1', '정답은 42입니다')] },
        { threadId: '51', title: '참가 인증', messages: [msg('3', 'creator', 'C2', '제 월드 참가 인증합니다. 많이 놀러 와 주세요! 감사합니다 여러분')] },
      ],
    };
    const entries = channelToEntries(ch, id);
    expect(entries).toHaveLength(1);
    expect(entries[0].entry.text).not.toContain('정답은 42');
  });

  it('drops event winner announcements, which name individual creators and their worlds', () => {
    const ch = {
      channelId: '6',
      name: '📣・콘테스트공지 (공지 채널)',
      type: 'announcement',
      messages: [
        msg('1', 'official', 'S1', '💾[Build & Struggle 3차] 이달의 개발 분투기 3차 당첨자 발표\n@user (메이플 에이지) @user (보드 게임)'),
        msg('2', 'official', 'S1', '🎉 디스코드 계정 연동 이벤트 당첨자 발표 — 추첨을 통해 선정된 당첨자를 아래와 같이 발표합니다.'),
        msg('3', 'official', 'S1', '이벤트 참여 방법 안내\n기간 내 개발 분투기를 작성하면 추첨으로 선정합니다. 당첨자 발표: 10/20(화)'),
      ],
      threads: [],
    };
    const entries = channelToEntries(ch, id);
    expect(entries.map((e) => e.entry.url.split('/').at(-1))).toEqual(['3']);
  });

  it('labels participant-only channels with their scope and sanitizes them as restricted', () => {
    const calls = [];
    const spy = (t, opts) => (calls.push(opts?.restricted ?? false), t);
    const ch = { channelId: '7', name: '📢1회차_공지방 (채팅 채널), 비공개 채널(잠김)', type: 'text', messages: [msg('1', 'official', 'S1', '메커톤 1회차 참가자 여러분, 녹화본은 아래 링크에서 확인해 주세요. 외부 공유는 삼가 주세요.')], threads: [] };
    const [e] = channelToEntries(ch, spy);
    expect(e.entry.trail).toEqual(['Discord 공식 공지', '📢1회차_공지방', '적용 범위: 메커톤 1회차 참가자 한정']);
    expect(calls.every(Boolean)).toBe(true);
  });

  it('sanitizes forum post titles too', () => {
    const ch = {
      channelId: '9',
      name: '⚙️・creator-faq (포럼 채널)',
      type: 'forum',
      messages: [],
      threads: [{ threadId: '90', title: '문의는 a@b.com 으로', messages: [msg('1', 'official', 'S1', '자주 묻는 질문 안내입니다. 출품 절차와 심사 일정은 공지를 확인해 주세요.')] }],
    };
    const mask = (t) => t.replace(/[\w.]+@[\w.]+/g, '[이메일]');
    expect(channelToEntries(ch, mask)[0].entry.title).toBe('문의는 [이메일] 으로');
  });

  it('leaves server-wide channels unscoped', () => {
    expect(channelScope('📣・콘테스트공지')).toBeNull();
    expect(channelScope('🙋ㆍ질문하기')).toBe('메커톤 참가자 커뮤니티 한정');
    expect(channelScope('📣・msw-ai-월드잼')).toBe('MSW AI 월드잼 참가자 대상');
  });

  it('drops "official" messages that merely echo the message they reply to (collector mislabel)', () => {
    const ch = {
      channelId: '8',
      name: '🤚2회차_질문하기 (채팅 채널)',
      type: 'text',
      messages: [
        msg('1', 'creator', 'C0', '혹시 QA 채널은 어딘가요? 질문을 어디에 남기면 될까요?'),
        msg('2', 'official', 'C0', '혹시 QA 채널은 어딘가요? 질문을 어디에 남기면 될까요?', { replyTo: '혹시 QA 채널은 어딘가요? 질문을 어디에 남기면 될까요?' }),
      ],
      threads: [],
    };
    expect(channelToEntries(ch, id)).toEqual([]);
  });

  it('skips test channels entirely', () => {
    expect(channelToEntries({ channelId: '4', name: '🔒・ai-toolkit-테스트', type: 'text', messages: [msg('1', 'official', 'S1', 'x'.repeat(100))], threads: [] }, id)).toEqual([]);
  });
});
