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

Never modify files in `tests/` — these are manual scripts for local use only.

## Architecture

Guimail processes emails forwarded by a user. Two components work in sequence:

### Cloudflare Email Worker (`worker/src/index.js`)
Receives emails via Cloudflare Email Routing. Pipeline:
1. Validates sender against allowlist (built lazily from env vars, not available at module scope; rejects with `setReject`)
2. Enforces 5MB size limit (rejects oversized emails)
3. Extracts `subject`, `messageID`, and `references` headers from the raw message
4. POSTs the raw email body (octet stream) to the Firebase Cloud Function with `WORKER_SECRET` auth and metadata as query params
5. Sends the raw RFC 2822 reply from the function back to the sender via `message.reply()`

### Firebase Cloud Function (`functions/`)
Single exported function `guimail` in `index.js`. Pipeline:
1. Authenticates the request via `Authorization: Bearer <WORKER_SECRET>` header
2. Parses the raw email body with **PostalMime** (prefers text over HTML)
3. Fetches the system prompt from **Langfuse** (prompt named `"Guimail"`)
4. Calls **Gemini** (`gemini-flash-latest`, `thinkingLevel: "high"`) with forced tool use (`FunctionCallingConfigMode.ANY`)
5. Executes the chosen tool handler, then sends back the raw RFC 2822 reply message

**Tool handlers** (each in `functions/tools/`, assembled into `toolHandlers` in `index.js`):
- `add_to_calendar` — creates events directly via the Google Calendar API using a lazy-initialized cached client (`service-account-key.json`); routes to either `GOOGLE_CAL_DEFAULT_ID` or `GOOGLE_CAL_SHARED_ID` based on the `calendar` arg ("default"/"shared"); timed events use `transparency: "opaque"` (busy), all-day events use `transparency: "transparent"` (free); all-day is detected by the absence of `T` in the `start` string; returns `toolResult.link` as `{url, label}` for a clickable "View in Google Calendar" link
- `summarize_email` — returns the summary text
- `add_to_budget` — writes to a Google Sheet via a lazily-initialized cached client (`service-account-key.json`); also creates a Splitwise expense automatically if the issuer is Capital One
- `add_to_splitwise` — creates a Splitwise expense via `axiosInstance` (pre-configured with retry logic); accepts optional `split_with` (array of person names) and `paid_by` (name of payer, defaults to Gui via `SPLITWISE_ID_GUI`); resolves names to Splitwise user IDs via `getPersonRegistry()`; splits equally among all participants; returns `toolResult.link` as `{url, label}` for a clickable "View in Splitwise" link using the expense ID from the API response

**Shared Splitwise utilities** (axios client, retry config, `checkSplitwiseError`, `getPersonRegistry`, `splitEqual`, `createSharedExpense`, `createExpenseWithGeorgia`) live in `functions/utils/splitwise.js`.

All tools with data extraction include a `confidence` field; handlers reject calls below 0.5. Tool handlers return `{ type, text, link?, confidence? }` where `text` is the main action sentence(s) only (paragraphs separated by `\n\n`), `link` is `{url, label}` when applicable, and `confidence` is an integer percentage. `index.js` assembles these into both `text` and `html` reply parts in a consistent order: main text → link → confidence → sign-off.

**Reply threading**: the reply sets `In-Reply-To` and `References` headers using the original `messageID` and `references` query params.

**HTTP status code contract**: the function returns `502` for retryable errors (Gemini, Langfuse, Sheets API) and `500` for deterministic/post-write errors; the worker retries on `> 500` only.

**Required env vars (Worker):**
- `SENTRY_DSN`, `WORKER_SECRET`, `EMAIL_GUIMAIL`, `EMAIL_GUI`, `EMAIL_GUI_AUTO_FWD`, `EMAIL_UM`, `EMAIL_GEORGIA`
- Set as Cloudflare Worker secrets via `npm run key`.

**Required env vars (Firebase):**
- `GEMINI_API_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, `SENTRY_DSN`, `WORKER_SECRET`, `SPLITWISE_API_KEY`, `GOOGLE_SHEET_ID`, `GOOGLE_CAL_DEFAULT_ID`, `GOOGLE_CAL_SHARED_ID`, `EMAIL_GUIMAIL`
- Splitwise person registry: `SPLITWISE_ID_<NAME>=<user_id>` (e.g. `SPLITWISE_ID_GUI`, `SPLITWISE_ID_GEORGIA`); add one per person to enable splitting with them by name
- Set in the Firebase Console (no `.env` file); available at cold start via `process.env.*`.

**Sentry:** Errors logged to the `guimail` project (`GUIMAIL-*` issue IDs).

**Prompt management**: `functions/prompt.md` is the system prompt that is pushed to Langfuse manually and excluded from regular commits. Always perform changes to the system prompt, but never consider it in the commit message.

## Code Style

- Max line length: 80 characters (enforced by ESLint Google style config, `functions/` only).
