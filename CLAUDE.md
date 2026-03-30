# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Functions** (`functions/` directory):
```bash
npm run lint    # ESLint check
npm run deploy  # Deploy to Firebase Cloud Functions (runs lint first)
```

**Worker** (`worker/` directory):
```bash
npm run lint    # ESLint check
npm run deploy  # Deploy to Cloudflare Worker via wrangler
npm run key     # Manage Cloudflare Worker secrets
```

There are no automated tests — `tests/` contains manual scripts run locally with secrets from outside the repo (`../../secrets/guimail.mjs`).

## Architecture

GuiMail processes emails forwarded by a user. Two components work in sequence:

### Cloudflare Email Worker (`worker/src/index.js`)
Receives emails via Cloudflare Email Routing. Pipeline:
1. Validates sender against allowlist (built lazily from env vars, not available at module scope; rejects with `setReject`)
2. Enforces 5MB size limit (rejects oversized emails)
3. Extracts `subject`, `messageID`, and `references` headers from the raw message
4. POSTs the raw email body (octet stream) to the Firebase Cloud Function with `WORKER_SECRET` auth and metadata as query params
5. Sends the raw RFC 2822 reply from the function back to the sender via `message.reply()`

### Firebase Cloud Function (`functions/index.js`)
Single exported function `guimail`. Pipeline:
1. Authenticates the request via `Authorization: Bearer <WORKER_SECRET>` header
2. Parses the raw email body with **PostalMime** (prefers text over HTML)
3. Fetches the system prompt from **Langfuse** (prompt named `"GuiMail"`)
4. Calls **Gemini** (`gemini-pro-latest`, temp 0.1, thinking disabled) with forced tool use (`FunctionCallingConfigMode.ANY`)
5. Executes the chosen tool handler, then sends back the raw RFC 2822 reply message

**Tool handlers** (in `toolHandlers` object):
- `create_calendar_event` — generates an iCal invite string using `ical-generator`; attached to reply as `icalEvent`
- `summarize_email` — returns the summary text
- `add_to_budget` — writes to a Google Sheet via service account key file (`service-account-key.json`); also creates a Splitwise expense automatically if the issuer is Capital One
- `add_to_splitwise` — creates a Splitwise expense via `axiosInstance` (pre-configured with retry logic)

All tools with data extraction include a `confidence` field; handlers reject calls below 0.5.

**Reply threading**: the reply sets `In-Reply-To` and `References` headers using the original `messageID` and `references` query params.

**HTTP status code contract**: the function returns `502` for retryable errors (Gemini, Langfuse, Sheets API) and `500` for deterministic/post-write errors; the worker retries on `> 500` only.

**Required env vars (Worker):**
- `SENTRY_DSN`, `WORKER_SECRET`, `EMAIL_GUIMAIL`, `EMAIL_GUI`, `EMAIL_GUI_AUTO_FWD`, `EMAIL_UM`
- Set as Cloudflare Worker secrets via `npm run key`.

**Required env vars (Firebase):**
- `GEMINI_API_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, `SENTRY_DSN`, `WORKER_SECRET`, `SPLITWISE_API_KEY`, `SPLITWISE_GUI_ID`, `SPLITWISE_GEORGIA_ID`, `GOOGLE_SHEET_ID`, `EMAIL_GUIMAIL`
- Set in the Firebase Console (no `.env` file); available at cold start via `process.env.*`.

**Sentry:** Errors logged to the `guimail` project (`GUIMAIL-*` issue IDs).

## Code Style

- Max line length: 80 characters (enforced by ESLint Google style config, `functions/` only).
