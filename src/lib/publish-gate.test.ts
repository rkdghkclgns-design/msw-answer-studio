import { describe, expect, it } from 'vitest';
import { publishGate } from './publish-gate';

describe('publishGate', () => {
  it('lets a verified answer be copied right away', () => {
    expect(publishGate('verified', false)).toEqual({ blocked: false, needsAck: false });
  });

  it('blocks copying a failed answer', () => {
    const gate = publishGate('failed', false);
    expect(gate.blocked).toBe(true);
    expect(gate.reason).toContain('검증 실패');
  });

  it('asks for an explicit review of a partially verified answer', () => {
    expect(publishGate('partial', false)).toMatchObject({ blocked: false, needsAck: true });
  });

  it('asks for an explicit review when an operator decision is needed, even if verified', () => {
    const gate = publishGate('verified', true);
    expect(gate).toMatchObject({ blocked: false, needsAck: true });
    expect(gate.ackLabel).toContain('담당자');
  });

  it('blocks when there is no verification result', () => {
    expect(publishGate(undefined, false).blocked).toBe(true);
  });
});
