import { useRef } from 'react';
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGES, type ImageInput } from '../lib/images';

interface Props {
  readonly images: readonly ImageInput[];
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly error: string | null;
  readonly onAddFiles: (files: File[]) => void;
  readonly onRemove: (id: string) => void;
}

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024)).toLocaleString()}KB`;

/** 참고 이미지 첨부: 파일 선택 버튼 + 미리보기. 붙여 넣기·끌어다 놓기는 QuestionForm 이 받아 onAddFiles 로 넘긴다. */
export function ImageAttachments({ images, busy, disabled, error, onAddFiles, onRemove }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const full = images.length >= MAX_IMAGES;

  return (
    <div className="attachments">
      <div className="form-row" style={{ marginTop: 8 }}>
        <button type="button" className="btn btn-sm" disabled={disabled || busy || full} onClick={() => input.current?.click()}>
          {busy ? '이미지 준비 중…' : '🖼 참고 이미지 첨부'}
        </button>
        <span className="hint">
          스크린샷을 문의 칸에 Ctrl+V 로 붙여 넣거나 끌어다 놓아도 됩니다 · 최대 {MAX_IMAGES}장 ({images.length}/{MAX_IMAGES})
        </span>
        <input
          ref={input}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          multiple
          hidden
          onChange={(e) => {
            onAddFiles([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
      </div>
      {error && <p className="notice notice-warn">{error}</p>}
      {images.length > 0 && (
        <ul className="thumbs" aria-label="첨부한 이미지">
          {images.map((img) => (
            <li key={img.id} className="thumb">
              <img src={`data:${img.mediaType};base64,${img.data}`} alt={img.name} />
              <span className="thumb-meta" title={img.name}>
                {img.name} · {img.width}×{img.height} · {kb(img.bytes)}
              </span>
              <button type="button" className="thumb-remove" aria-label={`${img.name} 첨부 취소`} disabled={disabled} onClick={() => onRemove(img.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
