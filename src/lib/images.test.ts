import { describe, expect, it } from 'vitest';
import { base64Bytes, checkImageFile, MAX_EDGE, MAX_IMAGES, planResize, toImageBlocks, type ImageInput } from './images';

describe('checkImageFile', () => {
  it('accepts screenshots in the supported formats', () => {
    expect(checkImageFile({ type: 'image/png', size: 300_000, name: 'a.png' }, 0)).toBeNull();
    expect(checkImageFile({ type: 'image/webp', size: 300_000, name: 'a.webp' }, 4)).toBeNull();
  });

  it('rejects unsupported types, oversized files and too many images', () => {
    expect(checkImageFile({ type: 'image/bmp', size: 1000, name: 'a.bmp' }, 0)).toContain('PNG');
    expect(checkImageFile({ type: 'image/png', size: 30 * 1024 * 1024, name: 'big.png' }, 0)).toContain('20MB');
    expect(checkImageFile({ type: 'image/png', size: 1000, name: 'a.png' }, MAX_IMAGES)).toContain(`${MAX_IMAGES}장`);
  });
});

describe('planResize', () => {
  it('keeps small images as they are', () => {
    expect(planResize(1200, 800, 400_000)).toEqual({ width: 1200, height: 800, reencode: false });
  });

  it('scales the long edge down to the limit and re-encodes', () => {
    const plan = planResize(3136, 1764, 2_000_000);
    expect(plan).toEqual({ width: MAX_EDGE, height: 882, reencode: true });
  });

  it('re-encodes an image that is within the size limit in pixels but too heavy in bytes', () => {
    expect(planResize(1500, 1500, 9_000_000).reencode).toBe(true);
  });
});

describe('base64Bytes', () => {
  it('estimates the decoded size of base64 data', () => {
    expect(base64Bytes('aGVsbG8=')).toBe(5);
    expect(base64Bytes('')).toBe(0);
  });
});

describe('toImageBlocks', () => {
  it('builds Claude image content blocks from prepared images', () => {
    const img: ImageInput = { id: '1', name: 's.png', mediaType: 'image/png', data: 'AAAA', width: 10, height: 10, bytes: 3 };
    expect(toImageBlocks([img])).toEqual([{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }]);
  });
});
