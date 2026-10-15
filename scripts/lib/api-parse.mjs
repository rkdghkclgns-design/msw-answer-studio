// API 레퍼런스 페이지(본문에 $API_Metadata_Start 표식)를 구조화된 심볼로 파싱한다.

import { cleanMarkdown, extractBadges, htmlToText, parseTable } from './html-text.mjs';

const MEMBER_SECTIONS = {
  Properties: 'property',
  Methods: 'method',
  Constructors: 'constructor',
  Events: 'event',
  Members: 'member',
  Operators: 'operator',
  Functions: 'function',
};

export function isApiPage(content) {
  return content.includes('$API_Metadata_Start');
}

function stripBadges(text) {
  return text.replace(/\s*\[[^\]]+\]/g, '').replace(/\s+/g, ' ').trim();
}

function memberName(kind, sig) {
  if (['method', 'constructor', 'function', 'operator'].includes(kind)) {
    const m = /([A-Za-z_][\w.]*)\s*\(/.exec(sig);
    if (m) return m[1].split('.').pop();
  }
  const tokens = sig.match(/[A-Za-z_]\w*/g) ?? [];
  return tokens.at(-1) ?? sig;
}

function parseMemberTables(kind, html) {
  const members = [];
  for (const t of html.matchAll(/<table[\s\S]*?<\/table>/g)) {
    const rows = parseTable(t[0]);
    if (!rows.length) continue;
    const header = rows[0].map((c) => c.text);
    // Enum 멤버 표: [이름 | 값 | 설명] 다중 행
    if (header.length >= 2 && /이름|name/i.test(header[0])) {
      for (const row of rows.slice(1)) {
        const name = row[0]?.text;
        if (!name) continue;
        members.push({
          k: kind,
          n: name,
          sig: row[1] ? `${name} = ${row[1].text}` : name,
          b: extractBadges(row.map((c) => c.html).join(' ')),
          d: row[2]?.text ?? '',
        });
      }
      continue;
    }
    // 일반 멤버 표: th = 시그니처(+배지), td = 설명
    const th = rows[0][0];
    const sig = stripBadges(th.text);
    members.push({
      k: kind,
      n: memberName(kind, sig),
      sig,
      b: extractBadges(th.html),
      d: rows.slice(1).map((r) => r.map((c) => c.text).join(' ')).join('\n').trim(),
    });
  }
  return members;
}

/** @returns {{summary:string, members:object[], extras:{heading:string,text:string}[]}} */
export function parseApiPage(content) {
  const body = content.replace(/^\[comment\]: #.*$/gm, '');
  const parts = body.split(/^# (.+)$/m);
  const summary = htmlToText(cleanMarkdown(parts[0] ?? ''));
  const members = [];
  const extras = [];
  for (let i = 1; i < parts.length; i += 2) {
    const heading = parts[i].trim();
    const sectionBody = parts[i + 1] ?? '';
    const kind = MEMBER_SECTIONS[heading];
    if (kind) {
      members.push(...parseMemberTables(kind, sectionBody));
      const rest = sectionBody.replace(/<table[\s\S]*?<\/table>/g, '').trim();
      if (rest) extras.push({ heading, text: cleanMarkdown(rest) });
    } else {
      const text = cleanMarkdown(sectionBody);
      if (text) extras.push({ heading, text });
    }
  }
  return { summary, members, extras };
}

/** 스크립트에서 쓰는 이름(별칭) — 서비스/로직은 _ 접두 전역 인스턴스로 접근 */
export function aliasesFor(category, title) {
  if (category === 'Services' || category === 'Logics') return [`_${title}`];
  return [];
}
