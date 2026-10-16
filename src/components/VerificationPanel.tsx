import { useState } from 'react';
import type { CheckedClaim } from '../lib/factcheck';
import type { MentionCheck } from '../lib/symbols';
import type { VerificationResult } from '../lib/verify';
import { StatusPill } from './StatusPill';

interface Props {
  readonly final?: VerificationResult;
  readonly draft?: VerificationResult;
  readonly running: boolean;
  readonly onCitationClick: (n: number) => void;
}

const VERDICT_LABEL: Record<CheckedClaim['verdict'], string> = {
  supported: '근거 확인',
  partial: '부분 근거',
  unsupported: '근거 없음',
  contradicted: '출처와 모순',
};

const API_LABEL: Record<MentionCheck['status'], string> = {
  verified: '레퍼런스 확인',
  deprecated: 'Deprecated',
  'unknown-member': '없는 멤버',
  'unknown-type': '레퍼런스에 없음',
};

function ClaimItem({ claim, onCitationClick }: { readonly claim: CheckedClaim; readonly onCitationClick: (n: number) => void }) {
  return (
    <li className="claim">
      <div className="claim-top">
        <span className={`verdict verdict-${claim.verdict}`}>{VERDICT_LABEL[claim.verdict]}</span>
        <span>{claim.claim}</span>
      </div>
      {claim.quote && (
        <p className="quote">
          「{claim.quote}」 {claim.quoteVerified ? '— 원문 일치' : '— 원문에서 찾지 못함'}
        </p>
      )}
      <div className="meta-line">
        {claim.sources.map((n) => (
          <button key={n} type="button" className="btn btn-sm btn-ghost" style={{ padding: '0 4px' }} onClick={() => onCitationClick(n)}>
            [{n}]
          </button>
        ))}
        {claim.note}
      </div>
    </li>
  );
}

function ApiItem({ check }: { readonly check: MentionCheck }) {
  return (
    <li className="api-item">
      <span className={`verdict verdict-${check.fromQuestion ? 'partial' : check.status}`}>
        {check.fromQuestion ? `질문 속 이름 · ${API_LABEL[check.status]}` : API_LABEL[check.status]}
      </span>
      {check.url ? (
        <a href={check.url} target="_blank" rel="noopener noreferrer">
          <code>{check.text}</code>
        </a>
      ) : (
        <code>{check.text}</code>
      )}
      {check.badges.map((b) => (
        <span key={b} className="badge">
          {b.replace(/[[\]]/g, '')}
        </span>
      ))}
      {check.status !== 'verified' && <span className="hint">{check.note}</span>}
    </li>
  );
}

export function VerificationPanel({ final, draft, running, onCitationClick }: Props) {
  const [view, setView] = useState<'final' | 'draft'>('final');
  const result = view === 'draft' && draft ? draft : final;
  const revised = Boolean(draft && final && draft !== final);

  return (
    <section className="card">
      <h2>
        팩트체크 리포트 <StatusPill summary={result?.summary} pending={running && !result} />
      </h2>
      {revised && (
        <div className="form-row" style={{ marginTop: 0, marginBottom: 10 }}>
          <button type="button" className={`btn btn-sm${view === 'final' ? ' btn-primary' : ''}`} onClick={() => setView('final')}>
            최종본
          </button>
          <button type="button" className={`btn btn-sm${view === 'draft' ? ' btn-primary' : ''}`} onClick={() => setView('draft')}>
            수정 전 초안
          </button>
        </div>
      )}
      {!result && <p className="empty">답변이 작성되면 주장별 근거 대조, API 이름 대조, 인용·링크 검사를 수행합니다.</p>}
      {result && (
        <>
          {result.summary.reasons.length > 0 && (
            <ul className="reasons">
              {result.summary.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          {result.confidentialLeaks.length > 0 && (
            <p className="notice notice-error">
              운영 메모(대외비) 표현이 답변에 들어 있습니다: {result.confidentialLeaks.join(', ')} — 삭제한 뒤 게시하세요.
            </p>
          )}
          <h3 className="hint" style={{ margin: '10px 0 6px' }}>
            주장별 근거 대조 ({result.claims.length}건)
          </h3>
          <ul className="claim-list">
            {result.claims.map((c, i) => (
              <ClaimItem key={`${i}-${c.claim}`} claim={c} onCitationClick={onCitationClick} />
            ))}
          </ul>
          {result.unlinkedSentences.length > 0 && (
            <>
              <h3 className="hint" style={{ margin: '14px 0 6px' }}>
                주장으로 대조되지 않은 사실 문장 ({result.unlinkedSentences.length}건)
              </h3>
              <ul className="reasons">
                {result.unlinkedSentences.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {result.excludedSentences.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary className="hint">사실 주장이 없어 대조에서 뺀 문장 ({result.excludedSentences.length}건)</summary>
              <ul className="reasons">
                {result.excludedSentences.map((s) => (
                  <li key={s.text}>
                    {s.text} — {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <h3 className="hint" style={{ margin: '14px 0 6px' }}>
            API 이름 대조 ({result.apiChecks.length}건)
          </h3>
          {result.apiChecks.length ? (
            <ul className="api-list">
              {result.apiChecks.map((a) => (
                <ApiItem key={a.text} check={a} />
              ))}
            </ul>
          ) : (
            <p className="empty">답변에 API 식별자가 없습니다.</p>
          )}
          <h3 className="hint" style={{ margin: '14px 0 6px' }}>인용·링크</h3>
          <p className="meta-line">
            사실 문장 인용률 {Math.round(result.citations.coverage * 100)}% · 사용한 출처 {result.citations.used.length}개
            {result.citations.invalid.length > 0 && ` · 잘못된 번호 ${result.citations.invalid.join(', ')}`}
            {result.citations.unknownLinks.length > 0 && ` · 출처에 없는 링크 ${result.citations.unknownLinks.length}개`}
          </p>
          {result.citations.uncited.length > 0 && (
            <ul className="reasons">
              {result.citations.uncited.map((s) => (
                <li key={s}>인용 없음: {s}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
