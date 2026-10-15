import { describe, expect, it } from 'vitest';
import { buildIndex, search } from './bm25';

const docs = [
  'SpawnService SpawnByModelId 모델 아이디로 엔티티를 스폰합니다',
  'DataStorageService 데이터 저장 GetAndWait SetAndWait',
  'WorldOrientation Landscape Portrait Responsive 월드 전체 설정',
  '스폰 위치와 부모 엔티티 설정 방법',
];

describe('bm25', () => {
  const index = buildIndex(docs);

  it('ranks the doc containing the exact API name first', () => {
    const hits = search(index, 'SpawnByModelId 사용법');
    expect(hits[0]?.id).toBe(0);
  });

  it('matches korean queries through bigrams', () => {
    const hits = search(index, '데이터 저장 방법');
    expect(hits[0]?.id).toBe(1);
  });

  it('returns at most k hits sorted by descending score', () => {
    const hits = search(index, '엔티티 스폰 설정', 2);
    expect(hits).toHaveLength(2);
    expect(hits[0].score).toBeGreaterThanOrEqual(hits[1].score);
  });

  it('returns no hits when nothing matches', () => {
    expect(search(index, 'zzzz qqqq')).toEqual([]);
  });

  it('supports incremental build through addDocument order', () => {
    expect(index.docCount).toBe(4);
    expect(index.avgDocLength).toBeGreaterThan(0);
  });
});
