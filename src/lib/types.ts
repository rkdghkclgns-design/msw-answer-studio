// 지식베이스·파이프라인 공용 타입

/** docs=공식 가이드, apiReference=API 레퍼런스, resource=강좌/VOD, policy=약관·운영정책·FAQ·콘테스트 정책,
 *  notice=Discord 공식 공지(AI Toolkit 등), qa=Discord 과거 공식 답변 */
export type DocSection = 'docs' | 'apiReference' | 'resource' | 'policy' | 'notice' | 'qa';

export interface KbDoc {
  readonly i: number;
  readonly id: number | string;
  readonly title: string;
  readonly trail: readonly string[];
  readonly section: DocSection;
  readonly url: string;
  readonly modifiedAt: number | null;
}

export interface KbChunk {
  /** 문서 인덱스 */
  readonly d: number;
  /** 섹션 제목 경로 */
  readonly h: string;
  /** 본문 */
  readonly t: string;
}

export interface ApiMember {
  readonly k: string;
  readonly n: string;
  readonly sig: string;
  readonly b: readonly string[];
  readonly d: string;
}

export interface ApiType {
  readonly cat: string;
  readonly doc: number;
  readonly url: string;
  readonly summary: string;
  readonly aliases: readonly string[];
  readonly members: readonly ApiMember[];
}

export interface SymbolRegistry {
  readonly types: Readonly<Record<string, ApiType>>;
}

export interface KbMeta {
  readonly builtAt: string;
  readonly crawledAt: string;
  readonly docCount: number;
  readonly chunkCount: number;
  readonly apiTypeCount: number;
  readonly apiMemberCount: number;
  readonly qaThreadCount?: number;
}

/** 검색 결과로 답변에 제공되는 근거 단위 */
export interface Source {
  /** 답변 내 인용 번호 (1부터) */
  readonly n: number;
  readonly chunkId: number;
  readonly doc: KbDoc;
  readonly heading: string;
  readonly text: string;
  readonly score: number;
  readonly pinned: boolean;
}
