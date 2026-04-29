# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Guimail processes emails forwarded by a user. Two components work in sequence:

1. **Cloudflare Email Worker** (`worker/`) — receives emails via Cloudflare Email Routing, validates the sender, and POSTs the raw email to the Firebase Cloud Function with metadata as query params. Sends the raw RFC 2822 reply back to the sender.
2. **Firebase Cloud Function** (`functions/`) — parses the email; if a `sessionId` is present, short-circuits directly to `askClaudeCode` (skipping Langfuse and Gemini); otherwise fetches the system prompt from Langfuse, calls Gemini with forced tool use, executes the chosen tool handler, and returns a raw RFC 2822 reply.
3. **Claude Code Gateway** (`gateway/`) — Express server that spawns `claude -p` as a child process, used by the `askClaudeCode` tool handler. See `gateway/CLAUDE.md`.

**Session continuity**: the worker extracts `X-Guimail-Session` from incoming emails and passes it as `sessionId` to the function; the function propagates it back in the reply header, enabling multi-turn Claude Code sessions.

**Reply threading**: replies set `In-Reply-To` and `References` headers using the original `messageID` and `references` query params.

**HTTP status code contract**: the function returns `502` for retryable errors (Gemini, Langfuse, Sheets API) and `500` for deterministic/post-write errors; the worker retries on `> 500` only.

**Sentry**: errors logged to the `guimail` project (`GUIMAIL-*` issue IDs).

## Code Style

- `functions/` — max line length 80 characters (ESLint Google style config)
- `gateway/` and `worker/` — 4-space indent (`@stylistic/eslint-plugin`); shared ESLint rules live in `eslint.config.shared.js` at the repo root

## Other

Never modify files in `tests/` — these are manual scripts for local use only.
