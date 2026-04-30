# functions/CLAUDE.md

Firebase Cloud Function (`functions/index.js`). Single exported function `guimail`.

## Pipeline

1. Authenticates the request via `Authorization: Bearer <WORKER_SECRET>` header
2. Parses the raw email body with **PostalMime** (prefers text over HTML)
3. Extracts `sessionId` from a `[guimail-session:<id>]` marker embedded in the body (Gmail strips custom headers on reply, so the marker travels in the body instead)
4. If `sessionId` is present, short-circuits to `askClaudeCode` directly (strips Gmail reply/forward separators from the body first, skips steps 5–6)
5. Fetches the system prompt from **Langfuse** (prompt named `"Guimail"`)
6. Calls **Gemini** (`gemini-flash-latest`, `thinkingLevel: "high"`) with forced tool use (`FunctionCallingConfigMode.ANY`)
7. Executes the chosen tool handler, then sends back the raw RFC 2822 reply message

**Function timeout**: 420s (7 minutes) to accommodate `askClaudeCode`, which uses a 185s per-attempt axios timeout with 1 retry.

## Tool handlers

Each in `functions/tools/`, assembled into `toolHandlers` in `index.js`.

- `addToCalendar` — creates events via the Google Calendar API; routes to `GOOGLE_CAL_DEFAULT_ID` or `GOOGLE_CAL_SHARED_ID` based on the `calendar` arg ("default"/"shared"); timed events use `transparency: "opaque"` (busy), all-day events use `transparency: "transparent"` (free); all-day detected by absence of `T` in the `start` string; accepts optional `flightNumber` (IATA) and calls FlightAware AeroAPI to embed a tracking link (best-effort, failures captured in Sentry); returns `toolResult.link` as `{url, label}` for a "View in Google Calendar" link
- `summarizeEmail` — returns the summary text
- `addToBudget` — writes to a Google Sheet via `googleSheets.js`; also creates a Splitwise expense automatically if the issuer is Capital One; returns `toolResult.link` as `{url, label}` for a "View Budget Spreadsheet" link
- `addToSplitwise` — creates a Splitwise expense via `createSoloExpense` or `createSharedExpense`; accepts optional `splitWith` (array of friend names) and `paidBy` (name of payer, defaults to Gui via `SPLITWISE_ID_GUI`); resolves names via `getFriendRegistry()`; falls back to a solo expense with a note if any name can't be resolved; returns `toolResult.link` as `{url, label}` for a "View in Splitwise" link
- `askClaudeCode` — forwards a coding task to the Claude Code Gateway (`claudeCode.js`); Gemini extracts `typedInstruction` (verbatim, up to the forwarded message separator) and optional `forwardedContent` (HTML-stripped forwarded body); on a fresh session assembles both into a full prompt, on a resume only sends `typedInstruction`; throws on empty result; returns `text` (markdown stripped via `remove-markdown`), `html` (rendered via `marked`), and `sessionId`

**Tool return shape**: `{ type, text, html?, link?, confidence?, sessionId? }`. All data-extraction tools include `confidence`; handlers reject calls below 0.5. `index.js` assembles replies in order: main text → link → confidence → sign-off → session marker; uses `toolResult.html` directly for the HTML part when provided. When `toolResult.sessionId` is present, appends `[guimail-session:<id>]` as plain text and a hidden `<span>` in HTML.

**Adding a new tool**: create `functions/tools/<name>.js` with `definition` and `handler` exports, then add both to `functionDeclarations` and `toolHandlers` in `index.js`.

## Utilities

Each in `functions/utils/`.

- `axiosClient.js` — `createRetryClient(config, retries = 2)`: shared axios+retry factory (exponential backoff, network/5xx)
- `claudeCode.js` — axios client for the Claude Code Gateway (185s timeout, 1 retry), `runPrompt(prompt, sessionId?, resumePrompt?)`
- `googleAuth.js` — `KEY_FILE`, `GOOGLE_RETRY_CONFIG`, `getGoogleAuth(scopes)`: shared Google service account auth
- `splitwise.js` — `getFriendRegistry`, `createSoloExpense`, `createSharedExpense`, `createExpenseWithGeorgia`; `checkSplitwiseError` and `splitEqual` are internal helpers
- `flightAware.js` — axios client, `getFlightAwareUrl`
- `googleCalendar.js` — Promise-cached Google Calendar client (`getCalendarClient`)
- `googleSheets.js` — Promise-cached Google Sheets client (`getSheetsClient`)
- `langfuse.js` — eagerly initialized Langfuse client, `getPrompt(name)`

## Required env vars

`GEMINI_API_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, `SENTRY_DSN`, `WORKER_SECRET`, `SPLITWISE_API_KEY`, `GOOGLE_SHEET_ID`, `GOOGLE_CAL_DEFAULT_ID`, `GOOGLE_CAL_SHARED_ID`, `EMAIL_GUIMAIL`, `FLIGHTAWARE_AEROAPI_KEY`, `CLAUDE_CODE_GATEWAY_URL`, `CLAUDE_CODE_GATEWAY_SECRET`

- `SPLITWISE_FRIENDS` — minified JSON array of `{id, name, nickname}`; source of truth is `functions/scripts/friends.json` (gitignored); run `npm run friends` to update `.env`; names are indexed by first name, full name, and each nickname token (split on spaces); `SPLITWISE_ID_GUI` and `SPLITWISE_ID_GEORGIA` remain as separate env vars
- All env vars kept in `functions/.env` (gitignored), picked up automatically by Firebase CLI on deploy

## Prompt management

`functions/prompt.md` is the local copy of the system prompt (gitignored). The live prompt is on Langfuse; `prompt.md` exists so Claude Code always has the full prompt in context. Use `npm run prompt-pull` / `npm run prompt-push` to sync. Always apply changes to the system prompt, let the user know, and offer to push to Langfuse; but never mention it in the commit message.

## Local scripts

`functions/scripts/` — not deployed with the function. `prompt.js` (Langfuse pull/push), `friends.json` (friends registry source of truth), `friends.js` (syncs to `.env`).
