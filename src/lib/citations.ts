// 답변의 [n] 인용 표기를 파싱하고, 출처 번호 유효성·사실 문장 인용 커버리지·출처 밖 링크를 검사한다.
// 인용은 [1], [1, 3], [1][3] 형식만 인정한다. 범위([1-3])는 약관 조항 번호([4-2-1], [1-1])와
// 구별할 수 없으므로 인용으로 보지 않는다.

const CODE_BLOCK = /```[\s\S]*?```/g;
const INLINE_CODE = /`[^`\n]*`/g;
const MD_LINK = /\[[^\]]*\]\([^)]*\)/g;
const MAX_CITATION_NUMBER = 99;

/** 인용 묶음 정규식: [1] 또는 [1, 3] — 뒤에 '(' 가 오면 마크다운 링크이므로 제외 */
export const CITATION_GROUP = /\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\](?!\()/g;

// 라틴 문장부호는 뒤에 공백/줄끝이 올 때만 문장 끝(URL·버전 번호의 점 제외), CJK 문장부호는 바로 끊는다
const SENTENCE_BREAK = /([.!?](?:\s*\[\d{1,2}(?:\s*,\s*\d{1,2})*\])*)(?=\s|$)\s*|([。！？](?:\s*\[\d{1,2}(?:\s*,\s*\d{1,2})*\])*)\s*/g;
/** 줄 전체가 굵은 글씨인 소제목 (**1. 원인**, **서포터가 제안드리는 해결 방안**) */
const BOLD_HEADING_LINE = /^\*\*[^*]+\*\*:?$/;

// 서포터 답변 템플릿의 인사·재진술·마무리 문장은 사실 주장이 아니므로 인용 커버리지에서 뺀다
const TEMPLATE_PHRASES = [
  '안녕하세요',
  '감사합니다',
  '감사드립니다',
  '다음과 같이 답변',
  '다음과 같습니다',
  '상황으로 파악됩니다',
  '상황으로 보입니다',
  '상황으로 이해하였습니다',
  '분석한 원인은 다음으로 예상됩니다',
  '원하시는 결과를 얻을 수 있을 것으로 예상됩니다',
  '추가적인 문의사항이 있으실 경우',
  '편하게 문의 부탁',
  '추가로 궁금하신 점',
  '양해 부탁',
  '좋은 하루',
  'Hello Creator',
  'Please see our response',
  'feel free to contact',
  'help you achieve the result',
  'thank you',
  '您好',
  '創作者您好',
  '以下為您',
  '歡迎隨時與我們聯繫',
  '預期透過上述方式',
  '感謝',
  // 불확실성 고지·권고 문장(근거 없이 쓰도록 허용된 제안)은 사실 주장으로 보지 않는다
  '확인되지 않습니다',
  '권해 드립니다',
  '권해드립니다',
  '권장드립니다',
  '권장 드립니다',
  '확인해 주세요',
  '확인해 주시기 바랍니다',
  '확인해 보시',
  '비교해 보시',
  '시도해 보시',
  '가능성이 있습니다',
  '것으로 이해했습니다',
  '것으로 이해하였습니다',
  '것으로 예상됩니다',
  '추천드립니다',
  '추천 드립니다',
  '함께 적어 주시면',
  '함께 남겨 주시면',
  'You would like to know',
  'we recommend',
  'please check',
  'not confirmed in the official',
];
const MIN_FACTUAL_LENGTH = 20;

function stripCode(text: string): string {
  return text.replace(CODE_BLOCK, '\n').replace(INLINE_CODE, ' ');
}

function parseGroup(inner: string): number[] {
  return inner
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= MAX_CITATION_NUMBER);
}

export function extractCitationNumbers(text: string): number[] {
  const cleaned = stripCode(text).replace(MD_LINK, ' ');
  const out: number[] = [];
  for (const match of cleaned.matchAll(CITATION_GROUP)) {
    for (const n of parseGroup(match[1])) if (!out.includes(n)) out.push(n);
  }
  return out;
}

/** 문장 단위 분리. 문장부호 바로 뒤에 붙은 인용 표기는 앞 문장에 붙인다. 코드·제목·표 줄은 제외. */
export function splitSentences(text: string): string[] {
  return text
    .replace(CODE_BLOCK, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('|') && !BOLD_HEADING_LINE.test(line))
    .map((line) => line.replace(/^([-*•]|\d+[.)])\s+/, ''))
    .flatMap((line) => line.replace(SENTENCE_BREAK, '$1$2\u0000').split('\u0000'))
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface CitationReport {
  readonly used: number[];
  readonly invalid: number[];
  readonly uncited: string[];
  readonly coverage: number;
  /** 출처 목록에 없는 URL (지어낸 링크 의심) */
  readonly unknownLinks: string[];
}

const URL_PATTERN = /https?:\/\/[^\s<>()\]"'`*]+/g;
const URL_TRAILING = /[).,;:!?。、」』*_]+$/;

