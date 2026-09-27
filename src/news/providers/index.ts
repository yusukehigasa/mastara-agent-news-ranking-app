import { livedoorProvider } from './livedoor.ts';
import type { NewsProvider } from '../types.ts';

const providers: Record<string, NewsProvider> = { livedoor: livedoorProvider };
export function getNewsProvider(
  name = process.env.NEWS_PROVIDER ?? 'livedoor',
): NewsProvider {
  if (!Object.hasOwn(providers, name)) {
    throw new Error(
      '未対応のNEWS_PROVIDERです: ' +
        name +
        '。対応媒体: ' +
        Object.keys(providers).join(', '),
    );
  }
  return providers[name];
}
export const newsProvider = getNewsProvider();
