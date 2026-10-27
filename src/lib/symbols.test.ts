import { describe, expect, it } from 'vitest';
import { createSymbolLookup, extractApiMentions, markQuestionMentions, verifyApiMentions } from './symbols';
import type { SymbolRegistry } from './types';

const registry: SymbolRegistry = {
  types: {
    SpawnService: {
      cat: 'Services',
      doc: 1,
      url: 'https://x/apiReference/Services/SpawnService',
      summary: '',
      aliases: ['_SpawnService'],
      members: [
        { k: 'method', n: 'SpawnByModelId', sig: 'Entity SpawnByModelId(string id, string name, Vector3 spawnPosition, Entity parent)', b: [], d: '' },
        { k: 'method', n: 'Clone', sig: 'Entity Clone(...)', b: ['[Deprecated]'], d: '' },
      ],
    },
    Service: { cat: 'Services', doc: 2, url: 'u', summary: '', aliases: [], members: [{ k: 'property', n: 'Name', sig: 'string Name', b: [], d: '' }] },
    Entity: { cat: 'Misc', doc: 3, url: 'u', summary: '', aliases: [], members: [{ k: 'property', n: 'CurrentMap', sig: 'Entity CurrentMap', b: ['[ReadOnly]'], d: '' }] },
    SpriteRendererComponent: {
      cat: 'Components',
      doc: 4,
      url: 'u',
      summary: '',
      aliases: [],
      members: [{ k: 'property', n: 'SpriteRUID', sig: 'string SpriteRUID', b: ['[Sync]'], d: '' }],
    },
    Component: { cat: 'Components', doc: 5, url: 'u', summary: '', aliases: [], members: [{ k: 'property', n: 'Enable', sig: 'boolean Enable', b: [], d: '' }] },
    LocalizationService: {
      cat: 'Services',
      doc: 6,
      url: 'u',
      summary: '',
      aliases: ['_LocalizationService'],
      members: [{ k: 'method', n: 'GetText', sig: 'string GetText(string key)', b: ['[ClientOnly]'], d: '' }],
    },
  },
};

const lookup = createSymbolLookup(registry);

describe('createSymbolLookup', () => {
  it('resolves service aliases with leading underscore', () => {
    expect(lookup.resolveType('_SpawnService')).toBe('SpawnService');
    expect(lookup.resolveType('SpawnService')).toBe('SpawnService');
    expect(lookup.resolveType('NopeService')).toBeNull();
  });

  it('finds members on the type or its base type', () => {
    expect(lookup.findMembers('SpawnService', 'SpawnByModelId')).toHaveLength(1);
    expect(lookup.findMembers('SpawnService', 'Name')).toHaveLength(1);
    expect(lookup.findMembers('SpriteRendererComponent', 'Enable')).toHaveLength(1);
    expect(lookup.findMembers('SpawnService', 'Missing')).toHaveLength(0);
  });

  it('verifies APIs registered from distributed documents, which have no reference URL', () => {
    const withEvent = createSymbolLookup({
      types: {
        ...registry.types,
        PlatformEventService: {
          cat: 'Services',
          doc: 7,
          url: '',
          summary: '',
          aliases: ['_PlatformEventService'],
          members: [{ k: 'method', n: 'SetProgressAndWait', sig: 'int SetProgressAndWait(...)', b: ['[ServerOnly]'], d: '' }],
        },
      },
    });
    expect(withEvent.urlOf('PlatformEventService')).toBeNull();
    const [check] = verifyApiMentions(extractApiMentions('`_PlatformEventService:SetProgressAndWait(...)`'), withEvent);
    expect(check).toMatchObject({ status: 'verified', badges: ['[ServerOnly]'] });
    expect(check.url).toBeUndefined();
  });
});

describe('extractApiMentions', () => {
  it('extracts qualified calls and standalone type names', () => {
    const md = '`_SpawnService:SpawnByModelId(id, "a", pos, map)` 를 쓰고 SpriteRendererComponent 의 `SpriteRUID` 를 설정하세요.';
    const mentions = extractApiMentions(md);
    expect(mentions).toEqual(
      expect.arrayContaining([
        { text: '_SpawnService:SpawnByModelId', type: '_SpawnService', member: 'SpawnByModelId' },
        { text: 'SpriteRendererComponent', type: 'SpriteRendererComponent' },
      ]),
    );
  });

  it('deduplicates repeated mentions', () => {
    const mentions = extractApiMentions('SpawnService SpawnService _SpawnService:Clone _SpawnService:Clone');
    expect(mentions.filter((m) => m.text === '_SpawnService:Clone')).toHaveLength(1);
  });
});

