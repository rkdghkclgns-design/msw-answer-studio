// Discord 채널·스레드 수집기 — 로그인된 브라우저의 Discord 탭에서 실행하는 코드(개발자 도구 콘솔 또는 브라우저 자동화).
// 페이지 DOM 에 이미 그려진 메시지만 읽으며 Discord 토큰이나 API 를 쓰지 않는다.
// 결과는 scripts/receive-discord.mjs(127.0.0.1 전용 수신기)로 보내 data/discord/ 에 저장한다.
//
// 사용 순서
//   1) node scripts/receive-discord.mjs 47811 discord   → 출력된 token 을 아래 TOKEN 에 넣는다
//   2) Discord 탭에서 이 파일 내용을 실행해 도우미를 설치한다
//   3) const list = await __mswListThreadsPanel('<채널 ID>')          // 채팅 채널의 스레드 목록(보관된 스레드 포함)
//      또는 await __mswListForumPosts('<포럼 채널 ID>')               // 포럼 게시글 목록
//   4) for (const [id] of list) await __mswCollectThread(id)        // 스레드별 메시지 수집 → __mswData[id]
//   5) await __mswExport('<저장 이름>', { threads: Object.values(__mswData) })
//
// 주의: 창을 최소화하거나 화면을 잠그면 Discord 가 목록을 그리지 않아 수집이 멈춘다.
// 닉네임은 수집 단계에서 C0/S1 같은 익명 번호로 바꾸고, 멘션은 @user 로 치환한다.