function normalizeUrl(url: string): string {
  return url.replace(URL_TRAILING, '').replace(/#.*$/, '').replace(/\/$/, '').toLowerCase();
}

export function findUnknownLinks(answer: string, allowedUrls: readonly string[]): string[] {
  const allowed = new Set(allowedUrls.map(normalizeUrl));
  const found = (answer.replace(CODE_BLOCK, ' ').match(URL_PATTERN) ?? []).map((u) => u.replace(URL_TRAILING, ''));
  return [...new Set(found)].filter((u) => !allowed.has(normalizeUrl(u)));
}

/** 참고 자료 목록·링크 줄은 사실 문장이 아니므로 커버리지 계산에서 뺀다 */
const REFERENCE_LINE = /^(\S.{0,80}:\s*)?<?https?:\/\/\S+>?$|^(참고 자료|References?|參考資料|Answer)\b/i;
const REFERENCE_HEADING = /^\**\s*(참고 자료|References?|參考資料)\s*:?\s*\**$/i;
// 링크 없는 운영 배포 문서의 참고 자료 줄. 본문 문장이 이 표시로 끝나도 검사를 피하지 않도록 참고 자료 제목 뒤에서만 뺀다.
const LINKLESS_REFERENCE = /^([-*•]\s*)?\S.{0,120}\(운영 배포 문서\)$/;

function withoutLinklessReferences(answer: string): string {
  let inReferences = false;
  return answer
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (REFERENCE_HEADING.test(t)) inReferences = true;
      return !(inReferences && LINKLESS_REFERENCE.test(t));
    })
    .join('\n');
}

const factualCandidates = (answer: string) => splitSentences(withoutLinklessReferences(answer)).filter(isFactual);

// 첨부 이미지 내용을 되짚는 문장은 질문 재진술과 같다. 다만 허용·금지 같은 판단이 섞이면 사실 주장으로 검사한다.
const IMAGE_RESTATEMENT = /첨부(해 주신|하신|된|한) (화면|이미지|스크린샷|로그|사진|캡처)|attached (screenshot|image|log|screen)|screenshot you (attached|shared)|您附上的|附件(圖片|截圖|画面|畫面)/i;
// "~는 서포터의 추정입니다"처럼 근거 없음을 밝히는 문장은 불확실성 고지다(판단이 섞이면 검사)
const ESTIMATE_NOTICE = /추정입니다|추정에 따른|추정한 (것|내용)|this is (our|the supporter's) (estimate|assumption)/i;
const POLICY_JUDGMENT = /가능|불가|허용|금지|필수|제한|의무|불이익|실격|수 있|수 없|\bcan\b|cannot|must|allowed|prohibit|可以|不可|禁止|必須/i;

function isFactual(sentence: string): boolean {
  const bare = sentence.replace(CITATION_GROUP, '').replace(/[*_]/g, '').trim();
  if (bare.length < MIN_FACTUAL_LENGTH || REFERENCE_LINE.test(bare)) return false;
  if ((IMAGE_RESTATEMENT.test(bare) || ESTIMATE_NOTICE.test(bare)) && !POLICY_JUDGMENT.test(bare)) return false;
  const lower = bare.toLowerCase();
  return !TEMPLATE_PHRASES.some((p) => lower.includes(p.toLowerCase()));
}

export interface FactSentence {
  readonly id: string;
  readonly text: string;
}

/** 팩트체크가 빠짐없이 대조해야 할 사실 문장 목록 (S1, S2 …). 인사·권고·참고 자료 줄은 뺀다. */
export function factualSentences(answer: string): FactSentence[] {
  return factualCandidates(answer).map((text, i) => ({ id: `S${i + 1}`, text }));
}

export function analyzeCitations(answer: string, sourceCount: number, allowedUrls: readonly string[] = []): CitationReport {
  const used = extractCitationNumbers(answer);
  const invalid = used.filter((n) => n < 1 || n > sourceCount);
  const factual = factualCandidates(answer);
  const uncited = factual.filter((s) => extractCitationNumbers(s).length === 0);
  return {
    used,
    invalid,
    uncited,
    coverage: factual.length ? (factual.length - uncited.length) / factual.length : 1,
    unknownLinks: allowedUrls.length ? findUnknownLinks(answer, allowedUrls) : [],
  };
}
