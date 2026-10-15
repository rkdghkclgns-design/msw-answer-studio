import type { KbState } from '../hooks/useKnowledgeBase';

interface Props {
  readonly kbState: KbState;
  readonly hasKey: boolean;
  readonly onOpenSettings: () => void;
}

function KbBadges({ kbState }: { readonly kbState: KbState }) {
  if (kbState.status === 'loading') return <span>{kbState.message}</span>;
  if (kbState.status === 'error') return <span>지식베이스 오류</span>;
  const { docs, meta } = kbState.kb;
  const count = (section: string) => docs.filter((d) => d.section === section).length;
  return (
    <>
      <span>가이드 {count('docs').toLocaleString()}</span>
      <span>API {meta.apiTypeCount.toLocaleString()}종 · 멤버 {meta.apiMemberCount.toLocaleString()}</span>
      <span>약관·정책·FAQ {count('policy')}</span>
      <span>공식 공지 {count('notice')}</span>
      <span>과거 공식 답변 {count('qa').toLocaleString()}</span>
      <span>문서 수집 {meta.crawledAt.slice(0, 10)}</span>
    </>
  );
}

export function Header({ kbState, hasKey, onOpenSettings }: Props) {
  return (
    <header className="app-header">
      <div className="brand">
        <div className="brand-mark" aria-hidden>
          M
        </div>
        <div>
          <h1>MSW 답변 스튜디오</h1>
          <p>공식 문서 근거 · 팩트체크된 크리에이터 문의 답변</p>
        </div>
      </div>
      <div className="header-spacer" />
      <div className="kb-badge" aria-label="지식베이스 현황">
        <KbBadges kbState={kbState} />
      </div>
      <button type="button" className={`btn btn-sm${hasKey ? '' : ' btn-primary'}`} onClick={onOpenSettings}>
        {hasKey ? '⚙ 설정' : 'API 키 입력'}
      </button>
    </header>
  );
}
