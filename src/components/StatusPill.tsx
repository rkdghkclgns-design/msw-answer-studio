import type { VerificationSummary } from '../lib/factcheck';

const LABELS = {
  verified: '✓ 팩트체크 통과',
  partial: '◐ 부분 검증 · 검토 필요',
  failed: '✕ 검증 실패 · 수정 필요',
} as const;

export function StatusPill({ summary, pending }: { readonly summary?: VerificationSummary; readonly pending: boolean }) {
  if (pending || !summary) return <span className="status-pill status-pending">{pending ? '검증 진행 중' : '검증 전'}</span>;
  return <span className={`status-pill status-${summary.status}`}>{LABELS[summary.status]}</span>;
}
