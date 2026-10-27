import { useState } from 'react';
import type { RunState } from '../hooks/usePipelineRun';
import { toDiscordPost } from '../lib/answer-format';
import { publishGate } from '../lib/publish-gate';
import { categoryLabel } from '../lib/taxonomy';
import { Markdown } from './Markdown';
import { StatusPill } from './StatusPill';

interface Props {
  readonly run: RunState;
  readonly onCitationClick: (n: number) => void;
}

function withSourceList(run: RunState): string {
  const list = run.sources.map((s) => `[${s.n}] ${s.doc.title} — ${s.doc.url || '운영 배포 문서'}`).join('\n');
  return `${run.answer.trim()}\n\n---\n출처\n${list}`;
}

export function AnswerCard({ run, onCitationClick }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showDraft, setShowDraft] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const gate = publishGate(run.verification?.summary.status, Boolean(run.analysis?.needsOperatorDecision));
  // 초안을 보는 동안에는 화면(초안)과 복사물(최종본)이 달라지므로 복사를 막는다
  const canCopy = !gate.blocked && (!gate.needsAck || acknowledged) && !showDraft;
  const streaming = run.status === 'running' && (run.stages.answer.status === 'running' || run.stages.revise.status === 'running');
  const verifying = run.status === 'running' && !streaming && run.answer.length > 0;

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied('복사 실패 — 직접 선택해 복사해 주세요');
    }
  };

  if (!run.answer && run.status !== 'running') return null;
  const shownText = showDraft && run.draft ? run.draft : run.answer;

  return (
    <section className="card" aria-live="polite">
      <div className="answer-head">
        <h2 style={{ margin: 0 }}>답변</h2>
        <StatusPill summary={run.verification?.summary} pending={run.status === 'running'} />
        {run.analysis && <span className="kind">{categoryLabel(run.analysis.category)}</span>}
        {run.phase === 'revised' && <span className="kind kind-qa">팩트체크 후 자동 수정됨</span>}
      </div>
      {run.analysis?.needsOperatorDecision && (
        <p className="notice notice-warn">
          ⚠ 운영 판단이 필요한 문의로 분류되었습니다. 문서 근거 밖의 결정(개별 예외·심사 판단 등)은 게시 전에 담당자 확인을 권장합니다.
        </p>
      )}
      {!run.answer && <p className="empty">근거 문서를 바탕으로 답변을 작성하고 있습니다…</p>}
      {shownText && <Markdown text={shownText} streaming={streaming} onCitationClick={onCitationClick} />}
      {verifying && (
        <p className="hint">
          <span className="spinner" aria-hidden /> 주장별 근거를 원문과 대조하고 있습니다…
        </p>
      )}
      {(run.status === 'cancelled' || run.status === 'error') && run.answer && (
        <p className="notice notice-warn">
          생성이 끝나지 않아 미완성이거나 검증되지 않은 답변입니다. 게시하지 말고 다시 생성해 주세요.
          {run.phase === 'draft' && run.verification && ' (자동 수정이 중단되어 검증된 초안으로 되돌렸습니다)'}
        </p>
      )}
      {run.status === 'done' && run.answer && gate.blocked && <p className="notice notice-warn">{gate.reason}</p>}
      {run.status === 'done' && run.answer && gate.needsAck && (
        <label className="ack">
          <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} /> {gate.ackLabel}
        </label>
      )}
      {run.status === 'done' && run.answer && (
        <div className="toolbar">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={!canCopy}
            onClick={() => copy('Discord 게시용 텍스트를 복사했습니다', toDiscordPost(run.answer, run.sources))}
          >
            Discord 게시용 복사
          </button>
          <button type="button" className="btn btn-sm" disabled={!canCopy} onClick={() => copy('출처 번호 포함 답변을 복사했습니다', withSourceList(run))}>
            출처 포함 복사
          </button>
          {run.draft && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowDraft(!showDraft)}>
              {showDraft ? '최종본 보기' : '수정 전 초안 보기'}
            </button>
          )}
          {copied && <span className="hint">{copied}</span>}
        </div>
      )}
    </section>
  );
}