/* eslint-disable no-undef */
(() => {
  const GUILD = '1460161189207212196';
  const PORT = 47811;
  const TOKEN = '<receive-discord.mjs 가 출력한 token>';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fiberOf = (el) => el[Object.keys(el).find((k) => k.startsWith('__reactFiber'))];
  // 공식 계정 판별(계정명·서버 태그). 수집 후 scripts/lib/discord.mjs 가 한 번 더 걸러 낸다.
  const OFFICIAL = /msw[_\s-]?supporter|supporter|서포터|운영자|^gm\b|maplestory\s?worlds/i;
  const text = (el) => (el ? el.innerText ?? el.textContent ?? '' : '');

  function serialize(node) {
    const clone = node.cloneNode(true);
    clone.querySelectorAll('pre').forEach((p) => p.replaceWith(document.createTextNode(`\n\`\`\`\n${text(p).replace(/\n$/, '')}\n\`\`\`\n`)));
    clone.querySelectorAll('code').forEach((c) => c.replaceWith(document.createTextNode(`\`${c.textContent}\``)));
    clone.querySelectorAll('a[href]').forEach((a) => {
      const h = a.getAttribute('href');
      if (h && /^https?:/.test(h) && !a.textContent.includes(h)) a.replaceWith(document.createTextNode(`${a.textContent} (${h})`));
    });
    clone.querySelectorAll('[class*="mention"]').forEach((m) => m.replaceWith(document.createTextNode(m.textContent.startsWith('#') ? m.textContent : '@user')));
    const tmp = document.createElement('div');
    tmp.style.cssText = 'position:absolute;left:-99999px;white-space:pre-wrap';
    tmp.appendChild(clone);
    document.body.appendChild(tmp);
    const txt = tmp.innerText;
    tmp.remove();
    return (txt || '').trim();
  }

  window.__mswData = window.__mswData || {};

  window.__mswFindThreadIds = (root, parentId) => {
    const ids = new Map();
    root.querySelectorAll('li, article, [role="listitem"], [role="button"], [class*="card"]').forEach((el) => {
      let f = fiberOf(el);
      for (let i = 0; i < 14 && f; i += 1) {
        const p = f.memoizedProps || {};
        const cand = p.threadId || p.thread?.id || (p.channel?.parent_id === parentId && p.channel.id) || p.post?.id;
        if (cand && cand !== parentId) {
          if (!ids.has(cand)) ids.set(cand, (el.innerText || '').split('\n')[0].slice(0, 80));
          break;
        }
        f = f.return;
      }
    });
    return ids;
  };

  window.__mswGo = async (channelId) => {
    history.pushState({}, '', `/channels/${GUILD}/${channelId}`);
    dispatchEvent(new PopStateEvent('popstate'));
    await sleep(1800);
  };

  window.__mswListThreadsPanel = async (channelId) => {
    await window.__mswGo(channelId);
    const btn = [...document.querySelectorAll('[aria-label="스레드"], [aria-label="Threads"]')][0];
    if (!btn) return new Map();
    btn.click();
    await sleep(1500);
    const list = document.querySelector('[class*="browser_"] [class*="list_"]');
    const found = new Map();
    if (list) {
      let stable = 0;
      let last = -1;
      for (let s = 0; s < 300 && stable < 8; s += 1) {
        for (const [k, v] of window.__mswFindThreadIds(list, channelId)) found.set(k, v);
        list.scrollTop += 600;
        await sleep(stable > 2 ? 1500 : 500);
        if (found.size === last && list.scrollTop + list.clientHeight >= list.scrollHeight - 5) stable += 1;
        else stable = 0;
        last = found.size;
      }
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return found;
  };

  window.__mswListForumPosts = async (channelId) => {
    await window.__mswGo(channelId);
    await sleep(1500);
    const main = document.querySelector('main') || document.body;
    const sc = [...main.querySelectorAll('[class*="scroller"]')].sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    const found = new Map();
    let stable = 0;
    let last = -1;
    for (let s = 0; s < 200 && stable < 6; s += 1) {
      for (const [k, v] of window.__mswFindThreadIds(main, channelId)) found.set(k, v);
      if (sc) sc.scrollTop += 900;
      await sleep(stable > 2 ? 1200 : 500);
      if (found.size === last && (!sc || sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 5)) stable += 1;
      else stable = 0;
      last = found.size;
    }
    return found;
  };

  window.__mswCollectThread = async (threadId, maxIter = 60) => {
    history.pushState({}, '', `/channels/${GUILD}/${threadId}`);
    dispatchEvent(new PopStateEvent('popstate'));
    let list = null;
    for (let i = 0; i < 100; i += 1) {
      await sleep(250);
      list = document.querySelector('ol[data-list-id="chat-messages"]');
      if (list?.querySelector(`li[id^="chat-messages-${threadId}-"]`)) break;
    }
    if (!list) return { threadId, error: 'no list', count: 0, title: '' };
    let sc = list;
    while (sc && !(sc.scrollHeight > sc.clientHeight + 5 && getComputedStyle(sc).overflowY !== 'visible')) sc = sc.parentElement;
    const msgs = new Map();
    const authorIdx = new Map();
    const harvest = () => {
      let lastAuthor = null;
      list.querySelectorAll(`li[id^="chat-messages-${threadId}-"]`).forEach((li) => {
        const mid = li.id.split('-').pop();
        const h = li.querySelector('h3 [class*="username"]');
        if (h) lastAuthor = (h.textContent || '').trim();
        const tagTxt = text(li.querySelector('h3'));
        if (msgs.has(mid)) return;
        const c = li.querySelector('[id^="message-content-"]');
        const replyEl = li.querySelector('[class*="repliedTextContent"]');
        const author = lastAuthor || '?';
        if (!authorIdx.has(author)) authorIdx.set(author, authorIdx.size);
        const official = OFFICIAL.test(author) || /\bMSW\b/.test(tagTxt.replace(author, ''));
        msgs.set(mid, {
          mid,
          t: li.querySelector('time')?.getAttribute('datetime') || null,
          role: official ? 'official' : 'creator',
          who: (official ? 'S' : 'C') + authorIdx.get(author),
          text: c ? serialize(c) : '',
          replyTo: replyEl ? (replyEl.textContent || '').slice(0, 160) : null,
          images: li.querySelectorAll('[class*="imageWrapper"] img, [class*="mosaicItem"] img').length,
          files: [...li.querySelectorAll('[class*="fileNameLink"], [class*="attachmentName"]')].map((a) => (a.textContent || '').trim()).slice(0, 5),
          embeds: [...li.querySelectorAll('[class*="embedTitle"]')].map((e) => (e.textContent || '').trim()).slice(0, 3),
        });
      });
    };
    let stable = 0;
    for (let i = 0; i < maxIter && stable < 4; i += 1) {
      harvest();
      const before = msgs.size;
      if (sc) sc.scrollTop = 0;
      await sleep(700);
      harvest();
      stable = msgs.size === before && (!sc || sc.scrollTop === 0) ? stable + 1 : 0;
    }
    if (sc) {
      for (let y = 0; y <= sc.scrollHeight; y += 600) {
        sc.scrollTop = y;
        await sleep(120);
        harvest();
      }
    }
    const title = document.title.replace(/^.*?"(.*)".*$/, '$1');
    const arr = [...msgs.values()].sort((a, b) => (BigInt(a.mid) < BigInt(b.mid) ? -1 : 1));
    window.__mswData[threadId] = { threadId, title, count: arr.length, messages: arr };
    return { threadId, title, count: arr.length };
  };

  window.__mswExport = async (name, payload) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/save?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Token': TOKEN },
      body: JSON.stringify(payload),
    });
    return (await r.json()).ok;
  };

  return 'MSW Discord 수집 도우미 설치됨';
})();
