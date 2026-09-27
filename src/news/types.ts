export type Article = {
  rank: number;
  title: string;
  url: string;
  body: string;
  truncated: boolean;
  error?: string;
};
export type RankingResult = {
  status: 'ok' | 'partial' | 'error' | 'unsupported';
  message?: string;
  providerName?: string;
  category?: string;
  rankingUrl?: string;
  fetchedAt?: string;
  fetchedAtJst?: string;
  articles: Article[];
};

export type ReadHtml = (url: string) => Promise<string>;
export type NewsProvider = {
  readonly name: string;
  readonly categories: Readonly<
    Record<
      string,
      {
        readonly label: string;
        readonly url: string;
        readonly aliases: readonly string[];
      }
    >
  >;
  fetchHtml: (url: string, signal?: AbortSignal) => Promise<string>;
  getRanking: (category: string, read?: ReadHtml) => Promise<RankingResult>;
};
