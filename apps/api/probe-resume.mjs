// Throwaway probe: what does a resumed cloud run actually support?
import { readFileSync } from 'node:fs';
import { Agent } from '@cursor/sdk';

const env = Object.fromEntries(
  readFileSync(new URL('./.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line.trim() && !line.startsWith('#'))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);

const apiKey = env.CURSOR_API_KEY;
const agentId = process.argv[2];
if (!agentId) throw new Error('pass an agent id');

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

log('resuming', agentId);
const agent = await Agent.resume(agentId, {
  apiKey,
  model: { id: env.CURSOR_MODEL ?? 'composer-2.5' },
});
log('resumed, agentId =', agent.agentId);

const run = await agent.send(
  'Reply with exactly the single word: pong. Do not run any commands.',
);
log('run', run.id, 'status', run.status);
for (const op of ['stream', 'wait', 'cancel', 'conversation']) {
  log(`  supports(${op}) =`, run.supports(op), run.unsupportedReason(op) ?? '');
}

let count = 0;
const streamed = (async () => {
  try {
    for await (const event of run.stream()) {
      count += 1;
      if (count <= 3) log('  event', event.type);
    }
    log('stream ended cleanly after', count);
  } catch (error) {
    log('stream THREW after', count, '->', String(error));
  }
})();

const waited = run
  .wait()
  .then((r) => ({ kind: 'resolved', r }))
  .catch((e) => ({ kind: 'threw', e }));

const outcome = await waited;
log('wait() =', JSON.stringify(outcome, (k, v) => (v instanceof Error ? String(v) : v)));
await streamed;

// Can a fresh handle report the truth while the agent keeps working?
for (let i = 0; i < 20; i += 1) {
  await new Promise((r) => setTimeout(r, 5000));
  try {
    const fresh = await Agent.getRun(run.id, {
      runtime: 'cloud',
      agentId: agent.agentId,
      apiKey,
    });
    log(`poll ${i}: status=${fresh.status} result=${String(fresh.result).slice(0, 60)}`);
    if (fresh.status !== 'running') {
      try {
        const turns = await fresh.conversation();
        log('  conversation turns:', turns.length, turns.map((t) => t.type).join(','));
      } catch (e) {
        log('  conversation failed:', String(e));
      }
      break;
    }
  } catch (error) {
    log(`poll ${i} failed:`, String(error));
  }
}

await agent[Symbol.asyncDispose]();
log('done');
