import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixedPresentation } from '../src/mastra/processors/fixed-presentation.ts';
import { rankingFlow } from '../src/mastra/processors/ranking-flow.ts';

type OutputInput = Parameters<typeof fixedPresentation.processOutputStream>[0];
// このProcessorが使用するイベントとリクエスト状態だけを用意する。
function session() {
  const state = {};
  return (part: OutputInput['part']) =>
    fixedPresentation.processOutputStream({ part, state } as OutputInput);
}
function delta(text: string): OutputInput['part'] {
  return { type: 'text-delta', payload: { text } } as OutputInput['part'];
}
function result(
  displayText: string,
  toolName = 'newsTool',
): OutputInput['part'] {
  return {
    type: 'tool-result',
    payload: { toolName, result: { displayText } },
  } as OutputInput['part'];
}

test('Tool前の文章とLLMの追加文章を抑制し、確定した回答を一度だけ出す', async () => {
  const emit = session();
  assert.equal(await emit(delta('推測したニュース')), null);
  const toolResult = result('取得値に基づく回答');
  assert.deepEqual(await emit(toolResult), toolResult);
  const output = await emit(delta('結果を表示します。'));
  assert.equal(output?.type, 'text-delta');
  if (output?.type === 'text-delta')
    assert.equal(output.payload.text, '取得値に基づく回答');
  assert.equal(await emit(delta('LLMの追加説明')), null);
});

test('別のToolの結果や別リクエストの回答を混ぜない', async () => {
  const first = session();
  const second = session();
  await first(result('1件目の回答'));
  await second(result('別Toolの回答', 'otherTool'));
  assert.equal(await second(delta('出力')), null);
  await second(result('2件目の回答'));
  const output = await second(delta('出力'));
  if (output?.type !== 'text-delta') assert.fail('回答が出力されていない');
  assert.equal(output.payload.text, '2件目の回答');
});

test('最初のステップだけnewsToolを呼び、取得を繰り返さない', async () => {
  type Input = Parameters<typeof rankingFlow.processInputStep>[0];
  assert.deepEqual(
    await rankingFlow.processInputStep({ stepNumber: 0 } as Input),
    { toolChoice: { type: 'tool', toolName: 'newsTool' } },
  );
  for (const stepNumber of [1, 2]) {
    assert.deepEqual(
      await rankingFlow.processInputStep({ stepNumber } as Input),
      { toolChoice: 'none' },
    );
  }
});
