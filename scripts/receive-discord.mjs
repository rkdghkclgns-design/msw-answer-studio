// 브라우저(Discord 탭)에서 수집한 JSON을 받아 data/<폴더>/ 에 저장하는 로컬 수신기.
// - 127.0.0.1 에만 바인딩, Host 가 127.0.0.1:PORT 가 아니면 거부(DNS 리바인딩 방지)
// - Origin 허용목록 외 요청 거부, 실행마다 바뀌는 X-Token 헤더 필수(사전 요청 강제)
// - 저장 이름은 영문/숫자/하이픈만, 본문 20MB 제한
// 사용법: node scripts/receive-discord.mjs [port=47811] [data 하위 폴더=discord]

import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.argv[2] ?? 47811);
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', process.argv[3] ?? 'discord');
const MAX_BODY_BYTES = 20 * 1024 * 1024;
const TOKEN = randomBytes(16).toString('hex');
const NAME_PATTERN = /^[a-z0-9-]{1,60}$/i;
const ALLOWED_ORIGINS = new Set(['https://discord.com', 'https://maplestoryworlds.nexon.com', 'https://guide.nexon.com']);
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Token',
    'Access-Control-Allow-Private-Network': 'true',
    Vary: 'Origin',
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin ?? '';
  if (!ALLOWED_HOSTS.has(req.headers.host ?? '') || !ALLOWED_ORIGINS.has(origin)) {
    res.writeHead(403).end();
    return;
  }
  const headers = corsHeaders(origin);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers).end();
    return;
  }
  if (req.headers['x-token'] !== TOKEN) {
    res.writeHead(401, headers).end();
    return;
  }
  if (req.method === 'GET' && req.url === '/ping') {
    res.writeHead(200, headers).end('pong');
    return;
  }
  if (req.method === 'GET' && req.url === '/done') {
    res.writeHead(200, headers).end('bye');
    server.close();
    return;
  }
  if (req.method === 'POST' && req.url?.startsWith('/save')) {
    try {
      const name = new URL(req.url, 'http://x').searchParams.get('name') ?? 'threads';
      if (!NAME_PATTERN.test(name)) throw new Error('invalid name');
      const parsed = JSON.parse(await readBody(req));
      await mkdir(OUT_DIR, { recursive: true });
      const file = join(OUT_DIR, `${name}.json`);
      await writeFile(file, JSON.stringify(parsed, null, 1));
      console.log(`saved ${file}`);
      res.writeHead(200, headers).end(JSON.stringify({ ok: true }));
    } catch (err) {
      console.error('save failed:', err.message);
      res.writeHead(400, headers).end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }
  res.writeHead(404, headers).end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`receiver on http://127.0.0.1:${PORT}`);
  console.log(`token ${TOKEN}`);
});
