import type { ClipboardEvent, DragEvent, FormEvent, KeyboardEvent } from 'react';
import { EXAMPLE_QUESTIONS } from '../data/examples';
import type { ImageInput } from '../lib/images';
import { ImageAttachments } from './ImageAttachments';

interface Props {
  readonly value: string;
  readonly running: boolean;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
  readonly images: readonly ImageInput[];
  readonly attaching: boolean;
  readonly attachError: string | null;
  readonly onAddImages: (files: File[]) => void;
  readonly onRemoveImage: (id: string) => void;
}

const imageFiles = (list: FileList | null | undefined) => [...(list ?? [])].filter((f) => f.type.startsWith('image/'));

const PLACEHOLDER = `크리에이터의 문의 내용을 붙여 넣으세요. (Discord 문의 양식 그대로 붙여 넣어도 됩니다)

예) 질문 제목 / 현재 상황 / 시도해 본 방법 / 에러 로그 / 월드 타입`;

export function QuestionForm(props: Props) {
  const { value, running, disabled, onChange, onSubmit, onCancel } = props;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!running && value.trim()) onSubmit();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !running && value.trim()) onSubmit();
  };
  // 스크린샷 붙여 넣기: 이미지가 있으면 첨부하고, 글자는 그대로 붙여 넣는다
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = imageFiles(event.clipboardData.files);
    if (!files.length || running) return;
    if (!event.clipboardData.getData('text/plain')) event.preventDefault();
    props.onAddImages(files);
  };
  const onDrop = (event: DragEvent<HTMLFormElement>) => {
    const files = imageFiles(event.dataTransfer.files);
    if (!files.length) return;
    event.preventDefault();
    if (!running) props.onAddImages(files);
  };

  return (
    <form className="card" onSubmit={submit} onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <h2>
        크리에이터 문의 <span className="sub">한국어 · English · 中文 모두 가능</span>
      </h2>
      <label className="sr-only" htmlFor="question">
        문의 내용
      </label>
      <textarea
        id="question"
        className="question"
        value={value}
        placeholder={PLACEHOLDER}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        maxLength={12000}
      />
      <ImageAttachments
        images={props.images}
        busy={props.attaching}
        disabled={running}
        error={props.attachError}
        onAddFiles={props.onAddImages}
        onRemove={props.onRemoveImage}
      />
      <div className="form-row">
        {running ? (
          <button type="button" className="btn" onClick={onCancel}>
            ■ 생성 중단
          </button>
        ) : (
          <button type="submit" className="btn btn-primary" disabled={disabled || !value.trim()}>
            팩트체크 답변 생성
          </button>
        )}
        <span className="hint">Ctrl + Enter · {value.length.toLocaleString()}자</span>
      </div>
      <div className="chips" aria-label="예시 질문">
        {EXAMPLE_QUESTIONS.map((q) => (
          <button key={q.label} type="button" className="chip" disabled={running} onClick={() => onChange(q.text)}>
            {q.label}
          </button>
        ))}
      </div>
    </form>
  );
}
