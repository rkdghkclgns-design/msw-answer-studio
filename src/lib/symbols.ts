// 답변 속 API 식별자를 공식 API 레퍼런스 레지스트리와 대조하는 결정론적 검증기.

import type { ApiMember, SymbolRegistry } from './types';

export type MentionStatus = 'verified' | 'deprecated' | 'unknown-member' | 'unknown-type';

export interface ApiMention {
  readonly text: string;
  readonly type: string;
  readonly member?: string;
}

export interface MentionCheck {
  readonly text: string;
  readonly status: MentionStatus;
  readonly typeName?: string;
  readonly badges: readonly string[];
  readonly signature?: string;
  readonly url?: string;
  readonly note: string;
  /** 레퍼런스에 없는 이름이지만 질문자가 직접 쓴 이름 — 답변의 창작이 아니다 */
  readonly fromQuestion?: boolean;
}

export interface SymbolLookup {
  resolveType(name: string): string | null;
  findMembers(typeName: string, member: string): readonly ApiMember[];
  categoryOf(typeName: string): string | null;
  urlOf(typeName: string): string | null;
  /** 어떤 타입의 멤버 이름인지 (ConnectEvent, GetComponent 같은 메서드명 오탐 방지) */
  isMemberName(name: string): boolean;
}

const BASE_TYPE_BY_CATEGORY: Readonly<Record<string, string>> = {
  Components: 'Component',
  Services: 'Service',
  Logics: 'Logic',
  Events: 'EventType',
};

const CHAIN = /[A-Za-z_][A-Za-z0-9_]*(?:[:.][A-Za-z_][A-Za-z0-9_]*)+/g;
// 앞에 . 또는 : 가 붙은 이름은 멤버 접근(메서드·프로퍼티)이므로 단독 타입 후보에서 제외
const TYPE_LIKE = /(?<![\w.:])_?[A-Z][A-Za-z0-9]*(?:Service|Component|Event|Logic)(?![\w])/g;
const UPPER_START = /^_?[A-Z]/;
const DEPRECATED = '[Deprecated]';

export function createSymbolLookup(registry: SymbolRegistry): SymbolLookup {
  const byAlias = new Map<string, string>();
  const memberNames = new Set<string>();
  for (const [name, type] of Object.entries(registry.types)) {
    byAlias.set(name, name);
    for (const alias of type.aliases) byAlias.set(alias, name);
    for (const m of type.members) memberNames.add(m.n);
  }
  const resolveType = (name: string) => byAlias.get(name) ?? byAlias.get(name.replace(/^_+/, '')) ?? null;
  const ownMembers = (typeName: string, member: string) =>
    registry.types[typeName]?.members.filter((m) => m.n === member) ?? [];
  return {
    resolveType,
    findMembers(typeName, member) {
      const own = ownMembers(typeName, member);
      if (own.length) return own;
      const base = BASE_TYPE_BY_CATEGORY[registry.types[typeName]?.cat ?? ''];
      return base && base !== typeName ? ownMembers(base, member) : [];
    },
    categoryOf: (typeName) => registry.types[typeName]?.cat ?? null,
    // 운영 배포 문서에서 온 API 는 레퍼런스 URL 이 없다(빈 문자열)
    urlOf: (typeName) => registry.types[typeName]?.url || null,
    isMemberName: (name) => memberNames.has(name),
  };
}

/** 답변 텍스트에서 API 언급 후보를 추출 (한정 이름 먼저, 이어서 단독 타입명) */
export function extractApiMentions(markdown: string): ApiMention[] {
  const seen = new Set<string>();
  const qualified: ApiMention[] = [];
  for (const chain of markdown.match(CHAIN) ?? []) {
    const parts = chain.split(/([:.])/);
    for (let i = 0; i + 2 < parts.length; i += 2) {
      const [left, sep, right] = [parts[i], parts[i + 1], parts[i + 2]];
      if (!UPPER_START.test(left)) continue;
      const text = `${left}${sep}${right}`;
      if (seen.has(text)) continue;
      seen.add(text);
      qualified.push({ text, type: left, member: right });
    }
  }
  const standalone: ApiMention[] = [];
  for (const name of markdown.match(TYPE_LIKE) ?? []) {
    if (seen.has(name)) continue;
    seen.add(name);
    standalone.push({ text: name, type: name });
  }
  return [...qualified, ...standalone];
}

