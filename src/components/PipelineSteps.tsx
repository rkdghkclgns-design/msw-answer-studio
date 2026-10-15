import type { StageState } from '../hooks/usePipelineRun';
import { STAGES, type StageId } from '../lib/pipeline';

const STATUS_TEXT: Record<StageState['status'], string> = {
  idle: '대기',
  running: '진행 중',
  done: '완료',
  skipped: '건너뜀',
  error: '오류',
};

export function PipelineSteps({ stages }: { readonly stages: Readonly<Record<StageId, StageState>> }) {
  return (
    <ol className="steps" aria-label="진행 단계">
      {STAGES.map((stage, i) => {
        const s = stages[stage.id];
        return (
          <li key={stage.id} className="step" data-status={s.status}>
            <strong>
              {i + 1}. {stage.label}
            </strong>
            <span className="detail">
              {s.status === 'running' && <span className="spinner" aria-hidden />} {s.detail ?? STATUS_TEXT[s.status]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
