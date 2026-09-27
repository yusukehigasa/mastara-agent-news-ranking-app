import assert from 'node:assert/strict';
import { categoryKeys } from '../src/news/categories.ts';
import { getRanking } from '../src/news/ranking-service.ts';
for (const category of categoryKeys) {
  const result = await getRanking(category);
  console.log(
    JSON.stringify(
      {
        category,
        status: result.status,
        fetchedAt: result.fetchedAt,
        articles: result.articles.map((a) => ({
          rank: a.rank,
          title: a.title,
          url: a.url,
          characters: a.body.length,
          error: a.error,
        })),
      },
      null,
      2,
    ),
  );
  assert.equal(result.status, 'ok');
  assert.equal(result.articles.length, 3);
  assert.ok(result.articles.every((a) => a.body.length > 0));
}