function checkMember(mention: ApiMention & { member: string }, typeName: string, lookup: SymbolLookup): MentionCheck {
  const rightType = lookup.resolveType(mention.member);
  if (rightType && lookup.categoryOf(rightType) === 'Components') {
    return {
      text: mention.text,
      status: 'verified',
      typeName: rightType,
      badges: [],
      url: lookup.urlOf(rightType) ?? undefined,
      note: '엔티티의 컴포넌트 접근',
    };
  }
  const members = lookup.findMembers(typeName, mention.member);
  const url = lookup.urlOf(typeName) ?? undefined;
  if (!members.length) {
    return {
      text: mention.text,
      status: 'unknown-member',
      typeName,
      badges: [],
      url,
      note: `${typeName} 공식 레퍼런스에 '${mention.member}' 멤버가 없습니다.`,
    };
  }
  const current = members.filter((m) => !m.b.includes(DEPRECATED));
  const chosen = current[0] ?? members[0];
  return {
    text: mention.text,
    status: current.length ? 'verified' : 'deprecated',
    typeName,
    badges: chosen.b,
    signature: chosen.sig,
    url,
    note: current.length ? `${typeName}.${chosen.n}` : `더는 사용하지 않는(Deprecated) API입니다. ${chosen.sig}`,
  };
}

const QUESTION_NOTE = '질문에 나온 이름입니다. 답변이 이 API를 실제로 있는 것처럼 설명하지 않는지 확인하세요.';

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 질문에 같은 API 이름이 있는지. 멤버는 타입과 함께(`_SpawnService:Foo`, `SpawnService.Foo`) 있어야 한다. */
function askedInQuestion(check: MentionCheck, question: string): boolean {
  const [left, member] = check.text.split(/[:.]/);
  const typeName = (check.typeName ?? left).replace(/^_+/, '');
  const pattern =
    check.status === 'unknown-member' && member
      ? `_*${escapeRegExp(typeName)}\\s*[:.]\\s*${escapeRegExp(member)}`
      : escapeRegExp(check.text);
  return new RegExp(`(?<![A-Za-z0-9_])${pattern}(?![A-Za-z0-9_])`).test(question);
}

/**
 * 질문자가 직접 쓴, 레퍼런스에 없는 이름("이 함수가 왜 nil 인가요?")을 표시한다.
 * 답변이 이를 되짚거나 "레퍼런스에 없다"고 바로잡는 것은 창작이 아니므로 실패 사유에서 뺀다.
 */
export function markQuestionMentions(checks: readonly MentionCheck[], question: string): MentionCheck[] {
  return checks.map((check) => {
    if (check.status !== 'unknown-member' && check.status !== 'unknown-type') return check;
    return askedInQuestion(check, question) ? { ...check, fromQuestion: true, note: `${check.note} ${QUESTION_NOTE}` } : check;
  });
}

export function verifyApiMentions(mentions: readonly ApiMention[], lookup: SymbolLookup): MentionCheck[] {
  const results: MentionCheck[] = [];
  for (const mention of mentions) {
    const typeName = lookup.resolveType(mention.type);
    if (mention.member !== undefined) {
      if (!typeName) continue;
      results.push(checkMember({ ...mention, member: mention.member }, typeName, lookup));
      continue;
    }
    if (!typeName && lookup.isMemberName(mention.type)) continue;
    results.push(
      typeName
        ? { text: mention.text, status: 'verified', typeName, badges: [], url: lookup.urlOf(typeName) ?? undefined, note: `${lookup.categoryOf(typeName)} 타입` }
        : {
            text: mention.text,
            status: 'unknown-type',
            badges: [],
            note: '공식 API 레퍼런스에 없는 이름입니다. (사용자 정의 스크립트라면 정상)',
          },
    );
  }
  return results;
}
