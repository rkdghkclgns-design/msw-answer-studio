import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MODELS, type Effort, type ModelId } from '../lib/claude';
import { looksLikeAnthropicKey, looksLikeWorkspaceId, type Settings } from '../lib/settings';

interface Props {
  readonly open: boolean;
  readonly settings: Settings;
  readonly onSave: (settings: Settings) => void;
  readonly onClose: () => void;
}

const EFFORTS: readonly { id: Effort; label: string }[] = [
  { id: 'low', label: 'low · 가장 빠름' },
  { id: 'medium', label: 'medium · 권장' },
  { id: 'high', label: 'high · 꼼꼼함 (느림)' },
  { id: 'xhigh', label: 'xhigh · 매우 꼼꼼함 (매우 느림)' },
];

export function SettingsDialog({ open, settings, onSave, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(settings);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setDraft(settings);
      setShowKey(false);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open, settings]);

  const keyWarning = draft.apiKey && !looksLikeAnthropicKey(draft.apiKey);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave({ ...draft, apiKey: draft.apiKey.trim() });
  };

  return (
    <dialog ref={ref} className="settings" onClose={onClose} aria-labelledby="settings-title">
      <form onSubmit={submit}>
        <h2 id="settings-title" style={{ marginTop: 0 }}>
          설정
        </h2>
        <label className="field">
          Anthropic API 키
          <span style={{ display: 'flex', gap: 6 }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={draft.apiKey}
              placeholder="sk-ant-..."
              autoComplete="off"
              spellCheck={false}
              style={{ flex: 1 }}
              onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
            />
            <button type="button" className="btn btn-sm" onClick={() => setShowKey(!showKey)}>
              {showKey ? '숨기기' : '보기'}
            </button>
          </span>
          {keyWarning && <span className="hint" style={{ color: 'var(--warn)' }}>sk-ant- 로 시작하는 키인지 확인해 주세요.</span>}
          <span className="hint">
            키는 이 브라우저에서 api.anthropic.com 으로만 전송되며 별도 서버에 저장되지 않습니다.
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={draft.rememberKey} onChange={(e) => setDraft({ ...draft, rememberKey: e.target.checked })} />
          이 브라우저에 키 기억하기 (끄면 탭을 닫을 때 삭제)
        </label>
        <label className="field">
          워크스페이스 ID (선택)
          <input
            type="text"
            value={draft.workspaceId}
            placeholder="wrkspc_..."
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setDraft({ ...draft, workspaceId: e.target.value })}
          />
          {draft.workspaceId && !looksLikeWorkspaceId(draft.workspaceId) && (
            <span className="hint" style={{ color: 'var(--warn)' }}>wrkspc_ 로 시작하는 ID 인지 확인해 주세요.</span>
          )}
          <span className="hint">
            워크스페이스에 묶이지 않은(조직 단위) 키만 필요합니다. Claude Console › Settings › Workspaces 에서 ID 를 확인할 수 있습니다.
          </span>
        </label>
        <label className="field">
          모델
          <select value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value as ModelId })}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          추론 강도(effort) — 답변 작성·팩트체크에 적용
          <select value={draft.effort} onChange={(e) => setDraft({ ...draft, effort: e.target.value as Effort })}>
            {EFFORTS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={draft.autoRevise} onChange={(e) => setDraft({ ...draft, autoRevise: e.target.checked })} />
          팩트체크에서 문제가 발견되면 자동으로 수정하고 재검증
        </label>
        <div className="form-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="btn btn-primary">
            저장
          </button>
        </div>
      </form>
    </dialog>
  );
}
