// Discord 수집본 공용 판별 규칙 (prepare-discord · build-qa 공용)

/** Global Creator Challenge Discord 서버 ID */
export const GUILD = '1460161189207212196';

/** 스레드 생성 시 봇이 붙이는 안내문(creation-qa: 문의 양식 / support: 운영 시간 안내) */
export const TEMPLATE_MESSAGE = /^\s*질의 전 확인|운영 시간 외 접수된 문의는|^\s*운영 시간\s*\n/;

/** 공식 서포터 답변의 정형 인사말 (ko / zh / en) */
export const OFFICIAL_GREETING =
  /^(Answer\s*\n,?\s*)?(안녕하세요[,!\s]*크리에이터님|您好[，,]\s*創作者|創作者您好|親愛的創作者|Hello,?\s*Creator|Hi,?\s*Creator)/i;

/**
 * 공식 답변 판별: 수집 시 공식 계정으로 분류된 글이 기준.
 * 계정명이 패턴에 안 걸린 공식 서포터 글을 보완하려고 인사말도 보되,
 * 질문자 본인(스레드 시작자)의 글은 인사말로 시작해도 공식으로 보지 않는다.
 */
export function isOfficialMessage(message, starterWho) {
  if (message.role === 'official') return true;
  return OFFICIAL_GREETING.test(message.text ?? '') && Boolean(message.who) && message.who !== starterWho;
}
