// Nodeが .env を読み込んでから、このモジュールを実行します。
import { mastra } from '../src/mastra/index.ts';

const model = process.env.MASTRA_MODEL || 'openai/gpt-4o-mini';
const keyNames: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
};
const keyName = keyNames[model.split('/')[0]!];
if (keyName && !process.env[keyName]?.trim()) {
  console.error(
    keyName +
      ' が未設定です。このプロジェクトの .env に設定してください。キーはチャットへ貼らないでください。',
  );
  process.exit(1);
}
const prompt = process.argv.slice(2).join(' ') || '人気の記事を教えて';
console.log('[入力]', prompt);
console.log('[LLM]', model);
try {
  // Mastraが「LLM → Tool → 結果をLLMへ → 最終回答」を繰り返します。
  const response = await mastra.getAgentById('news-agent').generate(prompt, {
    maxSteps: 2,
    onStepFinish: (step) => {
      console.log(
        '[Agent Loop]',
        JSON.stringify(
          {
            finishReason: step.finishReason,
            toolCalls: step.toolCalls,
            toolResultCount: step.toolResults.length,
          },
          null,
          2,
        ),
      );
    },
  });
  console.log('\n[最終回答]\n' + response.text);
  console.log('[実行ステップ数]', response.steps.length);
} catch (error) {
  console.error(
    '[実行失敗]',
    error instanceof Error ? error.message : 'Unknown error',
  );
  process.exitCode = 1;
}
