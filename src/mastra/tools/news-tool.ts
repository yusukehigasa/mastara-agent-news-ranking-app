import { summarizeArticles } from '../agents/news-summarizer.ts';
import { renderRanking } from '../../news/format-ranking.ts';
import { getRanking } from '../../news/ranking-service.ts';
import { newsProvider } from '../../news/providers/index.ts';
import type { RankingResult } from '../../news/types.ts';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  categoryKeys,
  categoryGuide,
  unsupportedMessage,
} from '../../news/categories.ts';

export const newsInputSchema = z.object({
  category: z
    .enum([...categoryKeys, 'unsupported'])
    .describe(
      '人気ニュースの依頼を分類：' +
        categoryGuide +
        '。対象外カテゴリー、複数カテゴリー、天気など別の依頼はunsupported。',
    ),
});
export const newsTool = createTool({
  id: 'get-news-ranking',
  description:
    '入力の対応可否を検証し、指定カテゴリーの選択媒体の上位3記事を今取得する。unsupportedは通信せず案内だけ返す。',
  inputSchema: newsInputSchema,
  execute: async (
    { category },
    context,
  ): Promise<RankingResult & { displayText: string }> => {
    if (category === 'unsupported')
      return {
        status: 'unsupported',
        message: unsupportedMessage,
        displayText: unsupportedMessage,
        articles: [],
      };
    console.log('[Tool] ランキング取得:', category);
    const result = await getRanking(category, (url) =>
      newsProvider.fetchHtml(url, context?.abortSignal),
    );
    return {
      ...result,
      displayText: renderRanking(
        result,
        await summarizeArticles(result.articles),
      ),
    };
  },
});
