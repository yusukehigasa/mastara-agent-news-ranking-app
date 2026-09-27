import { Mastra } from '@mastra/core';
import { newsAgent } from './agents/news-agent.ts';

export const mastra = new Mastra({
  agents: { newsAgent },
  server: { host: '127.0.0.1', port: 4111 },
});