describe('verifyApiMentions', () => {
  const check = (md: string) => verifyApiMentions(extractApiMentions(md), lookup);

  it('marks existing members as verified with badges', () => {
    const [r] = check('`_LocalizationService:GetText("k")`');
    expect(r.status).toBe('verified');
    expect(r.badges).toContain('[ClientOnly]');
  });

  it('flags deprecated members', () => {
    expect(check('`_SpawnService:Clone()`')[0].status).toBe('deprecated');
  });

  it('flags members that do not exist on a known type', () => {
    const [r] = check('`_SpawnService:SpawnMonster()`');
    expect(r.status).toBe('unknown-member');
  });

  it('flags type-like names missing from the reference', () => {
    expect(check('FlyingCarService 를 사용하세요')[0].status).toBe('unknown-type');
  });

  it('treats component access on Entity as valid', () => {
    const results = check('self.Entity.SpriteRendererComponent.SpriteRUID');
    expect(results.every((r) => r.status === 'verified')).toBe(true);
  });

  it('does not treat member calls such as :ConnectEvent or :GetComponent as unknown types', () => {
    const lookupWithMembers = createSymbolLookup({
      types: {
        ...registry.types,
        Entity: {
          ...registry.types.Entity,
          members: [
            ...registry.types.Entity.members,
            { k: 'method', n: 'ConnectEvent', sig: 'EventHandlerBase ConnectEvent(...)', b: [], d: '' },
            { k: 'method', n: 'GetComponent', sig: 'Component GetComponent(...)', b: [], d: '' },
          ],
        },
      },
    });
    const results = verifyApiMentions(extractApiMentions('self.Entity:ConnectEvent(handler) 와 ConnectEvent, GetComponent 사용'), lookupWithMembers);
    expect(results.filter((r) => r.status === 'unknown-type')).toEqual([]);
  });

  it('ignores qualified names whose left side is not an API type', () => {
    expect(check('Responsive.Portrait myVar.Foo')).toEqual([]);
  });
});

describe('markQuestionMentions', () => {
  const check = (md: string) => verifyApiMentions(extractApiMentions(md), lookup);

  it('marks unknown names that the asker used themselves', () => {
    const answer = '문의하신 _SpawnService:SpawnMonsterAtRandom 은 레퍼런스에 없습니다. FlyingCarService 도 없습니다.';
    const question = '_SpawnService:SpawnMonsterAtRandom(5) 를 호출했는데 FlyingCarService 가 nil 입니다';
    const unknown = markQuestionMentions(check(answer), question).filter((m) => m.status !== 'verified');
    expect(unknown.map((m) => m.text)).toEqual(['_SpawnService:SpawnMonsterAtRandom', 'FlyingCarService']);
    expect(unknown.every((m) => m.fromQuestion)).toBe(true);
    expect(unknown[0].note).toContain('질문에 나온 이름');
  });

  it('matches the member name even when the answer writes the type differently', () => {
    const [m] = markQuestionMentions(check('SpawnService.SpawnMonsterAtRandom 은 없습니다'), '_SpawnService:SpawnMonsterAtRandom(5) 호출');
    expect(m.fromQuestion).toBe(true);
  });

  it('keeps names the answer invented on its own as failures', () => {
    const [m] = markQuestionMentions(check('`_SpawnService:SpawnMonster()` 를 쓰세요'), '몬스터를 여러 마리 스폰하는 방법');
    expect(m.fromQuestion).toBeUndefined();
    expect(m.status).toBe('unknown-member');
  });

  it('needs the type and member together in the question, not just a word that looks like the member', () => {
    const [invented] = markQuestionMentions(check('`_SpawnService:Create()` 를 쓰세요'), 'Create a monster at a random position');
    expect(invented.fromQuestion).toBeUndefined();
    const [otherType] = markQuestionMentions(check('`_SpawnService:SpawnMonster()` 를 쓰세요'), '_EntityService:SpawnMonster 가 nil 입니다');
    expect(otherType.fromQuestion).toBeUndefined();
  });

  it('does not match a member name that only appears inside a longer word', () => {
    const [m] = markQuestionMentions(check('`_SpawnService:Spawn()`'), 'SpawnByModelId 로 스폰했어요');
    expect(m.fromQuestion).toBeUndefined();
  });

  it('leaves verified mentions untouched', () => {
    const checks = check('`_LocalizationService:GetText("k")`');
    expect(markQuestionMentions(checks, '_LocalizationService:GetText 사용법')).toEqual(checks);
  });
});
