import {
  fetchHtml,
  parseRanking,
  parseBody,
  validateUrl,
} from '../src/news/providers/livedoor.ts';
import { getRanking } from '../src/news/ranking-service.ts';
import { unsupportedMessage } from '../src/news/categories.ts';
import { renderRanking } from '../src/news/format-ranking.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { noopObserve } from '@mastra/core/tools';

import { newsTool, newsInputSchema } from '../src/mastra/tools/news-tool.ts';
const ranking =
  '<ol class="articleList withRanking">' +
  [1, 2, 3]
    .map(
      (i) =>
        '<li class="rank' +
        i +
        '"><a href="https://news.livedoor.com/topics/detail/' +
        i +
        '/"><h3 class="articleListTtl">記事' +
        i +
        '</h3></a></li>',
    )
    .join('') +
  '</ol>';
test('順位を維持し、広告や別のリンクを混ぜない', () => {
  assert.deepEqual(
    parseRanking('<a href="https://example.com/">広告</a>' + ranking).map(
      (a) => a.rank,
    ),
    [1, 2, 3],
  );
  assert.throws(() => parseRanking(ranking.replace('rank2', 'ad')));
});
test('取得先を固定し、外部URL・認証情報・別パスを拒否', () => {
  for (const url of [
    'http://news.livedoor.com/ranking/',
    'https://example.com/ranking/',
    'https://news.livedoor.com.evil.test/ranking/',
    'https://user@news.livedoor.com/ranking/',
    'https://news.livedoor.com/ranking/?next=evil',
    'https://news.livedoor.com/',
  ])
    assert.throws(() => validateUrl(url));
});
test('本文領域だけを抽出、スクリプト除去、長文に上限', () => {
  const result = parseBody(
    '<nav>広告</nav><span itemprop="articleBody"><p>本文です。</p><script>悪い処理</script><p>続きです。</p></span>',
  );
  assert.equal(result.body, '本文です。\n続きです。');
  assert.equal(
    parseBody('<span itemprop="articleBody">' + 'あ'.repeat(13000) + '</span>')
      .truncated,
    true,
  );
  assert.throws(() => parseBody('<h1>タイトルだけ</h1>'));
});
test('一部の本文取得失敗でも順位を繰り上げずリンクを返す', async () => {
  const calls: string[] = [];
  const result = await getRanking('general', async (url) => {
    calls.push(url);
    if (url.endsWith('/ranking/')) return ranking;
    if (url.includes('/topics/'))
      return '<a href="' + url.replace('/topics/', '/article/') + '">本文</a>';
    if (url.includes('/2/')) throw new Error('timeout');
    return '<span itemprop="articleBody">テスト本文</span>';
  });
  assert.equal(result.status, 'partial');
  assert.equal(result.articles.length, 3);
  assert.equal(result.articles[1].rank, 2);
  assert.equal(result.articles[1].body, '');
  assert.ok(result.articles[1].error);
  assert.equal(calls.length, 7);
});
test('ランキング取得失敗は記事を作らず案内を返す', async () => {
  const result = await getRanking('general', async () => {
    throw new Error('HTTP 503');
  });
  assert.equal(result.status, 'error');
  assert.deepEqual(result.articles, []);
});
test('未対応カテゴリーは通信なしで終了する', async () => {
  assert.equal(
    newsInputSchema.safeParse({ category: 'science' }).success,
    false,
  );
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('通信してはいけない');
  };
  try {
    const result = await newsTool.execute!(
      { category: 'unsupported' },
      { observe: noopObserve },
    );
    assert.deepEqual(result, {
      status: 'unsupported',
      message: unsupportedMessage,
      displayText: unsupportedMessage,
      articles: [],
    });
  } finally {
    globalThis.fetch = original;
  }
});

test('表示時のタイトル・リンク・順位は取得値で固定し、不正なマークアップは無効化', () => {
  const result = renderRanking(
    {
      status: 'ok',
      category: '総合',
      fetchedAtJst: '2026/09/26 21:00:00 JST',
      rankingUrl: 'https://news.livedoor.com/ranking/',
      articles: [
        {
          rank: 1,
          title: '[リンク]<script>',
          url: 'https://news.livedoor.com/article/detail/1/',
          body: '本文',
          truncated: false,
        },
      ],
    },
    new Map([[1, '短い要約']]),
  );
  assert.ok(result.includes('2026/09/26 21:00:00 JST'));
  assert.ok(result.includes('https://news.livedoor.com/article/detail/1/'));
  assert.ok(!result.includes('<script>'));
  assert.ok(result.includes('短い要約'));
});

test('記事への同一サイト内移動を追跡し、外部リダイレクトは拒否', async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    return url.includes('/topics/')
      ? new Response(null, {
          status: 301,
          headers: { location: '/article/detail/123/' },
        })
      : new Response('<html>本文</html>', {
          headers: { 'content-type': 'text/html' },
        });
  };
  try {
    assert.equal(
      await fetchHtml('https://news.livedoor.com/topics/detail/123/'),
      '<html>本文</html>',
    );
    assert.equal(calls.length, 2);
    globalThis.fetch = async () =>
      new Response(null, {
        status: 301,
        headers: { location: 'https://example.com/article/detail/123/' },
      });
    await assert.rejects(() =>
      fetchHtml('https://news.livedoor.com/topics/detail/123/'),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('別レイアウトは本文部分だけ取得し、取得範囲限定と明示する', () => {
  const result = parseBody(
    '<div class="articleBody"><div class="mainBody"><p>公開部分</p></div><div class="echoesBody">別記事</div></div>',
  );
  assert.equal(result.body, '公開部分');
  assert.equal(result.truncated, true);
});
