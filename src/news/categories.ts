import { newsProvider } from './providers/index.ts';
export const categories = newsProvider.categories;
export type Category = string;
export const categoryKeys = Object.keys(categories) as [
  Category,
  ...Category[],
];
export const categoryGuide = categoryKeys
  .map((key) => key + '＝' + categories[key].aliases.join('・'))
  .join('、');
export const unsupportedMessage =
  '対応カテゴリーは' +
  categoryKeys.map((key) => categories[key].label).join('・') +
  'です。人気ニュースのカテゴリーを1つ指定してください。例：「人気の記事を教えて」「エンタメの人気の記事を教えて」。';
