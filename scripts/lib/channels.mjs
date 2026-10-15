// Discord 서버 전체 채널 수집본(ch-*.json)을 지식베이스 항목으로 변환한다.
// - 공지·FAQ·안내·자료실: 공식 글을 그대로 '공식 공지'로
// - 질문·토론·버그제보·피드백: 공식 답변이 달린 질문만 Q&A 로 (질문은 마스킹·축약)
// - 잡담·팀원구인·인증 등 커뮤니티: 공식 계정 글만 (일반 유저 글은 싣지 않음)

import { GUILD, isOfficialMessage, TEMPLATE_MESSAGE } from './discord.mjs';

export { GUILD };
const QUESTION_MAX = 400;

const NOTICE_CHANNEL = /공지|notice|announcement|公告|rules|규칙|자료실|안내사항|faq|tutorial|教學|교육자료|부트캠프|메커톤|월드잼|모각코-챌린지\s*$|event\b|이벤트공지|活動公告/i;
const QA_CHANNEL = /질문하기|개발문의|토론방|discussion|bug-report|버그제보|feedback|피드백|support|문의/i;
// '콘테스트' 와 겹치지 않도록 테스트 채널은 이름 전체로 지정.
// 멘토링 신청·팀원 구인·미션 인증·개발 공유는 개별 참가자 대상 글이라 지식으로 싣지 않는다.
const SKIP_CHANNEL = /ai-toolkit-테스트|change-roles|역할변경|linking|계정-연동|멘토링_신청|team-up|팀원구인|미션-인증|개발공유/i;
// 이벤트 참여 포럼: 운영진이 올린 이벤트 안내 원글만 싣고 참가자 댓글은 뺀다
const EVENT_FORUM = /event-participation|參與活動|이벤트참여/i;
// 이벤트 당첨자 발표는 개별 크리에이터·월드명을 나열할 뿐 문의 답변 근거가 아니므로 싣지 않는다
const WINNER_ANNOUNCEMENT = /당첨자\s*(발표|명단)|winners?\s+(announcement|list)|得獎名單|中獎名單/i;

// 특정 행사 참가자에게만 열린 채널: 근거로 쓸 때 적용 범위를 밝히고, 링크는 공식 도메인만 남긴다
const CHANNEL_SCOPES = [
  [/(\d+)회차/, (m) => `메커톤 ${m[1]}회차 참가자 한정`],
  [/ㆍ(공지방|질문하기|커뮤니케이션)$/, () => '메커톤 참가자 커뮤니티 한정'],
  [/메커톤/, () => '메커톤 참가자 대상'],
  [/부트캠프/, () => '부트캠프 참가자 대상'],
  [/월드잼/, () => 'MSW AI 월드잼 참가자 대상'],
  [/모각코/, () => '모각코 챌린지 참가자 대상'],
];

export function channelScope(label) {
  for (const [pattern, describe] of CHANNEL_SCOPES) {
    const m = label.match(pattern);
    if (m) return describe(m);
  }
  return null;
}

const squash = (text) => (text ?? '').replace(/\s+/g, ' ').trim();

/** 수집기가 답장 대상 글을 공식 글로 잘못 담은 경우(본문이 답장 대상과 같거나 그대로 시작) */
function isEchoOfReply(m) {
  const reply = squash(m.replyTo);
  return reply.length > 0 && squash(m.text).startsWith(reply);
}

export function classifyChannel(name, type) {
  if (SKIP_CHANNEL.test(name)) return 'skip';
  if (EVENT_FORUM.test(name)) return 'event';
  if (type === 'announcement' || NOTICE_CHANNEL.test(name)) return 'notice';
  if (QA_CHANNEL.test(name)) return 'qa';
  return 'community';
}

export function channelLabel(name) {
  return name
    .replace(/^읽지 않(음|은),?\s*/, '')
    .replace(/\s*\((채팅|공지|포럼) 채널\).*$/, '')
    .replace(/\(포럼 채널\).*$/, '')
    .replace(/,\s*비공개 채널\(잠김\)$/, '')
    .trim();
}

export function messageUrl(channelId, messageId) {
  return `https://discord.com/channels/${GUILD}/${channelId}${messageId ? `/${messageId}` : ''}`;
}

