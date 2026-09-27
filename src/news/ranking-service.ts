import { newsProvider } from './providers/index.ts';
import type { NewsProvider, ReadHtml, RankingResult } from './types.ts';

export async function getRanking(
  category: string,
  read?: ReadHtml,
  provider: NewsProvider = newsProvider,
): Promise<RankingResult> {
  return {
    ...(await provider.getRanking(category, read)),
    providerName: provider.name,
  };
}
