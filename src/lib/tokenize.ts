// 검색용 토크나이저: 영문 식별자는 전체 + CamelCase 분해, 한글/한자는 2-gram.

const SEGMENT = /[A-Za-z_][A-Za-z0-9_]*|[0-9][A-Za-z0-9]*|[가-힣]+|[一-鿿㐀-䶿]+/g;
const CAMEL_PART = /[A-Z]+(?![a-z])|[A-Z]?[a-z]+|[0-9]+/g;
const CJK = /^[가-힣一-鿿㐀-䶿]/;

export function splitCamel(identifier: string): string[] {
  return (identifier.match(CAMEL_PART) ?? []).map((p) => p.toLowerCase());
}

function bigrams(word: string): string[] {
  if (word.length < 2) return [word];
  const out: string[] = [];
  for (let i = 0; i < word.length - 1; i += 1) out.push(word.slice(i, i + 2));
  return out;
}

export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const segment of text.match(SEGMENT) ?? []) {
    if (CJK.test(segment)) {
      tokens.push(...bigrams(segment));
      continue;
    }
    const bare = segment.replace(/^_+/, '');
    if (!bare) continue;
    tokens.push(bare.toLowerCase());
    const parts = splitCamel(bare);
    if (parts.length > 1) tokens.push(...parts);
  }
  return tokens;
}
