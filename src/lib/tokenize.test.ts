import { describe, expect, it } from 'vitest';
import { splitCamel, tokenize } from './tokenize';

describe('splitCamel', () => {
  it('splits PascalCase API names into lowercase parts', () => {
    expect(splitCamel('SpawnByModelId')).toEqual(['spawn', 'by', 'model', 'id']);
  });

  it('keeps acronyms together', () => {
    expect(splitCamel('SpriteRUID')).toEqual(['sprite', 'ruid']);
    expect(splitCamel('UIGroup')).toEqual(['ui', 'group']);
  });
});

describe('tokenize', () => {
  it('emits full identifier (without leading underscore) plus camel parts', () => {
    const tokens = tokenize('_SpawnService:SpawnByModelId');
    expect(tokens).toContain('spawnservice');
    expect(tokens).toContain('spawn');
    expect(tokens).toContain('service');
    expect(tokens).toContain('spawnbymodelid');
    expect(tokens).toContain('model');
  });

  it('emits hangul character bigrams', () => {
    expect(tokenize('데이터저장')).toEqual(['데이', '이터', '터저', '저장']);
  });

  it('keeps single hangul syllables as unigrams', () => {
    expect(tokenize('맵 이동')).toEqual(['맵', '이동']);
  });

  it('handles han (chinese) text with bigrams', () => {
    expect(tokenize('無法刪除')).toEqual(['無法', '法刪', '刪除']);
  });

  it('lowercases and keeps numbers', () => {
    expect(tokenize('16MB 초과')).toEqual(expect.arrayContaining(['16mb', '초과']));
  });

  it('returns empty array for empty or symbol-only input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('!!! ---')).toEqual([]);
  });
});
