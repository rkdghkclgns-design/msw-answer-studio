// 브라우저에서 첨부 이미지를 읽어 필요하면 축소·재인코딩한 뒤 base64 로 만든다.
// 이미지는 이 브라우저와 api.anthropic.com 사이에서만 오가며 따로 저장하지 않는다.

import { MAX_ENCODED_BYTES, planResize, type ImageInput, type ImageMediaType } from './images';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
    reader.readAsDataURL(blob);
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('이미지를 변환하지 못했습니다.'))), 'image/jpeg', 0.9);
  });
}

export async function prepareImage(file: File): Promise<ImageInput> {
  const name = file.name || '붙여 넣은 이미지';
  const bitmap = await createImageBitmap(file);
  try {
    const plan = planResize(bitmap.width, bitmap.height, file.size);
    let blob: Blob = file;
    let mediaType = file.type as ImageMediaType;
    if (plan.reencode) {
      const canvas = document.createElement('canvas');
      canvas.width = plan.width;
      canvas.height = plan.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('이미지를 축소하지 못했습니다.');
      // 투명 배경 PNG 를 JPEG 로 바꿀 때 검게 나오지 않도록 흰 배경을 깐다
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, plan.width, plan.height);
      ctx.drawImage(bitmap, 0, 0, plan.width, plan.height);
      blob = await canvasToJpeg(canvas);
      mediaType = 'image/jpeg';
    }
    if (blob.size > MAX_ENCODED_BYTES) throw new Error(`${name}: 축소한 뒤에도 너무 큽니다. 잘라서 다시 첨부해 주세요.`);
    return {
      id: crypto.randomUUID(),
      name,
      mediaType,
      data: await blobToBase64(blob),
      width: plan.width,
      height: plan.height,
      bytes: blob.size,
    };
  } finally {
    bitmap.close();
  }
}
