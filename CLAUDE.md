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

**Required env vars:**
- `SENTRY_DSN`, `WORKER_SECRET`, `EMAIL_GUIMAIL`, `EMAIL_GUI`, `EMAIL_GUI_AUTO_FWD`, `EMAIL_UM`, `EMAIL_GEORGIA`
- Set as Cloudflare Worker secrets via `npm run key`.

### Firebase Cloud Function (`functions/`)
Single exported function `guimail` in `index.js`. Pipeline:
1. Authenticates the request via `Authorization: Bearer <WORKER_SECRET>` header
2. Parses the raw email body with **PostalMime** (prefers text over HTML)
3. Fetches the system prompt from **Langfuse** (prompt named `"Guimail"`)
4. Calls **Gemini** (`gemini-flash-latest`, `thinkingLevel: "high"`) with forced tool use (`FunctionCallingConfigMode.ANY`)
5. Executes the chosen tool handler, then sends back the raw RFC 2822 reply message

**Required env vars (Firebase):**
- `GEMINI_API_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, `SENTRY_DSN`, `WORKER_SECRET`, `SPLITWISE_API_KEY`, `GOOGLE_SHEET_ID`, `GOOGLE_CAL_DEFAULT_ID`, `GOOGLE_CAL_SHARED_ID`, `EMAIL_GUIMAIL`, `FLIGHTAWARE_AEROAPI_KEY`
- Splitwise person registry: `SPLITWISE_ID_<NAME>=<user_id>` (e.g. `SPLITWISE_ID_GUI`, `SPLITWISE_ID_GEORGIA`); add one per person to enable splitting with them by name
- Set in the Firebase Console (no `.env` file); available at cold start via `process.env.*`.

**Tool handlers** (each in `functions/tools/`, assembled into `toolHandlers` in `index.js`):
- `add_to_calendar` — creates events via the Google Calendar API (`googleCalendar.js`); routes to either `GOOGLE_CAL_DEFAULT_ID` or `GOOGLE_CAL_SHARED_ID` based on the `calendar` arg ("default"/"shared"); timed events use `transparency: "opaque"` (busy), all-day events use `transparency: "transparent"` (free); all-day is detected by the absence of `T` in the `start` string; for flight events, accepts an optional `flight_number` (IATA code) and calls the FlightAware AeroAPI (`GET /flights/{ident}`) to resolve the ICAO code and embed a `Track flight: https://www.flightaware.com/live/flight/<ICAO>` link in the event description (best-effort: failures are captured in Sentry but do not block event creation); returns `toolResult.link` as `{url, label}` for a clickable "View in Google Calendar" link
- `summarize_email` — returns the summary text
- `add_to_budget` — writes to a Google Sheet via `googleSheets.js`; also creates a Splitwise expense automatically if the issuer is Capital One
- `add_to_splitwise` — creates a Splitwise expense via `splitwiseClient` (pre-configured with retry logic); accepts optional `split_with` (array of person names) and `paid_by` (name of payer, defaults to Gui via `SPLITWISE_ID_GUI`); resolves names to Splitwise user IDs via `getPersonRegistry()`; splits equally among all participants; returns `toolResult.link` as `{url, label}` for a clickable "View in Splitwise" link using the expense ID from the API response

All tools with data extraction include a `confidence` field; handlers reject calls below 0.5. Tool handlers return `{ type, text, link?, confidence? }` where `text` is the main action sentence(s) only (paragraphs separated by `\n\n`), `link` is `{url, label}` when applicable, and `confidence` is an integer percentage. `index.js` assembles these into both `text` and `html` reply parts in a consistent order: main text → link → confidence → sign-off.

**Utilities** (each in `functions/utils/`):
- `axiosClient.js` — `createRetryClient(config)`: shared axios+retry factory (2 retries, exponential backoff, network/5xx); used by `splitwise.js` and `flightaware.js`
- `googleAuth.js` — `KEY_FILE`, `GOOGLE_RETRY_CONFIG`, `getGoogleAuth(scopes)`: shared Google service account auth; used by `googleCalendar.js` and `googleSheets.js`
- `splitwise.js` — axios client, `checkSplitwiseError`, `getPersonRegistry`, `splitEqual`, `createSharedExpense`, `createExpenseWithGeorgia`
- `flightaware.js` — axios client, `getFlightAwareUrl`
- `googleCalendar.js` — Promise-cached Google Calendar client (`getCalendarClient`)
- `googleSheets.js` — Promise-cached Google Sheets client (`getSheetsClient`)
- `langfuse.js` — eagerly initialized Langfuse client (always used per request), `getPrompt(name)`

**Reply threading**: the reply sets `In-Reply-To` and `References` headers using the original `messageID` and `references` query params.

**Prompt management**: `functions/prompt.md` is the system prompt that is pushed to Langfuse manually and excluded from regular commits. Always perform changes to the system prompt, but never consider it in the commit message.

**HTTP status code contract**: the function returns `502` for retryable errors (Gemini, Langfuse, Sheets API) and `500` for deterministic/post-write errors; the worker retries on `> 500` only.

**Sentry:** Errors logged to the `guimail` project (`GUIMAIL-*` issue IDs).

## Code Style

- Max line length: 80 characters (enforced by ESLint Google style config, `functions/` only).
