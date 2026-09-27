import type { Processor } from '@mastra/core/processors';
// Toolが作った表示文だけを流す。LLMの言い換えはCLIにもStudioにも出さない。
export const fixedPresentation = {
  id: 'fixed-presentation',
  processOutputStream: async ({ part, state }) => {
    if (part.type === 'tool-result' && part.payload.toolName === 'newsTool') {
      const result = part.payload.result as { displayText?: string };
      state.displayText = result.displayText;
      state.emitted = false;
    }
    if (part.type === 'text-delta') {
      if (typeof state.displayText !== 'string' || state.emitted) return null;
      state.emitted = true;
      return { ...part, payload: { ...part.payload, text: state.displayText } };
    }
    return part;
  },
} satisfies Processor;
