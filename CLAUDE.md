# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Functions** (`functions/` directory):
```bash
npm run lint         # ESLint check
npm run lint-fix     # ESLint with auto-fix
npm run deploy       # Deploy to Firebase Cloud Functions (runs lint first)
npm run prompt-pull  # Download production prompt from Langfuse → prompt.md
npm run prompt-push  # Upload prompt.md to Langfuse as new version, not production
npm run friends      # Minify functions/scripts/friends.json → SPLITWISE_FRIENDS in .env
npm start            # Run Claude Code Gateway locally (direct, no PM2)
npm run pm2          # Restart Claude Code Gateway via PM2 (JS/dependency changes)
npm run pm2-config   # Full stop/delete/start cycle via PM2 (pm2.config.js changes)
```

**Worker** (`worker/` directory):
```bash
npm run lint      # ESLint check
npm run lint-fix  # ESLint with auto-fix
npm run deploy    # Deploy to Cloudflare Worker via wrangler
npm run update    # Update wrangler to latest
npm run whoami    # Check authenticated Cloudflare account
npm run secret    # Manage Cloudflare Worker secrets (put/delete)
```

Never modify files in `tests/` — these are manual scripts for local use only.

## Architecture

Guimail processes emails forwarded by a user. Two components work in sequence:

### Cloudflare Email Worker (`worker/src/index.js`)
Receives emails via Cloudflare Email Routing. Pipeline:
1. Validates sender against allowlist (built lazily from env vars, not available at module scope; rejects with `setReject`)
2. Enforces 5MB size limit (rejects oversized emails)
3. Extracts `subject`, `messageID`, `references`, and `X-Guimail-Session` headers from the raw message
4. POSTs the raw email body (octet stream) to the Firebase Cloud Function with `WORKER_SECRET` auth and metadata as query params (includes `sessionId` from `X-Guimail-Session` if present, enabling multi-turn Claude Code sessions)
5. Sends the raw RFC 2822 reply from the function back to the sender via `message.reply()`

**Required env vars:**
- `SENTRY_DSN`, `WORKER_SECRET`, `EMAIL_GUIMAIL`, `EMAIL_GUI`, `EMAIL_GUI_AUTO_FWD`, `EMAIL_UM`, `EMAIL_GEORGIA`
- Set as Cloudflare Worker secrets via `npm run secret`.

### Firebase Cloud Function (`functions/`)
Single exported function `guimail` in `index.js`. Pipeline:
1. Authenticates the request via `Authorization: Bearer <WORKER_SECRET>` header
2. Parses the raw email body with **PostalMime** (prefers text over HTML)
3. Fetches the system prompt from **Langfuse** (prompt named `"Guimail"`)
4. Calls **Gemini** (`gemini-flash-latest`, `thinkingLevel: "high"`) with forced tool use (`FunctionCallingConfigMode.ANY`)
5. Executes the chosen tool handler, then sends back the raw RFC 2822 reply message

**Required env vars (Firebase):**
- `GEMINI_API_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, `SENTRY_DSN`, `WORKER_SECRET`, `SPLITWISE_API_KEY`, `GOOGLE_SHEET_ID`, `GOOGLE_CAL_DEFAULT_ID`, `GOOGLE_CAL_SHARED_ID`, `EMAIL_GUIMAIL`, `FLIGHTAWARE_AEROAPI_KEY`, `CLAUDE_CODE_GATEWAY_URL`, `CLAUDE_CODE_GATEWAY_SECRET`
- `SPLITWISE_FRIENDS` — minified JSON array of `{id, name, nickname}`; source of truth is `functions/scripts/friends.json` (gitignored); run `npm run friends` to update `.env` after editing the JSON; names are indexed by first name, full name, and each nickname token (split on " or "); `SPLITWISE_ID_GUI` and `SPLITWISE_ID_GEORGIA` remain as separate env vars for default-payer and `createExpenseWithGeorgia` logic
- All env vars are kept in `functions/.env` (gitignored) and picked up automatically by Firebase CLI on deploy; do not set them manually in the Console

**Tool handlers** (each in `functions/tools/`, assembled into `toolHandlers` in `index.js`):
- `addToCalendar` — creates events via the Google Calendar API (`googleCalendar.js`); routes to either `GOOGLE_CAL_DEFAULT_ID` or `GOOGLE_CAL_SHARED_ID` based on the `calendar` arg ("default"/"shared"); timed events use `transparency: "opaque"` (busy), all-day events use `transparency: "transparent"` (free); all-day is detected by the absence of `T` in the `start` string; for flight events, accepts an optional `flightNumber` (IATA code) and calls the FlightAware AeroAPI (`GET /flights/{ident}`) to resolve the ICAO code and embed a `Track flight: https://www.flightaware.com/live/flight/<ICAO>` link in the event description (best-effort: failures are captured in Sentry but do not block event creation); returns `toolResult.link` as `{url, label}` for a clickable "View in Google Calendar" link
- `summarizeEmail` — returns the summary text
- `addToBudget` — writes to a Google Sheet via `googleSheets.js`; also creates a Splitwise expense automatically if the issuer is Capital One
- `addToSplitwise` — creates a Splitwise expense via `createSoloExpense` or `createSharedExpense`; accepts optional `splitWith` (array of friend names) and `paidBy` (name of payer, defaults to Gui via `SPLITWISE_ID_GUI`); resolves names to Splitwise user IDs via `getFriendRegistry()`; if any name can't be resolved, falls back to a solo expense with a note in the details prompting manual editing in the app; splits equally among all participants; returns `toolResult.link` as `{url, label}` for a clickable "View in Splitwise" link using the expense ID from the API response
- `askClaudeCode` — forwards a coding task to the Claude Code Gateway (`claudeCode.js`); Gemini extracts `typedInstruction` (verbatim, up to the forwarded message separator) and optional `forwardedContent` (HTML-stripped forwarded email body); on a fresh session assembles both into a full prompt, on a resume only sends `typedInstruction` (Claude Code already has prior context); POSTs to `POST /run` on the gateway; throws on empty result; returns `text` (markdown stripped via `remove-markdown`) and `html` (rendered via `marked`) so reply emails render formatting correctly; returns `sessionId` (propagated to the reply as `X-Guimail-Session` header so the next forwarded reply can resume the same session); no `link` or `confidence` in the reply

