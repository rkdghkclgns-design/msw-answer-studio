import type { Analysis } from '../lib/schemas';
import { categoryLabel } from '../lib/taxonomy';

const LANG: Record<Analysis['language'], string> = { ko: '한국어', en: 'English', zh: '中文' };

export function AnalysisPanel({ analysis }: { readonly analysis: Analysis }) {
  return (
    <details className="card analysis">
      <summary>질문 분석 결과 · {categoryLabel(analysis.category)}</summary>
      <dl className="kv">
        <dt>언어</dt>
        <dd>{LANG[analysis.language]}</dd>
        <dt>유형</dt>
        <dd>{categoryLabel(analysis.category)}</dd>
        <dt>질문 형태</dt>
        <dd>{analysis.questionShapes.join(', ') || '-'}</dd>
        <dt>운영 판단</dt>
        <dd>{analysis.needsOperatorDecision ? '필요' : '불필요'}</dd>
        <dt>관련 API</dt>
        <dd>{analysis.apiIdentifiers.length ? analysis.apiIdentifiers.map((id) => <code key={id}>{id} </code>) : '-'}</dd>
        {analysis.subQuestions.map((sq, i) => (
          <div key={sq.question} style={{ display: 'contents' }}>
            <dt>하위 질문 {i + 1}</dt>
            <dd>
              {sq.question}
              <div className="hint">검색어: {sq.searchQueries.join(' · ')}</div>
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
