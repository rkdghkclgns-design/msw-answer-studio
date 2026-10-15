import { describe, expect, it } from 'vitest';
import { aliasesFor, isApiPage, parseApiPage } from './api-parse.mjs';

const badge = (msg) => `<img src="https://img.shields.io/static/v1?label=&amp;message=${msg}&amp;color=x" alt="custom">`;

const servicePage = `[comment]: # ($API_Metadata_Start)

엔티티 스폰 관련 기능을 제공합니다.
# Methods
<table> <thead> <tr> <th><span>Entity</span> <span>SpawnByModelId</span>(<span>string</span> <span>id</span>, <span>Entity</span> <span>parent</span>) ${badge('ServerOnly')}</th> </tr> </thead> <tbody><tr> <td>모델을 스폰합니다.</td> </tr> </tbody> </table>
<table> <thead> <tr> <th><span>Entity</span> <span>Clone</span>(<span>string</span> <span>name</span>) ${badge('Deprecated')}</th> </tr> </thead> <tbody><tr> <td>더는 사용하지 않습니다.</td> </tr> </tbody> </table>
# Properties
<table> <thead> <tr> <th><span>float</span> <span>DetectionRange</span> ${badge('Sync')}</th> </tr> </thead> <tbody><tr> <td>감지 거리입니다.</td> </tr> </tbody> </table>
# Examples
\`\`\`lua
local e = _SpawnService:SpawnByModelId("id", map)
\`\`\``;

const enumPage = `[comment]: # ($API_Metadata_Start)
지역입니다.
# Members
<table><thead><tr><th><span>이름</span></th><th><span>값</span></th><th><span>설명</span></th></tr></thead><tbody><tr><td><span>KR</span></td><td>0</td><td>한국</td></tr><tr><td><span>GlobalWest</span></td><td>3</td><td>기타</td></tr></tbody></table>`;

describe('parseApiPage', () => {
  it('detects api pages by the metadata marker', () => {
    expect(isApiPage(servicePage)).toBe(true);
    expect(isApiPage('# 일반 가이드')).toBe(false);
  });

  it('parses methods and properties with signatures, badges and descriptions', () => {
    const { summary, members, extras } = parseApiPage(servicePage);
    expect(summary).toBe('엔티티 스폰 관련 기능을 제공합니다.');
    expect(members).toEqual([
      { k: 'method', n: 'SpawnByModelId', sig: 'Entity SpawnByModelId(string id, Entity parent)', b: ['[ServerOnly]'], d: '모델을 스폰합니다.' },
      { k: 'method', n: 'Clone', sig: 'Entity Clone(string name)', b: ['[Deprecated]'], d: '더는 사용하지 않습니다.' },
      { k: 'property', n: 'DetectionRange', sig: 'float DetectionRange', b: ['[Sync]'], d: '감지 거리입니다.' },
    ]);
    expect(extras).toHaveLength(1);
    expect(extras[0].heading).toBe('Examples');
    expect(extras[0].text).toContain('_SpawnService:SpawnByModelId');
  });

  it('parses enum member tables row by row', () => {
    const { members } = parseApiPage(enumPage);
    expect(members.map((m) => [m.n, m.sig, m.d])).toEqual([
      ['KR', 'KR = 0', '한국'],
      ['GlobalWest', 'GlobalWest = 3', '기타'],
    ]);
  });
});

describe('aliasesFor', () => {
  it('adds underscore aliases for services and logics only', () => {
    expect(aliasesFor('Services', 'SpawnService')).toEqual(['_SpawnService']);
    expect(aliasesFor('Logics', 'UtilLogic')).toEqual(['_UtilLogic']);
    expect(aliasesFor('Components', 'SpriteRendererComponent')).toEqual([]);
  });
});
