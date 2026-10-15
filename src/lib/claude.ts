// 브라우저에서 사용자 API 키로 Claude 를 호출하는 얇은 래퍼.
// 키는 사용자 브라우저에서 api.anthropic.com 으로만 전송된다(별도 서버 없음).

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (기본 · 최고 정확도)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (빠름 · 저렴)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (가장 빠름)' },
] as const;

export type ModelId = (typeof MODELS)[number]['id'];

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export class LlmError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'rate' | 'network' | 'refusal' | 'truncated' | 'invalid' | 'unknown',
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

/**
 * 워크스페이스에 묶이지 않은(조직 단위) 키는 요청마다 anthropic-workspace-id 헤더가 필요하다.
 * 워크스페이스 전용 키라면 workspaceId 는 비워 둔다.
 */
export function createClient(apiKey: string, workspaceId = ''): Anthropic {
  const workspace = workspaceId.trim();
  return new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
    timeout: 15 * 60 * 1000,
    ...(workspace ? { defaultHeaders: { 'anthropic-workspace-id': workspace } } : {}),
  });
}

const WORKSPACE_REQUIRED = /anthropic-workspace-id/;

/** SDK 오류를 사용자에게 보여줄 한국어 메시지로 변환 */
export function toLlmError(error: unknown): LlmError {
  if (error instanceof LlmError) return error;
  if (error instanceof Anthropic.AuthenticationError) return new LlmError('API 키가 올바르지 않습니다. 설정에서 키를 확인해 주세요.', 'auth');
  if (error instanceof Anthropic.PermissionDeniedError) return new LlmError('이 API 키로는 선택한 모델을 사용할 권한이 없습니다.', 'auth');
  if (error instanceof Anthropic.RateLimitError) return new LlmError('요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.', 'rate');
  if (error instanceof Anthropic.NotFoundError) return new LlmError('선택한 모델을 찾을 수 없습니다. 설정에서 다른 모델을 골라 주세요.', 'invalid');
  if (error instanceof Anthropic.BadRequestError && WORKSPACE_REQUIRED.test(error.message)) {
    return new LlmError(
      '이 API 키는 워크스페이스를 지정해야 합니다. 설정에서 "워크스페이스 ID"(wrkspc_…)를 입력하거나, Console 에서 워크스페이스 전용 키를 만들어 사용해 주세요.',
      'auth',
    );
  }
  if (error instanceof Anthropic.BadRequestError) return new LlmError(`요청이 거부되었습니다: ${error.message}`, 'invalid');
  if (error instanceof Anthropic.APIConnectionError) return new LlmError('Claude API 에 연결하지 못했습니다. 네트워크를 확인해 주세요.', 'network');
  if (error instanceof Anthropic.APIError) return new LlmError(`Claude API 오류(${error.status ?? '?'}): ${error.message}`, 'unknown');
  return new LlmError(error instanceof Error ? error.message : String(error), 'unknown');
}

function checkStop(stopReason: string | null | undefined): void {
  if (stopReason === 'refusal') throw new LlmError('모델이 이 요청에 대한 응답을 거절했습니다. 질문을 바꿔 다시 시도해 주세요.', 'refusal');
  if (stopReason === 'max_tokens') throw new LlmError('응답이 최대 길이에서 잘렸습니다. 질문을 나눠서 시도해 주세요.', 'truncated');
}

interface CallBase {
  readonly model: ModelId;
  readonly effort: Effort;
  readonly system: string;
  readonly user: string;
  readonly maxTokens: number;
  readonly signal?: AbortSignal;
}

/**
 * 구조화 출력(JSON 스키마 강제) 호출.
 * SDK 의 parse() 는 잘린 응답에서 stop_reason 확인 전에 파싱 오류를 던지므로,
 * create() 로 받아 거절·잘림을 먼저 판별한 뒤 직접 스키마 검증한다.
 */
export async function structuredCall<S extends z.ZodType>(
  client: Anthropic,
  params: CallBase & { readonly schema: S },
): Promise<z.infer<S>> {
  const format = betaZodOutputFormat(params.schema);
  try {
    const response = await client.beta.messages.create(
      {
        model: params.model,
        max_tokens: params.maxTokens,
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
        system: [{ type: 'text', text: params.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: params.user }],
        output_config: { effort: params.effort, format: { type: 'json_schema', schema: format.schema } },
      },
      { signal: params.signal },
    );
    checkStop(response.stop_reason);
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    try {
      return format.parse(text) as z.infer<S>;
    } catch {
      throw new LlmError('모델 응답이 예상한 형식이 아닙니다. 다시 시도해 주세요.', 'invalid');
    }
  } catch (error) {
    throw toLlmError(error);
  }
}

/**
 * 텍스트 스트리밍 호출 — 조각이 도착할 때마다 onText 로 전달.
 * 본문보다 사고(thinking)가 먼저 오래 진행되므로, 요약된 사고 조각도 onThinking 으로 알려 진행 상황을 보여 준다.
 */
export async function streamText(
  client: Anthropic,
  params: CallBase & { readonly onText: (delta: string) => void; readonly onThinking?: (delta: string) => void },
): Promise<string> {
  try {
    const stream = client.beta.messages.stream(
      {
        model: params.model,
        max_tokens: params.maxTokens,
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
        thinking: { type: 'adaptive', display: 'summarized' },
        system: [{ type: 'text', text: params.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: params.user }],
        output_config: { effort: params.effort },
      },
      { signal: params.signal },
    );
    stream.on('text', (delta) => params.onText(delta));
    if (params.onThinking) stream.on('thinking', (delta) => params.onThinking?.(delta));
    const message = await stream.finalMessage();
    checkStop(message.stop_reason);
    return message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
  } catch (error) {
    throw toLlmError(error);
  }
}
