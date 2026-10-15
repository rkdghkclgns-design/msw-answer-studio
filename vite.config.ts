import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// 배포본 CSP: 스크립트·스타일은 자체 출처만, 네트워크는 자체 + Claude API 만 허용.
// (키가 Web Storage 에 있으므로 주입된 콘텐츠가 외부로 전송하지 못하게 막는다)
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://api.anthropic.com",
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html: string) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), cspPlugin()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    coverage: {
      include: ['src/lib/**/*.ts', 'scripts/lib/**/*.mjs'],
      // 네트워크·브라우저 저장소에 직접 의존하는 얇은 어댑터는 제외 (claude.ts: SDK 호출, kb.ts: fetch, settings.ts: Web Storage)
      exclude: ['src/lib/claude.ts', 'src/lib/kb.ts', 'src/lib/settings.ts', 'src/lib/types.ts', '**/*.test.*'],
    },
  },
});
