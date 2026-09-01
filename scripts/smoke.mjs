#!/usr/bin/env node
/**
 * End-to-end contract check for the API, without spending a cloud agent run.
 *
 * It exercises every surface a Cursor cloud agent touches — the dataset
 * download, the MCP tool list, asking a question, and the answer coming back
 * from the UI side — plus the run and artifact endpoints the web app calls.
 *
 * The agent trigger itself is deliberately made to fail (an invalid API key is
 * passed by the caller), because what is being tested here is the plumbing
 * around the agent, not the agent.
 *
 * Usage:
 *   CURSOR_API_KEY=smoke-invalid node scripts/smoke.mjs
 */

import pg from 'pg';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000';
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://riskon:riskon@localhost:5432/riskon';

let failures = 0;

function check(label, condition, detail) {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function json(path, init) {
  const response = await fetch(`${BASE}${path}`, init);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(
      `${init?.method ?? 'GET'} ${path} → ${response.status} ${JSON.stringify(body)}`,
    );
  }
  return body;
}

/** One JSON-RPC call against a run's MCP endpoint, over streamable HTTP. */
async function mcp(token, method, params, id = 1) {
  const response = await fetch(`${BASE}/mcp/${token}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`MCP ${method} → ${response.status} ${text}`);
  }

  // A streamable-HTTP server answers with SSE frames when the client accepts
  // them, so the JSON payload arrives on a `data:` line.
  const line = text
    .split('\n')
    .find((candidate) => candidate.startsWith('data:'));
  return JSON.parse(line ? line.slice(5).trim() : text);
}

async function mcpTokenFor(runId) {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(
      'SELECT "mcpToken" FROM agent_runs WHERE id = $1',
      [runId],
    );
    return result.rows[0]?.mcpToken ?? null;
  } finally {
    await client.end();
  }
}

const CSV = [
  'name,price,carat,cut',
  'Stone A,1200,0.52,Ideal',
  'Stone B,2400,0.91,Premium',
  'Stone C,860,0.41,Good',
].join('\n');

async function main() {
  console.log(`Riskon API smoke test against ${BASE}\n`);

  // -- health ---------------------------------------------------------------
  const health = await json('/health');
  check('health responds', health?.status === 'ok', JSON.stringify(health));

  // -- datasets -------------------------------------------------------------
  const form = new FormData();
  form.append('file', new Blob([CSV], { type: 'text/csv' }), 'stones.csv');

  const dataset = await json('/datasets', { method: 'POST', body: form });
  check('dataset upload returns an id', Boolean(dataset?.id));
  check(
    'dataset row count is estimated',
    dataset?.rowCountEstimate === 3,
    `got ${dataset?.rowCountEstimate}`,
  );
  check(
    'dataset download url is absolute',
    typeof dataset?.downloadUrl === 'string' &&
      dataset.downloadUrl.startsWith('http'),
    dataset?.downloadUrl,
  );

  const raw = await fetch(`${BASE}/datasets/${dataset.id}/raw`);
  const rawText = await raw.text();
  check('dataset raw download round-trips', rawText.trim() === CSV);

  // -- runs -----------------------------------------------------------------
  const run = await json('/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Smoke test',
      businessQuestion: 'Which of these stones should we buy for the vault?',
      datasetId: dataset.id,
      runtime: 'cloud',
    }),
  });
  check('run is created', Boolean(run?.id));
  check('run starts pending', run?.status === 'pending', run?.status);

  // The MCP token is a bearer credential for this run's question channel, so
  // it never leaves the server. A real cloud agent is handed it by the SDK;
  // here we read it the same way the API stores it.
  const token = await mcpTokenFor(run.id);
  check('run is issued an MCP token', Boolean(token));
  if (!token) throw new Error('cannot continue without an MCP token');

  // -- MCP: what the cloud agent sees --------------------------------------
  const initialised = await mcp(token, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'riskon-smoke', version: '0' },
  });
  check(
    'MCP initialises',
    Boolean(initialised?.result?.serverInfo),
    JSON.stringify(initialised),
  );

  const tools = await mcp(token, 'tools/list', {}, 2);
  const names = (tools?.result?.tools ?? []).map((tool) => tool.name).sort();
  check(
    'MCP exposes the stakeholder tools',
    ['ask_stakeholder', 'await_answers', 'get_run_context', 'notify_stakeholder']
      .every((expected) => names.includes(expected)),
    names.join(', '),
  );

  const context = await mcp(
    token,
    'tools/call',
    { name: 'get_run_context', arguments: {} },
    3,
  );
  const contextText = context?.result?.content?.[0]?.text ?? '';
  check(
    'get_run_context returns the dataset url',
    contextText.includes(dataset.id),
    contextText.slice(0, 200),
  );

  // -- MCP: ask, then answer from the UI side -------------------------------
  // ask_stakeholder blocks until someone answers, so the answer has to be sent
  // while the call is still open. That is the whole point of the mechanism.
  const asking = mcp(
    token,
    'tools/call',
    {
      name: 'ask_stakeholder',
      arguments: {
        intro: 'Before I model this I need two things from you.',
        questions: [
          {
            id: 'budget',
            question: 'How much can you spend in total?',
            whyItMatters: 'It is the single biggest lever on how many stones you get.',
            recommended: '250000',
            unit: 'USD',
          },
          {
            id: 'objective',
            question: 'Most stone for the money, or most profit?',
            options: [
              { value: 'weight', label: 'Most stone for the money' },
              { value: 'profit', label: 'Most profit' },
            ],
            recommended: 'weight',
          },
        ],
      },
    },
    4,
  );

  // Give the round time to land in the database before answering it.
  await new Promise((done) => setTimeout(done, 1200));

  const pending = await json(`/runs/${run.id}/questions`);
  check('the question round is visible to the UI', pending.length === 1);
  check(
    'the run is marked as waiting on the stakeholder',
    (await json(`/runs/${run.id}`))?.status === 'awaiting_input',
  );

  const answered = await json(
    `/runs/${run.id}/questions/${pending[0].id}/answer`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        answers: { budget: '180000', objective: 'profit' },
      }),
    },
  );
  check('answering marks the round answered', answered?.status === 'answered');

  const askResult = await asking;
  const askText = askResult?.result?.content?.[0]?.text ?? '';
  check(
    'ask_stakeholder unblocks with the answers',
    askText.includes('180000') && askText.includes('profit'),
    askText.slice(0, 300),
  );

  // -- MCP: notify ----------------------------------------------------------
  await mcp(
    token,
    'tools/call',
    {
      name: 'notify_stakeholder',
      arguments: { message: 'Loaded 3 stones, modelling now.' },
    },
    5,
  );
  const events = await json(`/runs/${run.id}/events`);
  check(
    'notify_stakeholder lands on the timeline',
    events.some((event) =>
      JSON.stringify(event).includes('Loaded 3 stones'),
    ),
    `${events.length} events`,
  );

  // -- artifacts ------------------------------------------------------------
  const artifacts = await json(`/runs/${run.id}/artifacts`);
  check('artifact listing responds', Array.isArray(artifacts));

  console.log('');
  if (failures > 0) {
    console.log(`${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('All checks passed.');
}

await main().catch((cause) => {
  console.error(`\nSmoke test aborted: ${cause.message}`);
  process.exit(1);
});
