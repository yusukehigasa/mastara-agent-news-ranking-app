import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchHtml } from '../src/news/providers/livedoor.ts';

const url = 'https://news.livedoor.com/ranking/';

test('HTTPエラー・HTML以外・本文なしの応答を拒否する', async (t) => {
  const responses = [
    {
      response: new Response('unavailable', { status: 503 }),
      error: /HTTP 503/,
    },
    {
      response: new Response('{}', {
        headers: { 'content-type': 'application/json' },
      }),
      error: /HTML以外/,
    },
    {
      response: new Response(null, {
        headers: { 'content-type': 'text/html' },
      }),
      error: /応答本文がありません/,
    },
  ];
  for (const { response, error } of responses) {
    t.mock.method(globalThis, 'fetch', async () => response);
    await assert.rejects(fetchHtml(url), error);
    t.mock.restoreAll();
  }
});

test('リダイレクト3回までは許可し、循環は打ち切る', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return calls <= 3
      ? new Response(null, { status: 302, headers: { location: '/ranking/' } })
      : new Response('本文', { headers: { 'content-type': 'text/html' } });
  });
  assert.equal(await fetchHtml(url), '本文');
  assert.equal(calls, 4);
  calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response(null, {
      status: 302,
      headers: { location: '/ranking/' },
    });
  });
  await assert.rejects(fetchHtml(url), /リダイレクト上限/);
  assert.equal(calls, 4);
});

test('移動先のないリダイレクトを拒否する', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response(null, { status: 302 }),
  );
  await assert.rejects(fetchHtml(url), /移動先不明/);
});

test('2MBちょうどを許可し、分割受信でも上限超過時はストリームを閉じる', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response('a'.repeat(2_000_000), {
        headers: { 'content-type': 'text/html' },
      }),
  );
  assert.equal((await fetchHtml(url)).length, 2_000_000);
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(1_000_000));
      controller.enqueue(new Uint8Array(1_000_001));
    },
    cancel() {
      cancelled = true;
    },
  });
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(stream, { headers: { 'content-type': 'text/html' } }),
  );
  await assert.rejects(fetchHtml(url), /応答サイズ/);
  assert.equal(cancelled, true);
});

test('呼び出し元の中止をHTTP取得に伝える', async (t) => {
  const controller = new AbortController();
  const reason = new Error('ユーザーが中止');
  t.mock.method(
    globalThis,
    'fetch',
    async (_input: unknown, init?: RequestInit) => {
      assert.ok(init?.signal);
      controller.abort(reason);
      init.signal.throwIfAborted();
      throw new Error('中止が伝わっていない');
    },
  );
  await assert.rejects(
    fetchHtml(url, controller.signal),
    (error) => error === reason,
  );
});
