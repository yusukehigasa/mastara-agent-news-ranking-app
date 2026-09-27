import assert from 'node:assert/strict';
import { escapeMarkdown } from '../src/news/format-ranking.ts';
import { mastra } from '../src/mastra/index.ts';
import { unsupportedMessage } from '../src/news/categories.ts';
import type { RankingResult } from '../src/news/types.ts';
const agent = mastra.getAgentById('news-agent');
for (const [prompt, expected] of [
  ['人気の記事を教えて', 'general'],
  ['エンタメの人気の記事を教えて', 'entertainment'],
  ['国内の人気の記事を教えて', 'domestic'],
  ['政治', 'politics'],
  ['国際ニュースのランキングを教えて', 'world'],
  ['経済の人気ニュースを教えて', 'economy'],
  ['テクノロジーの人気ニュースを教えて', 'it'],
  ['スポーツの人気の記事を教えて', 'sports'],
  ['女性向けの人気記事を教えて', 'women'],
  ['科学の人気記事を教えて', 'unsupported'],
  ['国内と海外の人気記事を教えて', 'unsupported'],
  ['東京の天気を教えて', 'unsupported'],
] as const) {
  if (process.argv.length > 2 && !process.argv.slice(2).includes(expected))
    continue;
  let category: unknown;
  let result: RankingResult | undefined;
  const response = await agent.generate(prompt, {
    onStepFinish: (step) => {
      for (const call of step.toolCalls)
        category = (call.payload.args as { category: string }).category;
      for (const item of step.toolResults)
        result = item.payload.result as RankingResult;
    },
  });
  assert.equal(category, expected);
  assert.ok(result);
  if (expected === 'unsupported') {
    assert.equal(result.status, 'unsupported');
    assert.equal(result.message, unsupportedMessage);
    assert.ok(response.text.includes('人気の記事を教えて'));
    assert.ok(response.text.includes('エンタメの人気の記事を教えて'));
    assert.equal(result.articles.length, 0);
    assert.ok(!response.text.includes('https://'));
  } else {
    assert.equal(result.status, 'ok');
    assert.equal(result.articles.length, 3);
    assert.ok(!response.text.includes('要約を生成できませんでした'));
    for (const article of result.articles) {
      assert.ok(response.text.includes(article.url));
      assert.ok(response.text.includes(escapeMarkdown(article.title)));
    }
    assert.ok(response.text.includes(result.fetchedAtJst!));
  }
  assert.equal(response.steps.length, 2);
  console.log(
    JSON.stringify(
      {
        prompt,
        category,
        steps: response.steps.length,
        status: result.status,
        outputCharacters: response.text.length,
      },
      null,
      2,
    ),
  );
}
