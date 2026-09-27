import type { Article, RankingResult, NewsProvider } from '../types.ts';
import { load } from 'cheerio';

export const categories = {
  general: {
    label: '総合',
    url: 'https://news.livedoor.com/ranking/',
    aliases: ['総合', '指定なし'],
  },
  domestic: {
    label: '国内',
    url: 'https://news.livedoor.com/ranking/category/dom/',
    aliases: ['国内', '日本国内'],
  },
  politics: {
    label: '政治',
    url: 'https://news.livedoor.com/ranking/category/pol/',
    aliases: ['政治', '政界'],
  },
  world: {
    label: '海外',
    url: 'https://news.livedoor.com/ranking/category/world/',
    aliases: ['海外', '国際', '世界'],
  },
  economy: {
    label: '経済',
    url: 'https://news.livedoor.com/ranking/category/eco/',
    aliases: ['経済', 'ビジネス', '金融'],
  },
  it: {
    label: 'IT',
    url: 'https://news.livedoor.com/ranking/category/it/',
    aliases: ['IT', 'ＩＴ', 'テクノロジー', 'テック'],
  },
  sports: {
    label: 'スポーツ',
    url: 'https://news.livedoor.com/ranking/category/sports/',
    aliases: ['スポーツ'],
  },
  entertainment: {
    label: '芸能',
    url: 'https://news.livedoor.com/ranking/category/ent/',
    aliases: ['芸能', 'エンタメ', '芸能界'],
  },
  women: {
    label: '女子',
    url: 'https://news.livedoor.com/ranking/category/love/',
    aliases: ['女子', '女性向け', '女子向け'],
  },
} as const;
export type Category = keyof typeof categories;
export const categoryKeys = Object.keys(categories) as [
  Category,
  ...Category[],
];
const MAX_BYTES = 2_000_000;

// 外部ページが指定するURLでも、取得先はライブドアの公開記事だけに限定する。
export function validateUrl(value: string): string {
  const u = new URL(value);
  if (
    u.protocol !== 'https:' ||
    u.hostname !== 'news.livedoor.com' ||
    u.port ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    (!categoryKeys.some((key) => categories[key].url === u.href) &&
      !/^\/(?:topics|article)\/detail\/\d+\/$/.test(u.pathname))
  ) {
    throw new Error('許可されていない取得先です');
  }
  return u.href;
}

export async function fetchHtml(
  url: string,
  signal?: AbortSignal,
): Promise<string> {
  const timeout = AbortSignal.timeout(15_000);
  const combinedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let currentUrl = validateUrl(url);
  let response: Response;
  for (let redirects = 0; ; redirects++) {
    response = await fetch(currentUrl, {
      redirect: 'manual',
      signal: combinedSignal,
      headers: { Accept: 'text/html' },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (redirects >= 3 || !location)
      throw new Error('リダイレクト上限または移動先不明');
    currentUrl = validateUrl(new URL(location, currentUrl).href);
  }
  if (!response.ok)
    throw new Error('記事サイトがHTTP ' + response.status + 'を返しました');
  if (!response.headers.get('content-type')?.includes('text/html'))
    throw new Error('HTML以外の応答です');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('応答本文がありません');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error('応答サイズが上限を超えました');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function parseRanking(
  html: string,
): Omit<Article, 'body' | 'truncated'>[] {
  const $ = load(html);
  return [1, 2, 3].map((rank) => {
    const row = $('ol.articleList.withRanking > li.rank' + rank);
    if (row.length !== 1)
      throw new Error('ランキングの構造が変わったか、上位3件を取得できません');
    const link = row.find('a[href]').first();
    const url = validateUrl(link.attr('href') || '');
    const title = row.find('.articleListTtl').text().trim();
    if (!title || !/\/(topics|article)\/detail\//.test(url))
      throw new Error('記事情報が不完全です');
    return { rank, title, url };
  });
}

export function parseBody(html: string): { body: string; truncated: boolean } {
  const $ = load(html);
  const standardBody = $('[itemprop="articleBody"]').first();
  const limitedLayout = standardBody.length === 0;
  const region = limitedLayout
    ? $('.articleBody .mainBody').first()
    : standardBody;
  region.find('script, style, noscript, iframe, nav, form').remove();
  region.find('br').replaceWith('\n');
  region.find('p').append('\n');
  const body = region
    .text()
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
  if (!body) throw new Error('記事本文を取得できませんでした');
  return {
    body: body.slice(0, 12000),
    truncated: limitedLayout || body.length > 12000,
  };
}

export async function getRanking(
  category: string,
  read: (url: string) => Promise<string> = fetchHtml,
): Promise<RankingResult> {
  if (!Object.hasOwn(categories, category))
    throw new Error('未対応のカテゴリーです: ' + category);
  const config = categories[category as Category];
  const metadata = {
    category: config.label,
    rankingUrl: config.url,
    fetchedAt: new Date().toISOString(),
    fetchedAtJst:
      new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        dateStyle: 'short',
        timeStyle: 'medium',
      }).format(new Date()) + ' JST',
  };
  try {
    const items = parseRanking(await read(config.url));
    const articles: Article[] = [];
    // サイトへの同時アクセスを増やさないよう順番に取得する。
    for (const item of items) {
      let articleUrl = item.url;
      try {
        let html = await read(articleUrl);
        if (new URL(articleUrl).pathname.startsWith('/topics/')) {
          const $ = load(html);
          const expected = articleUrl.replace('/topics/', '/article/');
          const found = $('a[href]')
            .toArray()
            .some((a) => $(a).attr('href') === expected);
          if ($('[itemprop="articleBody"], .articleBody .mainBody').length) {
            articleUrl = validateUrl(expected);
          } else {
            if (!found) throw new Error('記事本文へのリンクが見つかりません');
            articleUrl = validateUrl(expected);
            html = await read(articleUrl);
          }
        }
        articles.push({ ...item, url: articleUrl, ...parseBody(html) });
      } catch {
        articles.push({
          ...item,
          url: articleUrl,
          body: '',
          truncated: false,
          error: '記事本文を取得できませんでした。リンクから確認してください。',
        });
      }
    }
    return {
      status: articles.some((a) => a.error) ? 'partial' : 'ok',
      ...metadata,
      articles,
    };
  } catch {
    return {
      status: 'error',
      ...metadata,
      message:
        'ランキングを取得できませんでした。時間をおいて再度お試しください。',
      articles: [],
    };
  }
}

export const livedoorProvider = {
  name: 'ライブドアニュース',
  categories,
  fetchHtml,
  getRanking,
} satisfies NewsProvider;
