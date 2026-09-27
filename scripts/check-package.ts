import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

assert(process.argv[2], 'Usage: yarn check:package <archive.tar.gz>');
const archive = resolve(process.argv[2]);
const directory = await mkdtemp(join(tmpdir(), 'mastra-package-check-'));
let server: ReturnType<typeof spawn> | undefined;
let exited: Promise<unknown[]> | undefined;
let logs = '';

try {
  execFileSync('tar', ['-xzf', archive, '-C', directory]);
  assert((await stat(join(directory, 'index.mjs'))).isFile());
  assert((await stat(join(directory, 'package.json'))).isFile());
  assert((await stat(join(directory, 'node_modules'))).isDirectory());

  // Fail rather than accidentally checking an already running development server.
  const probe = createServer();
  const listening = once(probe, 'listening');
  probe.listen(4111, '127.0.0.1');
  await listening;
  await new Promise<void>((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );

  server = spawn(process.execPath, ['index.mjs'], {
    cwd: directory,
    env: {
      ...process.env,
      NODE_PATH: '',
      NODE_OPTIONS: '',
      MASTRA_TELEMETRY_DISABLED: '1',
      OPENAI_API_KEY: 'ci-placeholder-not-a-real-key',
      MASTRA_MODEL: 'openai/gpt-4o-mini',
      NEWS_PROVIDER: 'livedoor',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  exited = once(server, 'close');
  server.stdout?.on('data', (data) => (logs += data));
  server.stderr?.on('data', (data) => (logs += data));

  const deadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < deadline) {
    assert(server.exitCode === null, `Server exited with ${server.exitCode}`);
    let response;
    try {
      response = await fetch('http://127.0.0.1:4111/api/agents', {
        signal: AbortSignal.timeout(1000),
      });
    } catch {
      await delay(250);
      continue;
    }
    assert.equal(response.status, 200, 'Agent API must return HTTP 200');
    const agents = (await response.json()) as Record<string, { id?: string }>;
    assert(
      Object.values(agents).some((agent) => agent.id === 'news-agent'),
      'news-agent must be registered',
    );
    ready = true;
    break;
  }
  assert(ready, 'Server did not become ready within 30 seconds');
  console.log(
    `Node ${process.version}: isolated package returned HTTP 200 with news-agent registered.`,
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  if (server) {
    const forceStop = setTimeout(() => server?.kill('SIGKILL'), 5000);
    server.kill('SIGTERM');
    await exited;
    clearTimeout(forceStop);
  }
  await rm(directory, { recursive: true, force: true });
}
