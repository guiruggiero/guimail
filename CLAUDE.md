# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Guimail processes emails forwarded by a user. Two components work in sequence, each deployed separately from its own folder (folder name and deploy name are independent — both deploy as `guimail`):

1. **Cloudflare Email Worker** (`email-worker/`) — receives emails via Cloudflare Email Routing, validates the sender, and POSTs the raw email to the Firebase Cloud Function with metadata as query params. Sends the raw RFC 2822 reply back to the sender
2. **Firebase Cloud Function** (`agent/`) — parses the email; if a `claudeCodeSessionId` is present, short-circuits directly to `askClaudeCode` (skipping Langfuse and Gemini); otherwise fetches the system prompt from Langfuse, calls Gemini with forced tool use, executes the chosen tool handler, and returns a raw RFC 2822 reply

See `agent/CLAUDE.md` and `email-worker/CLAUDE.md` for each component's pipeline and env vars.

The `askClaudeCode` handler calls the Claude Code Gateway (`guiddleware/claude-code/`, deployed on code-server) via `agent/utils/claudeCode.js`. `addToTrello`/`editTrelloCard` call `guiddleware`'s `tools/` Trello routes via `agent/utils/guiddleware.js`.

**Session continuity**: the function embeds a `[guimail-claudeCode:<id>]` marker in the reply body (Gmail strips custom headers on reply, so headers can't be used); on the next turn the function extracts it from the quoted body to short-circuit directly to `askClaudeCode`. `editTrelloCard` uses the same body-marker trick for its own `[guimail-trello:<id>]`, but only to pass along which card a reply refers to — it doesn't skip Gemini/Langfuse the way the Claude Code marker does.

**Reply threading**: replies set `In-Reply-To` and `References` headers using the original `messageID` and `references` query params.

**HTTP status code contract**: the function returns `502` for retryable errors (Gemini, Langfuse, Guiddleware's Sheets route) and `500` for deterministic/post-write errors; the worker retries on `> 500` only.

**Sentry**: errors logged to the `guimail` project (`GUIMAIL-*` issue IDs).

**SonarQube Cloud**: project key `guiruggiero_guimail`.

## Other

Never modify files in `tests/` — these are manual scripts for local use only.
