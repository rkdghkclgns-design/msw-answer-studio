// 게시용 복사 허용 여부: 검증 상태와 운영 판단 필요 여부에 따라 막거나 확인을 요구한다.

import type { OverallStatus } from './factcheck';

export interface PublishGate {
  readonly blocked: boolean;
  readonly needsAck: boolean;
  /** 막힌 이유 (blocked 일 때) */
  readonly reason?: string;
  /** 확인 체크박스 문구 (needsAck 일 때) */
  readonly ackLabel?: string;
}

export function publishGate(status: OverallStatus | undefined, needsOperatorDecision: boolean): PublishGate {
  if (!status) return { blocked: true, needsAck: false, reason: '팩트체크 결과가 없어 게시용 복사를 막았습니다.' };
  if (status === 'failed') {
    return {
      blocked: true,
      needsAck: false,
      reason: '검증 실패 답변은 게시용 복사를 막았습니다. 팩트체크 리포트의 지적 사항을 확인한 뒤 다시 생성하거나 직접 고쳐 주세요.',
    };
  }
  const partial = status === 'partial';
  if (!partial && !needsOperatorDecision) return { blocked: false, needsAck: false };
  const ackLabel =
    partial && needsOperatorDecision
      ? '팩트체크 지적 사항을 검토했고, 운영 판단이 필요한 부분을 담당자에게 확인했습니다'
      : partial
        ? '팩트체크 리포트의 지적 사항을 직접 검토했습니다'
        : '운영 판단이 필요한 부분을 담당자에게 확인했습니다';
  return { blocked: false, needsAck: true, ackLabel };
}
