import { useState } from 'react';
import { sourceKindLabel } from '../lib/sources';
import type { Source } from '../lib/types';

interface Props {
  readonly sources: readonly Source[];
  readonly cited: readonly number[];
}

function SourceItem({ source, cited }: { readonly source: Source; readonly cited: boolean }) {
  const [open, setOpen] = useState(false);
  const kindClass = source.doc.section === 'qa' ? 'kind kind-qa' : 'kind';
  return (
    <li id={`src-${source.n}`} className="source" style={cited ? undefined : { opacity: 0.72 }}>
      <div className="source-head">
        <span className="source-num">{source.n}</span>
        <div style={{ minWidth: 0 }}>
          {source.doc.url ? (
            <a className="source-title" href={source.doc.url} target="_blank" rel="noopener noreferrer">
              {source.doc.title}
            </a>
          ) : (
            <span className="source-title" title="공개 링크가 없는 운영 배포 문서">
              {source.doc.title}
            </span>
          )}
          <div className="source-path">
            <span className={kindClass}>{sourceKindLabel(source.doc)}</span> {source.doc.trail.join(' › ')}
            {source.heading && ` › ${source.heading}`}
            {source.pinned && ' · API 고정'}
            {!cited && ' · 답변에서 미인용'}
          </div>
        </div>
      </div>
      <p className={`source-text${open ? ' open' : ''}`}>{source.text}</p>
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(!open)}>
        {open ? '접기' : '원문 펼치기'}
      </button>
    </li>
  );
}

export function SourcesPanel({ sources, cited }: Props) {
  return (
    <section className="card">
      <h2>
        근거 출처 <span className="sub">{sources.length ? `${sources.length}건 · 클릭 시 공식 페이지` : '검색 전'}</span>
      </h2>
      {sources.length ? (
        <ul className="source-list">
          {sources.map((s) => (
            <SourceItem key={s.chunkId} source={s} cited={cited.includes(s.n)} />
          ))}
        </ul>
      ) : (
        <p className="empty">질문을 분석한 뒤 공식 가이드·API 레퍼런스·약관/정책·공지·과거 공식 답변에서 근거를 찾습니다.</p>
      )}
    </section>
  );
}
