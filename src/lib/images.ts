// 문의에 첨부한 참고 이미지(스크린샷·오류 화면 등)의 검사·축소 계획·Claude 전송 형식.
// 브라우저 의존 코드(캔버스 축소)는 image-prep.ts 에 두고, 여기는 순수 함수만 둔다.

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type ImageMediaType = (typeof ACCEPTED_IMAGE_TYPES)[number];

export interface ImageInput {
  readonly id: string;
  readonly name: string;
  readonly mediaType: ImageMediaType;
  /** base64 (data: 접두사 없음) */
  readonly data: string;
  readonly width: number;
  readonly height: number;
  /** 전송할 이미지의 바이트 수 */
  readonly bytes: number;
}

export const MAX_IMAGES = 5;
/** 원본 파일 허용 크기 (축소 전) */
export const MAX_INPUT_BYTES = 20 * 1024 * 1024;
/** Claude 권장 최대 변 길이. 이보다 크면 토큰만 늘고 판독은 나아지지 않는다. */
export const MAX_EDGE = 1568;
/** base64 로 늘어나도 API 한도(5MB)를 넘지 않도록 원본 기준 3.75MB */
export const MAX_ENCODED_BYTES = Math.floor(3.75 * 1024 * 1024);

const isAccepted = (type: string): type is ImageMediaType => (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type);

/** 첨부 가능 여부. 문제가 있으면 사용자에게 보여 줄 메시지, 없으면 null */
export function checkImageFile(file: { readonly type: string; readonly size: number; readonly name: string }, currentCount: number): string | null {
  if (currentCount >= MAX_IMAGES) return `이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다.`;
  if (!isAccepted(file.type)) return `${file.name}: PNG·JPG·WebP·GIF 이미지만 첨부할 수 있습니다.`;
  if (file.size > MAX_INPUT_BYTES) return `${file.name}: 20MB 이하 이미지만 첨부할 수 있습니다.`;
  return null;
}

/** 긴 변을 MAX_EDGE 이하로 줄이고, 크거나 무거우면 다시 인코딩한다 */
export function planResize(width: number, height: number, bytes: number) {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const reencode = scale < 1 || bytes > MAX_ENCODED_BYTES;
  return { width: Math.round(width * scale), height: Math.round(height * scale), reencode };
}

export function base64Bytes(base64: string): number {
  if (!base64) return 0;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return (base64.length * 3) / 4 - padding;
}

export function toImageBlocks(images: readonly ImageInput[]) {
  return images.map((img) => ({
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: img.mediaType, data: img.data },
  }));
}
