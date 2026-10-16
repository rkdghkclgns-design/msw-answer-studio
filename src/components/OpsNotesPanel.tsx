import type { OpsNotes } from '../lib/ops-notes';

/** 로컬 전용 운영 메모(대외비)를 서포터에게만 보여 준다. 배포본에는 메모 파일이 없어 그려지지 않는다. */
export function OpsNotesPanel({ notes }: { readonly notes: OpsNotes }) {
  return (
    <details className="card ops-notes">
      <summary>
        운영 메모 {notes.notes.length}건 <span className="hint">· 대외비 · 이 PC 전용 · 기준 {notes.updatedAt}</span>
      </summary>
      <ul className="reasons">
        {notes.notes.map((n) => (
          <li key={n.id}>
            <b>{n.disclosure === 'internal' ? '[내부 전용] ' : '[공유 가능] '}
              {n.title}</b>
            : {n.text}
          </li>
        ))}
      </ul>
      <p className="hint" style={{ marginBottom: 0 }}>
        답변 작성에 참고하되, 내부 전용 내용이 답변에 나오면 팩트체크에서 "운영 메모(대외비) 노출 의심"으로 실패 처리되고 복사가 막힙니다.
      </p>
    </details>
  );
}
