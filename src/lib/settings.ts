// 사용자 설정(API 키·모델) 저장. 키는 기본적으로 탭이 닫히면 사라지는 sessionStorage 에 둔다.

import { z } from 'zod';
import { MODELS, type Effort, type ModelId } from './claude';

const PREFS_KEY = 'msw-answer-studio.prefs';
const API_KEY_KEY = 'msw-answer-studio.apiKey';

export interface Settings {
  readonly apiKey: string;
  /** 조직 단위 키를 쓸 때만 필요한 워크스페이스 ID (wrkspc_…) */
  readonly workspaceId: string;
  readonly rememberKey: boolean;
  readonly model: ModelId;
  readonly effort: Effort;
  readonly autoRevise: boolean;
}

// v2: 기본 추론 강도를 high → medium 으로 변경 (high 는 답변 전에 사고 토큰을 과도하게 사용)
const PREFS_VERSION = 2;

const PrefsSchema = z.object({
  version: z.number().catch(1),
  workspaceId: z.string().max(80).catch(''),
  rememberKey: z.boolean().catch(false),
  model: z.enum(MODELS.map((m) => m.id) as [ModelId, ...ModelId[]]).catch('claude-opus-5-5'),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).catch('medium'),
  autoRevise: z.boolean().catch(true),
});

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  workspaceId: '',
  rememberKey: false,
  model: 'claude-opus-5-5',
  effort: 'medium',
  autoRevise: true,
};

function safeGet(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSet(storage: Storage | undefined, key: string, value: string | null): void {
  try {
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch {
    // 사파리 비공개 모드 등 저장소 접근 불가 — 이번 세션 메모리에서만 유지
  }
}

export function loadSettings(): Settings {
  const raw = safeGet(globalThis.localStorage, PREFS_KEY);
  let prefs = PrefsSchema.parse({});
  try {
    prefs = PrefsSchema.parse(raw ? JSON.parse(raw) : {});
  } catch {
    // 손상된 설정은 기본값 사용
  }
  const apiKey = safeGet(globalThis.sessionStorage, API_KEY_KEY) ?? safeGet(globalThis.localStorage, API_KEY_KEY) ?? '';
  const { version, ...rest } = prefs;
  const migrated = version < PREFS_VERSION ? { ...rest, effort: DEFAULT_SETTINGS.effort } : rest;
  return { ...DEFAULT_SETTINGS, ...migrated, apiKey };
}

export function saveSettings(settings: Settings): void {
  const { apiKey, ...prefs } = settings;
  safeSet(globalThis.localStorage, PREFS_KEY, JSON.stringify({ ...prefs, version: PREFS_VERSION }));
  const key = apiKey.trim() || null;
  safeSet(globalThis.sessionStorage, API_KEY_KEY, key);
  safeSet(globalThis.localStorage, API_KEY_KEY, settings.rememberKey ? key : null);
}

export function looksLikeAnthropicKey(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key.trim());
}

export function looksLikeWorkspaceId(id: string): boolean {
  return /^wrkspc_[A-Za-z0-9]{8,}$/.test(id.trim());
}
