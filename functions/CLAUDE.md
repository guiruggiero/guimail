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

**Function timeout**: 420s (7 minutes) to accommodate `askClaudeCode`, which uses a 185s per-attempt axios timeout with 1 retry (excluding 504).

## Tool handlers

Each in `functions/tools/`, assembled into `toolHandlers` in `index.js`.

- `addToCalendar` — resolves an optional `flightNumber` (IATA) via Guiddleware's `/flightaware/track` first (best-effort, failures captured in Sentry), composes the description (embedding the tracking link if found), then calls Guiddleware's `POST /calendar/events`; accepts optional `reminders` (array of `{method: "email"|"popup", minutes}`, clamped to 5 entries and 0–40320 minutes) and `isSpecialProject` boolean (colors the event Basil); returns `toolResult.link` as `{url, label}` for a "View in Google Calendar" link
- `summarizeEmail` — returns the summary text
- `addToBudget` — writes to a Google Sheet via `googleSheets.js`; also creates a Splitwise expense automatically (via Guiddleware) if the issuer is Capital One; returns `toolResult.link` as `{url, label}` for a "View Budget Spreadsheet" link
- `addToSplitwise` — calls Guiddleware's `POST /splitwise/expenses`, which owns all resolution and fallback logic (friend-name lookup, uneven-split validation, solo-expense fallback); this handler only formats the reply text based on the response (`expense`, `fallback`, `issues`, `unknownNames`); accepts optional `splitWith` (array of friend names) for an equal split, or `owedAmounts` (array of `{name, owed}`) for an uneven split — still a single payer either way, from `paidBy` (defaults to Gui); the two are mutually exclusive, `owedAmounts` takes precedence if both are somehow present; also accepts optional `date` and a free-form `currency`; returns `toolResult.link` as `{url, label}` for a "View in Splitwise" link
- `addToTasks` — calls Guiddleware's `POST /tasks` to create a Google Task; accepts optional `notes` and `due` (date-only, `YYYY-MM-DD` — Google Tasks has no time-of-day granularity); used instead of `addToCalendar` for open-ended action items with no specific date/time to attend
- `askClaudeCode` — forwards a coding task to the Claude Code Gateway (`claudeCode.js`, now in the separate `guiddleware` repo's `claude-code/`); Gemini extracts `typedInstruction` (verbatim, up to the forwarded message separator) and optional `forwardedContent` (HTML-stripped forwarded body); on a fresh session assembles both into a full prompt, on a resume only sends `typedInstruction`; throws on empty result; returns `text` (markdown stripped via `remove-markdown`), `html` (rendered via `marked`), and `sessionId`

**Tool return shape**: `{ type, text, html?, link?, confidence?, sessionId? }`. All data-extraction tools include `confidence`; handlers reject calls below 0.5. `index.js` assembles replies in order: main text → link → confidence → sign-off → session marker; uses `toolResult.html` directly for the HTML part when provided. When `toolResult.sessionId` is present, appends `[guimail-session:<id>]` as plain text and a hidden `<span>` in HTML.

**Adding a new tool**: create `functions/tools/<name>.js` with `definition` and `handler` exports, then add both to `functionDeclarations` and `toolHandlers` in `index.js`.

## Utilities

Each in `functions/utils/`.

- `axiosClient.js` — `createRetryClient(config, retries = 2, retryCondition?)`: shared axios+retry factory (exponential backoff, network/5xx by default)
- `claudeCode.js` — axios client for the Claude Code Gateway (185s timeout, 1 retry excluding 504), `runPrompt(prompt, sessionId?, resumePrompt?)`
- `guiddleware.js` — axios client for the shared Guiddleware service: `createExpense(payload)` (Splitwise), `createCalendarEvent(payload)`, `getFlightAwareUrl(flightNumber)`, `createTask(payload)`
- `googleAuth.js` — `KEY_FILE`, `GOOGLE_RETRY_CONFIG`, `getGoogleAuth(scopes)`: shared Google service account auth, used only by `googleSheets.js` now (Calendar auth moved to Guiddleware)
- `googleSheets.js` — Promise-cached Google Sheets client (`getSheetsClient`), for the budget spreadsheet
- `langfuse.js` — eagerly initialized Langfuse client, `getPrompt(name)`

Splitwise, Google Calendar, and FlightAware clients used to live here too — they moved to the shared `guiddleware` repo since GuiDo and Guiwise need the same integrations; see `guiddleware.js` above and `guiddleware`'s own `functions/CLAUDE.md`.

## Required env vars

`GEMINI_API_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, `SENTRY_DSN`, `WORKER_SECRET`, `GOOGLE_SHEET_ID`, `EMAIL_GUIMAIL`, `GUIDDLEWARE_URL`, `GUIDDLEWARE_SECRET_GUIMAIL`, `CLAUDE_CODE_GATEWAY_URL`, `CLAUDE_CODE_GATEWAY_SECRET_GUIMAIL`

All env vars kept in `functions/.env` (gitignored), picked up automatically by Firebase CLI on deploy.

## Prompt management

`functions/prompt.md` is the local copy of the system prompt (gitignored). The live prompt is on Langfuse; `prompt.md` exists so Claude Code always has the full prompt in context. Use `npm run prompt-pull` / `npm run prompt-push` to sync. Always apply changes to the system prompt, let the user know, and offer to push to Langfuse; but never mention it in the commit message.

## Local scripts

`functions/scripts/` — not deployed with the function. `promptSync.js` (Langfuse pull/push) only; the Splitwise friend-registry sync (`friends.js`/`friends.json`) moved to `guiddleware`'s `functions/scripts/`, since the friend registry lives there now.
