# Riskon App

Monorepo that triggers [riskon](https://github.com/AliAmjid/riskon) optimization runs through the [Cursor SDK](https://cursor.com/docs/sdk/typescript).

```
riskon-app/
├── apps/
│   ├── api/          NestJS — agent orchestration, WebSocket events, Postgres
│   └── web/          React + Vite — submit runs, watch live events
├── packages/
│   └── shared/       Shared TypeScript types
└── docker-compose.yml
```

## Architecture

The API wraps the Cursor SDK lifecycle:

```typescript
await using agent = await Agent.create({
  apiKey: process.env.CURSOR_API_KEY!,
  model: { id: 'composer-2.5' },
  local: { cwd: process.env.RISKON_AGENT_PATH },
});

const run = await agent.send(prompt);

for await (const event of run.stream()) {
  // persisted to Postgres + pushed over WebSocket
}

const result = await run.wait();
```

Local runs execute against a mounted `riskon-agent` checkout. Cloud runs clone a repository on a Cursor VM instead.

## Prerequisites

- Node.js 24+
- Docker & Docker Compose
- A [Cursor API key](https://cursor.com/dashboard/integrations)
- Local checkout of riskon-agent (default: `~/.cursor/riskon-agent`)

## Quick start (Docker)

```bash
cp .env.example .env
# set CURSOR_API_KEY in .env

docker compose up --build
```

- Web UI: http://localhost:5173
- API: http://localhost:3000/health

## Local development

```bash
cp .env.example .env
npm install
npm run build -w @riskon/shared

# Terminal 1 — infrastructure
docker compose up postgres

# Terminal 2 — API + web
npm run dev
```

Set `RISKON_AGENT_PATH` to your local riskon-agent directory when running the API outside Docker.

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `POST` | `/runs` | Start a new agent run |
| `GET` | `/runs` | List runs |
| `GET` | `/runs/:id` | Run details |
| `GET` | `/runs/:id/events` | Stored SDK events |
WebSocket: connect to the API origin and emit `run:subscribe` with `{ runId }`. Events arrive on `run:event` and status patches on `run:updated`.

## No auth (for now)

There is no login layer yet. Do not expose this stack publicly without adding authentication first.

## Deploy

Production is the DigitalOcean droplet. `docker-compose.prod.yml` runs Postgres, the API, the Vite UI, and nginx+certbot. Cloud agents need that always-on API; Netlify Functions cannot host it.

```bash
# On the droplet
cd /var/www/riskon
docker compose -f docker-compose.prod.yml up -d --build
```

`PUBLIC_BASE_URL` is the origin cloud agents use to fetch uploaded datasets and to call MCP. It must be the public HTTPS hostname, not localhost.
