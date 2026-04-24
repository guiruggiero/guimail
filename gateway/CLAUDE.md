# gateway/CLAUDE.md

Claude Code Gateway (`gateway/index.js`). Express server that spawns `claude -p` as a child process and exposes it as an HTTP endpoint for the `askClaudeCode` tool handler.

## Behavior

- Authenticates via `CLAUDE_CODE_GATEWAY_SECRET`
- Enforces a 3-minute timeout and `MAX_CONCURRENCY = 3`
- Sends `process.send("ready")` for PM2 readiness detection
- 5mb request body limit

**Multi-turn sessions**: accepts optional `sessionId` and `resumePrompt` in the request body; resumes via `claude --resume <sessionId> -p <resumePrompt>`; falls back to a fresh session if resume fails (expired or missing session ID).

## Required env vars

`CLAUDE_CODE_GATEWAY_PATH` (HTTP endpoint path, e.g. `/run`), `CLAUDE_CODE_GATEWAY_SECRET`, `EXPRESS_PORT`, `SENTRY_DSN` — kept in `gateway/.env` (gitignored).

## PM2

App name: `claudeCodeGateway`. Managed via `gateway/pm2.config.js`.
