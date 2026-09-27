import type { Processor } from '@mastra/core/processors';
// 最初に分類Toolを必ず1回呼び、その後は取得結果を文章にする。
// Studio・CLIの両方に同じ制約を適用する。
export const rankingFlow = {
  id: 'ranking-flow',
  processInputStep: async ({ stepNumber }) => ({
    toolChoice:
      stepNumber === 0
        ? { type: 'tool' as const, toolName: 'newsTool' }
        : ('none' as const),
  }),
} satisfies Processor;
