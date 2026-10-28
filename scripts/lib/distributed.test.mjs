import { describe, expect, it } from 'vitest';
import { buildDistributedEntries, parseDistributedSource } from './distributed.mjs';

const SOURCE = {
  docs: [
    {
      id: 'distributed-api',
      title: '플랫폼 이벤트 API 명세',
      trail: ['운영 배포 문서', '적용 범위: 이벤트 참여 월드 대상'],
      date: '2026-03-17',
      markdown: '# 개요\n플랫폼 이벤트 미션 진행도를 기록하는 API 명세입니다. 퍼블리싱 환경에서만 동작합니다.\n\n# 멤버\nPlatformEventService.SetProgressAndWait — int SetProgressAndWait(string profileCode) [ServerOnly]',
    },
  ],
  symbols: {
    PlatformEventService: {
      doc: 'distributed-api',
      cat: 'Services',
      summary: '플랫폼 이벤트 미션 진행도 API',
      members: [{ k: 'method', n: 'SetProgressAndWait', sig: 'int SetProgressAndWait(string profileCode)', b: ['[ServerOnly]'], d: '권한이 필요합니다.' }],
    },
  },
};

describe('parseDistributedSource', () => {
  it('accepts a well-formed source', () => {
    expect(parseDistributedSource(SOURCE).docs).toHaveLength(1);
  });

  it('rejects symbols that point at a missing document', () => {
    const bad = { ...SOURCE, symbols: { X: { ...SOURCE.symbols.PlatformEventService, doc: 'nope' } } };
    expect(() => parseDistributedSource(bad)).toThrow(/nope/);
  });

  it('rejects documents without a scope label, so event-only rules are never read as general rules', () => {
    const bad = { ...SOURCE, docs: [{ ...SOURCE.docs[0], trail: ['운영 배포 문서'] }] };
    expect(() => parseDistributedSource(bad)).toThrow(/적용 범위/);
  });
});

describe('buildDistributedEntries', () => {
  it('appends docs after existing ones, without a URL, and dated by the document date', () => {
    const { docs } = buildDistributedEntries(parseDistributedSource(SOURCE), 10);
    expect(docs[0]).toMatchObject({ i: 10, section: 'distributed', url: '', title: '플랫폼 이벤트 API 명세' });
    expect(new Date(docs[0].modifiedAt).toISOString().slice(0, 10)).toBe('2026-03-16');
  });

  it('chunks by heading so API pinning finds the overview and member chunks', () => {
    const { chunks } = buildDistributedEntries(parseDistributedSource(SOURCE), 10);
    expect(chunks.map((c) => c.h)).toEqual(['개요', '멤버']);
    expect(chunks.every((c) => c.d === 10)).toBe(true);
    expect(chunks[1].t).toContain('PlatformEventService.SetProgressAndWait —');
  });

  it('produces the same chunks from CRLF checkouts (Windows autocrlf) as from LF', () => {
    const lf = { ...SOURCE, docs: [{ ...SOURCE.docs[0], markdown: '# 개요\n설명 문단입니다.\n- ServerOnly 입니다.\n- 권한이 필요합니다.' }] };
    const crlf = { ...lf, docs: [{ ...lf.docs[0], markdown: lf.docs[0].markdown.replace(/\n/g, '\r\n') }] };
    const fromCrlf = buildDistributedEntries(parseDistributedSource(crlf), 10).chunks;
    expect(fromCrlf).toEqual(buildDistributedEntries(parseDistributedSource(lf), 10).chunks);
    expect(fromCrlf[0].t).not.toContain('\r');
  });

  it('registers symbols against the new doc index with the service alias', () => {
    const { types } = buildDistributedEntries(parseDistributedSource(SOURCE), 10);
    expect(types.PlatformEventService).toMatchObject({ doc: 10, url: '', aliases: ['_PlatformEventService'], cat: 'Services' });
    expect(types.PlatformEventService.members[0].n).toBe('SetProgressAndWait');
  });
});