function firstLine(text, max = 80) {
  return (text.split('\n').find((l) => l.trim()) ?? '').replace(/[*#>`]/g, '').trim().slice(0, max);
}

/** 공지형: 채널 본문의 공식 글(공지 채널은 전부) + 포럼 게시글 스레드의 공식 글 */
function noticeEntries(ch, label, sanitize) {
  const announcementOnly = ch.type === 'announcement';
  const fromChannel = (ch.messages ?? [])
    .filter((m) => (announcementOnly || m.role === 'official') && m.text.trim().length > 30)
    .map((m) => ({
      id: `ch-${ch.channelId}-${m.mid}`,
      title: firstLine(sanitize(m.text)),
      trail: ['Discord 공식 공지', label],
      url: messageUrl(ch.channelId, m.mid),
      date: m.t,
      text: sanitize(m.text),
    }));
  const fromPosts = (ch.threads ?? []).flatMap((t) => {
    // 공지·FAQ 포럼은 운영진만 글을 올리므로 게시자 본인의 글과 공식 계정 글을 공식으로 본다
    const starter = t.messages?.[0]?.who;
    const official = (t.messages ?? []).filter((m) => m.role === 'official' || m.who === starter);
    if (!official.length) return [];
    return [
      {
        id: `ch-${ch.channelId}-t${t.threadId}`,
        title: sanitize((t.listTitle || t.title || firstLine(official[0].text)).replace(/^.*?"(.*)".*$/, '$1')).slice(0, 100),
        trail: ['Discord 공식 공지', label],
        url: messageUrl(t.threadId),
        date: official.at(-1)?.t ?? null,
        text: official.map((m) => sanitize(m.text)).join('\n\n'),
      },
    ];
  });
  return [...fromChannel, ...fromPosts];
}

/** Q&A 형: 스레드는 첫 질문 + 공식 답변, 채널 본문은 공식 답변과 그 답장 대상(또는 직전 질문) */
function qaEntries(ch, label, sanitize) {
  const threadEntries = (ch.threads ?? []).flatMap((t) => {
    const msgs = (t.messages ?? []).filter((m) => !TEMPLATE_MESSAGE.test(m.text) && m.text.trim());
    const starter = msgs.find((m) => m.role !== 'official')?.who;
    const answers = msgs.filter((m) => isOfficialMessage(m, starter));
    if (!answers.length) return [];
    const question = sanitize(msgs.find((m) => !isOfficialMessage(m, starter))?.text ?? '').slice(0, QUESTION_MAX);
    return [
      {
        id: `ch-${ch.channelId}-t${t.threadId}`,
        title: sanitize((t.listTitle || t.title || '').replace(/^.*?"(.*)".*$/, '$1')).slice(0, 100) || firstLine(question),
        trail: ['Discord 과거 공식 답변', label],
        url: messageUrl(t.threadId),
        date: answers.at(-1)?.t ?? null,
        text: `질문 요약: ${question}\n\n${answers.map((a) => `[공식 답변 ${a.t?.slice(0, 10) ?? ''}]\n${sanitize(a.text)}`).join('\n\n')}`,
      },
    ];
  });
  const msgs = ch.messages ?? [];
  const channelEntries = msgs.flatMap((m, i) => {
    if (m.role !== 'official' || m.text.trim().length < 30) return [];
    const previousQuestion = [...msgs.slice(0, i)].reverse().find((p) => p.role !== 'official' && p.text.trim());
    const question = sanitize(m.replyTo ?? previousQuestion?.text ?? '').slice(0, QUESTION_MAX);
    return [
      {
        id: `ch-${ch.channelId}-${m.mid}`,
        title: firstLine(question || sanitize(m.text)),
        trail: ['Discord 과거 공식 답변', label],
        url: messageUrl(ch.channelId, m.mid),
        date: m.t,
        text: `${question ? `질문 요약: ${question}\n\n` : ''}[공식 답변 ${m.t?.slice(0, 10) ?? ''}]\n${sanitize(m.text)}`,
      },
    ];
  });
  return [...threadEntries, ...channelEntries];
}

/** 커뮤니티형: 공식 계정 글만 공지로 */
function communityEntries(ch, label, sanitize) {
  const all = [...(ch.messages ?? []).map((m) => ({ m, where: ch.channelId })), ...(ch.threads ?? []).flatMap((t) => (t.messages ?? []).map((m) => ({ m, where: t.threadId })))];
  return all
    .filter(({ m }) => m.role === 'official' && m.text.trim().length > 60)
    .map(({ m, where }) => ({
      id: `ch-${ch.channelId}-${m.mid}`,
      title: firstLine(sanitize(m.text)),
      trail: ['Discord 공식 공지', label],
      url: messageUrl(where, m.mid),
      date: m.t,
      text: sanitize(m.text),
    }));
}

/** 이벤트 포럼: 공식 계정이 연 게시글의 원글만 */
function eventEntries(ch, label, sanitize) {
  return (ch.threads ?? []).flatMap((t) => {
    const first = t.messages?.[0];
    if (!first || first.role !== 'official' || first.text.trim().length < 30) return [];
    return [
      {
        id: `ch-${ch.channelId}-t${t.threadId}`,
        title: sanitize((t.listTitle || t.title || firstLine(first.text)).replace(/^.*?"(.*)".*$/, '$1')).slice(0, 100),
        trail: ['Discord 공식 공지', label],
        url: messageUrl(t.threadId),
        date: first.t,
        text: sanitize(first.text),
      },
    ];
  });
}

/** @returns {{ section: 'notice'|'qa', entry: object }[]} */
export function channelToEntries(ch, sanitize) {
  const label = channelLabel(ch.name ?? '');
  const kind = classifyChannel(label, ch.type);
  if (kind === 'skip') return [];
  const scope = channelScope(label);
  const clean = (text) => sanitize(text, { restricted: Boolean(scope) });
  const scoped = (entry) => (scope ? { ...entry, trail: [...entry.trail, `적용 범위: ${scope}`] } : entry);
  const dropEchoes = (messages) => (messages ?? []).filter((m) => !isEchoOfReply(m));
  const source = { ...ch, messages: dropEchoes(ch.messages), threads: (ch.threads ?? []).map((t) => ({ ...t, messages: dropEchoes(t.messages) })) };
  if (kind === 'qa') return qaEntries(source, label, clean).map((entry) => ({ section: 'qa', entry: scoped(entry) }));
  const notices = kind === 'event' ? eventEntries(source, label, clean) : kind === 'notice' ? noticeEntries(source, label, clean) : communityEntries(source, label, clean);
  // 본문의 "당첨자 발표일: 10/20" 같은 일정 안내는 남기도록 제목(첫 줄)만 본다
  return notices.filter((entry) => !WINNER_ANNOUNCEMENT.test(entry.title)).map((entry) => ({ section: 'notice', entry: scoped(entry) }));
}
