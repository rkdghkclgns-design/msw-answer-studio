// 지식베이스에 실을 Discord 텍스트의 개인정보·비공개 자료 정리와 잔존 검사.
// - 신청 폼·드라이브·협업 보드 링크는 어디서든 제거 (참가자 전용 자료가 섞여 있음)
// - 참가자 한정(코호트) 채널은 넥슨 공식 도메인과 이 서버 채널 링크만 남김
// - 그룹 ID·월드 ID·32자리 ID·이메일·전화번호는 마스킹

import { GUILD } from './discord.mjs';

const LINK = /https?:\/\/[^\s)\]>"'<]+/g;
const OMITTED = '(링크 생략)';

/** 참가자 전용 자료가 올라가는 곳 — 공개 채널이라도 싣지 않는다 */
const BLOCKED_HOSTS = 'forms\\.gle|forms\\.cloud\\.microsoft|drive\\.google\\.com|docs\\.google\\.com|zep\\.us|padlet\\.com|notion\\.so|notion\\.site|notion\\.com|gemini\\.google\\.com|github\\.io';
const ALWAYS_BLOCKED_HOST = new RegExp(`(^|\\.)(${BLOCKED_HOSTS})$`, 'i');
// 스킴 없이 적힌 링크("forms.gle/abc", "www.padlet.com/x")
const BARE_BLOCKED_LINK = new RegExp(`(?<![\\w./@-])(?:www\\.)?(?:[\\w-]+\\.)*(?:${BLOCKED_HOSTS})\\.?/[^\\s)\\]>"'<]*`, 'gi');
const OFFICIAL_HOST = /(^|\.)nexon\.(com|link)$/i;
const SERVER_CHANNEL = new RegExp(`^https?://(discord|discordapp)\\.com/channels/${GUILD}/`, 'i');

// 약관 속 회사 공식 연락처는 개인정보가 아니다
const OFFICIAL_EMAIL_DOMAIN = /@(nexon\.co(\.kr)?|nexon\.com|tobenstudio\.com|tipalti\.com)$/i;
// 마지막 도메인 라벨이 영문이어야 이메일로 본다(`ai-cli@1.2.3` 같은 패키지 버전 제외)
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}\b/g;
// 구분자는 하이픈·공백만(줄바꿈으로 나뉜 숫자를 잇지 않는다)
const PHONE = /(?<![\d/])(?:\+82[- ]?|0)1[016789][- ]?\d{3,4}[- ]?\d{4}(?!\d)/g;
const GROUP_ID = /(그룹\s*ID\s*[:：]\s*)(?!\[ID\])[A-Za-z0-9]+/gi;
const WORLD_PLAY_ID = /(\/play\/)[0-9a-f]{32}/gi;
const HEX_ID = /(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])/gi;

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/\.$/, '');
  } catch {
    return '';
  }
}

function keepLink(url, restricted) {
  const host = hostOf(url);
  if (!host || ALWAYS_BLOCKED_HOST.test(host)) return false;
  if (!restricted) return true;
  return OFFICIAL_HOST.test(host) || SERVER_CHANNEL.test(url);
}

/**
 * @param {string} text
 * @param {{ restricted?: boolean }} [options] restricted: 참가자 한정 채널의 글
 */
export function sanitizeText(text, { restricted = false } = {}) {
  return text
    .replace(/@user\/ai-cli/g, '@maplestoryworlds/ai-cli')
    .replace(LINK, (url) => (keepLink(url, restricted) ? url : OMITTED))
    .replace(BARE_BLOCKED_LINK, OMITTED)
    .replace(EMAIL, (m) => (OFFICIAL_EMAIL_DOMAIN.test(m) ? m : '[이메일]'))
    .replace(PHONE, '[전화번호]')
    .replace(GROUP_ID, '$1[ID]')
    .replace(WORLD_PLAY_ID, '$1[월드ID]')
    .replace(HEX_ID, '[ID]')
    .replace(/^[ \t]*,[ \t]*$/gm, '')
    .replace(/\(수정됨\)[ \t]*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 정리 후에도 남은 개인정보·비공개 링크 (빌드 게이트용) */
export function findPrivateData(text) {
  const found = [];
  const add = (kind, match) => found.push({ kind, match });
  for (const url of text.match(LINK) ?? []) if (ALWAYS_BLOCKED_HOST.test(hostOf(url))) add('link', url);
  for (const m of text.match(BARE_BLOCKED_LINK) ?? []) add('link', m);
  for (const m of text.match(EMAIL) ?? []) if (!OFFICIAL_EMAIL_DOMAIN.test(m)) add('email', m);
  for (const m of text.match(PHONE) ?? []) add('phone', m);
  for (const m of text.matchAll(GROUP_ID)) add('group-id', m[0]);
  for (const m of text.match(HEX_ID) ?? []) add('hex-id', m);
  return found;
}
