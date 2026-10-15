import { useEffect, useState } from 'react';
import { loadKnowledgeBaseOnce } from '../lib/kb';
import type { KnowledgeBase } from '../lib/kb-core';

export type KbState =
  | { readonly status: 'loading'; readonly message: string }
  | { readonly status: 'ready'; readonly kb: KnowledgeBase }
  | { readonly status: 'error'; readonly message: string };

export function useKnowledgeBase(): KbState {
  const [state, setState] = useState<KbState>({ status: 'loading', message: '지식베이스 준비 중…' });
  useEffect(() => {
    let alive = true;
    loadKnowledgeBaseOnce((message) => alive && setState({ status: 'loading', message }))
      .then((kb) => alive && setState({ status: 'ready', kb }))
      .catch((error: unknown) =>
        alive && setState({ status: 'error', message: error instanceof Error ? error.message : String(error) }),
      );
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
