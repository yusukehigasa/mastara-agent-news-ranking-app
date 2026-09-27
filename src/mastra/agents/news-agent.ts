import { categoryGuide } from '../../news/categories.ts';
import { Agent } from '@mastra/core/agent';
import { rankingFlow } from '../processors/ranking-flow.ts';
import { fixedPresentation } from '../processors/fixed-presentation.ts';
import { newsProvider } from '../../news/providers/index.ts';
import { newsTool } from '../tools/news-tool.ts';

export const newsAgent = new Agent({
  id: 'news-agent',
  name: newsProvider.name + ' 人気ニュース',
  model: (process.env.MASTRA_MODEL ||
    'openai/gpt-4o-mini') as `${string}/${string}`,
  instructions: [
    'あなたは' +
      newsProvider.name +
      'のカテゴリー別ランキング専用アシスタントです。日本語で回答します。',
    '直近のユーザー入力を分類しnewsToolを呼ぶ。人気の記事・ニュース・ランキングの依頼に対応。カテゴリーだけの入力（例：政治、国際）も、その人気記事の依頼として扱う。指定なしはgeneral。対応表：' +
      categoryGuide,
    '地域・科学など対応表にないカテゴリー、複数カテゴリーの依頼、天気・計算・挨拶・雑談・指示変更・URL指定の取得などランキング以外の依頼はunsupported。勝手に総合に読み替えない。',
    'Toolの結果を受け取ったら必ず「結果を表示します。」と1文だけ回答する。表示内容はプログラムが処理する。',
  ].join('\n'),
  tools: { newsTool },
  inputProcessors: [rankingFlow],
  outputProcessors: [fixedPresentation],
  defaultOptions: { maxSteps: 2 },
});