All tools with data extraction include a `confidence` field; handlers reject calls below 0.5. Tool handlers return `{ type, text, html?, link?, confidence?, sessionId? }` where `text` is the main action sentence(s) only (paragraphs separated by `\n\n`), `html` is a pre-rendered HTML string (used by `askClaudeCode` to preserve markdown formatting), `link` is `{url, label}` when applicable, `confidence` is an integer percentage, and `sessionId` is a Claude Code session ID when applicable. `index.js` assembles these into both `text` and `html` reply parts in a consistent order: main text → link → confidence → sign-off; uses `toolResult.html` directly for the HTML part when provided.

**Adding a new tool**: create `functions/tools/<name>.js` with `definition` and `handler` exports, then add both to `functionDeclarations` and `toolHandlers` in `index.js`. No other registration needed.

**Utilities** (each in `functions/utils/`):
- `axiosClient.js` — `createRetryClient(config, retries = 2)`: shared axios+retry factory (exponential backoff, network/5xx); used by `splitwise.js`, `flightAware.js`, and `claudeCode.js`
- `claudeCode.js` — axios client for the Claude Code Gateway (185s timeout, 1 retry), `runPrompt(prompt, sessionId?, resumePrompt?)`: POSTs to `POST /run` and returns `{result, sessionId}`
- `googleAuth.js` — `KEY_FILE`, `GOOGLE_RETRY_CONFIG`, `getGoogleAuth(scopes)`: shared Google service account auth; used by `googleCalendar.js` and `googleSheets.js`
- `splitwise.js` — `getFriendRegistry` (reads `SPLITWISE_FRIENDS` env var; indexes by first name, full name, and nickname tokens), `createSoloExpense`, `createSharedExpense` (accepts optional `details` param), `createExpenseWithGeorgia`; `checkSplitwiseError` and `splitEqual` are internal helpers (not exported)
- `flightAware.js` — axios client, `getFlightAwareUrl`
- `googleCalendar.js` — Promise-cached Google Calendar client (`getCalendarClient`)
- `googleSheets.js` — Promise-cached Google Sheets client (`getSheetsClient`)
- `langfuse.js` — eagerly initialized Langfuse client (always used per request), `getPrompt(name)`

**Reply threading**: the reply sets `In-Reply-To` and `References` headers using the original `messageID` and `references` query params.

**Prompt management**: `functions/prompt.md` is the system prompt managed via the scripts above and excluded from regular commits. Always perform changes to the system prompt, but never consider it in the commit message. Scripts require `LANGFUSE_SECRET_KEY` and `LANGFUSE_PUBLIC_KEY` in `functions/.env` (gitignored).

**Local scripts** (`functions/scripts/`): utility scripts not deployed with the function; run locally via npm scripts. Includes `prompt.js` (Langfuse prompt pull/push), `friends.json` (the friends registry source of truth), `friends.js` (syncs it to `.env`), and `claudeCodeGateway.js` (the Claude Code Gateway server — see below).

**Claude Code Gateway** (`functions/scripts/claudeCodeGateway.js`): Express server (5mb request body limit) that spawns `claude -p` as a child process and exposes it as an HTTP endpoint for the `askClaudeCode` tool handler. Authenticates via `CLAUDE_CODE_GATEWAY_SECRET`, enforces a 3-minute timeout and `MAX_CONCURRENCY = 3`, and sends `process.send("ready")` for PM2 readiness detection. Supports multi-turn sessions: accepts optional `sessionId` and `resumePrompt` in the request body; resumes via `claude --resume <sessionId> -p <resumePrompt>`; falls back to a fresh session if resume fails (expired or missing session ID). Requires `CLAUDE_CODE_GATEWAY_PATH`, `CLAUDE_CODE_GATEWAY_SECRET`, `EXPRESS_PORT`, and `SENTRY_DSN` env vars. Managed by PM2 via `scripts/pm2.config.js` (app name: `claudeCodeGateway`); `npm run pm2` restarts the process (sufficient for JS or dependency changes); `npm run pm2-config` does a full stop/delete/start/save cycle (needed when `pm2.config.js` itself changes). Run directly (no PM2) with `npm start`.

**Function timeout**: set to 420s (7 minutes) to accommodate `askClaudeCode`, which uses a 185s per-attempt axios timeout with 1 retry.

**HTTP status code contract**: the function returns `502` for retryable errors (Gemini, Langfuse, Sheets API) and `500` for deterministic/post-write errors; the worker retries on `> 500` only.

**Sentry:** Errors logged to the `guimail` project (`GUIMAIL-*` issue IDs).

## Code Style

- Max line length: 80 characters (enforced by ESLint Google style config, `functions/` only).
