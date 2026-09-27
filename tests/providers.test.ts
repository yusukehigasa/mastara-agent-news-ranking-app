import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getNewsProvider } from '../src/news/providers/index.ts';
import { getRanking } from '../src/news/ranking-service.ts';
import { renderRanking } from '../src/news/format-ranking.ts';
import type { NewsProvider } from '../src/news/types.ts';

test('対応媒体だけを選択し、未知の値や継承プロパティを拒否する', () => {
  assert.equal(getNewsProvider('livedoor').name, 'ライブドアニュース');
  for (const name of ['', 'unknown', 'constructor', '__proto__']) {
    assert.throws(() => getNewsProvider(name), /未対応のNEWS_PROVIDER/);
  }
});

test('共通処理と表示は媒体から渡された情報を使用する', async () => {
  const provider: NewsProvider = {
    name: 'テストニュース',
    categories: {
      general: {
        label: '総合',
        url: 'https://example.com/ranking',
        aliases: ['総合'],
      },
    },
    fetchHtml: async () => {
      throw new Error('このテストでは通信しない');
    },
    getRanking: async (category) => {
      assert.equal(category, 'general');
      return {
        status: 'ok',
        category: '総合',
        rankingUrl: 'https://example.com/ranking',
        fetchedAtJst: 'テスト日時',
        articles: [
          {
            rank: 1,
            title: 'テスト記事',
            url: 'https://example.com/1',
            body: '本文',
            truncated: false,
          },
        ],
      };
    },
  };
  const result = await getRanking('general', undefined, provider);
  const text = renderRanking(result, new Map([[1, '要約']]));
  assert.match(text, /テストニュース：総合/);
  assert.match(text, /https:\/\/example.com\/1/);
  assert.doesNotMatch(text, /ライブドア/);
});
