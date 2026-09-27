import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getRanking, parseBody } from '../src/news/providers/livedoor.ts';
import { renderRanking } from '../src/news/format-ranking.ts';

const ranking =
  '<ol class="articleList withRanking">' +
  [1, 2, 3]
    .map(
      (rank) =>
        `<li class="rank${rank}"><a href="https://news.livedoor.com/topics/detail/${rank}/"><h3 class="articleListTtl">記事${rank}</h3></a></li>`,
    )
    .join('') +
  '</ol>';

test('未対応カテゴリーを取得前に拒否する', async () => {
  let calls = 0;
  for (const category of ['science', 'constructor', '__proto__']) {
    await assert.rejects(
      getRanking(category, async () => {
        calls++;
        return '';
      }),
      /未対応のカテゴリー/,
    );
  }
  assert.equal(calls, 0);
});

test('ランキング構造が壊れたら本文を取得せずエラーにする', async () => {
  let calls = 0;
  const result = await getRanking('general', async () => {
    calls++;
    return ranking.replace('rank2', 'rank1');
  });
  assert.equal(result.status, 'error');
  assert.deepEqual(result.articles, []);
  assert.equal(calls, 1);
});

test('概要ページから別記事へのリンクをたどらず、各順位に失敗を表示する', async () => {
  const calls: string[] = [];
  const result = await getRanking('general', async (url) => {
    calls.push(url);
    return url.endsWith('/ranking/')
      ? ranking
      : '<a href="https://news.livedoor.com/article/detail/999/">別の記事</a>';
  });
  assert.equal(result.status, 'partial');
  assert.deepEqual(
    result.articles.map((a) => a.rank),
    [1, 2, 3],
  );
  assert.ok(result.articles.every((a) => a.error && a.body === ''));
  assert.equal(calls.length, 4);
  assert.ok(calls.every((url) => !url.includes('/999/')));
});

test('概要URLですでに本文が返された場合は再取得しない', async () => {
  let calls = 0;
  const result = await getRanking('general', async (url) => {
    calls++;
    return url.endsWith('/ranking/')
      ? ranking
      : '<div itemprop="articleBody">本文</div>';
  });
  assert.equal(result.status, 'ok');
  assert.equal(calls, 4);
  assert.ok(
    result.articles.every(
      (a) => a.body === '本文' && a.url.includes('/article/detail/'),
    ),
  );
});

test('本文12000文字の境界で切り詰めと表示フラグが一致する', () => {
  for (const length of [12000, 12001]) {
    const parsed = parseBody(
      '<div itemprop="articleBody">' + 'あ'.repeat(length) + '</div>',
    );
    assert.equal(parsed.body.length, 12000);
    assert.equal(parsed.truncated, length > 12000);
  }
});

test('要約不足・本文取得失敗・取得範囲限定を区別して表示する', () => {
  const articles = [1, 2, 3].map((rank) => ({
    rank,
    title: `記事${rank}`,
    url: `https://news.livedoor.com/article/detail/${rank}/`,
    body: '本文',
    truncated: rank === 3,
    ...(rank === 2 ? { error: '本文取得失敗' } : {}),
  }));
  const text = renderRanking(
    { status: 'partial', articles },
    new Map([
      [2, '表示してはいけない要約'],
      [3, '<script>要約</script>'],
    ]),
  );
  assert.match(text, /要約を生成できませんでした/);
  assert.match(text, /本文取得失敗/);
  assert.doesNotMatch(text, /表示してはいけない要約|<script>/);
  assert.match(text, /本文の取得範囲に基づく要約/);
  for (const article of articles) assert.ok(text.includes(article.url));
});

test('対象外とランキング取得失敗では案内文だけを返す', () => {
  for (const status of ['unsupported', 'error'] as const) {
    assert.equal(
      renderRanking({ status, message: '案内文', articles: [] }, new Map()),
      '案内文',
    );
  }
});
