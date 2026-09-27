import type { RankingResult } from './types.ts';
export function escapeMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/([\\[\]_*`])/g, '\\$1');
}
export function renderRanking(
  result: RankingResult,
  summaries: Map<number, string>,
): string {
  if (result.status === 'unsupported' || result.status === 'error')
    return result.message || '取得できませんでした。';
  return [
    (result.providerName || 'ニュース') +
      '：' +
      result.category +
      'アクセスランキング',
    '取得日時：' + result.fetchedAtJst,
    '[ランキングページ](' + result.rankingUrl + ')',
    ...result.articles.map(
      (a) =>
        a.rank +
        '. **[' +
        escapeMarkdown(a.title) +
        '](' +
        a.url +
        ')**\n\n' +
        (a.error ||
          escapeMarkdown(
            summaries.get(a.rank) ||
              '要約を生成できませんでした。記事リンクから確認してください。',
          )) +
        (a.truncated ? '\n\n※本文の取得範囲に基づく要約です。' : ''),
    ),
  ].join('\n\n');
}
