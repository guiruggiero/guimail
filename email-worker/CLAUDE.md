# email-worker/CLAUDE.md

Cloudflare Email Worker (`email-worker/src/index.js`), deployed as the `guimail` Worker (name set in `wrangler.jsonc`, unrelated to the folder name). Receives emails via Cloudflare Email Routing.

`workers_dev` and `preview_urls` are both `false` — there's no `*.workers.dev` URL and no HTTP endpoint to curl. The only trigger is an inbound email, so testing means actually sending one.

## Pipeline

1. Validates sender against allowlist (rejects with `setReject`)
2. Enforces 5MB size limit (rejects oversized emails)
3. Extracts `subject`, `messageID`, and `references` headers from the raw message
4. POSTs the raw email body (octet stream) to the Firebase Cloud Function with `WORKER_SECRET` auth and metadata as query params
5. Sends the raw RFC 2822 reply from the function back to the sender via `message.reply()`

## Gotchas

- **Log breadcrumbs are numbered across both deployables.** The worker emits `[1]`–`[3]`, then `[10]`–`[11]`; `agent/index.js` fills `[4]`–`[9]`. Renumbering either side silently breaks the end-to-end trace — change both together
- **The 430s axios timeout is pinned to the function's 420s.** `timeout: 430000` is deliberately just over `agent/index.js`'s `timeoutSeconds: 420`, so the worker never gives up before the function does. `shouldResetTimeout: true` gives each attempt a fresh window, so with 1 retry the real worst case is ~2 × 430s, not 430s total
- **`fetchOptions: {cache: "no-store"}` depends on `wrangler.jsonc`.** The Worker runtime doesn't support axios's default cache mode; the `cache_option_enabled` entry in `compatibility_flags` is what makes the option legal. The two files have to change together
- **The Cloud Function URL is hardcoded** in `src/index.js` (`cloudFunctionURL`), not a Worker secret — the one piece of config that doesn't come from `env`
- **`allowedSenders` is cached at module scope**, built lazily on first invocation (env isn't available at module scope), lowercased for case-insensitive matching, with `.filter(Boolean)` dropping unset vars. It persists across invocations in the same isolate, so adding or changing a sender needs a redeploy, not just a secret update
- **`setReject` is the user-facing error channel.** All four failure paths (sender not allowed, email too large, function call failed, reply construction failed) reject with a plain-language string the sender actually reads; Sentry gets the detail. Reword those with care
- **Sentry is privacy-hardened on purpose.** Every `dataCollection` flag is `false` (`userInfo`, `cookies`, `urlQueryParams`, `genAI` inputs/outputs, `databaseQueryData`) because the payload is somebody's email. `enableLogs: true` and `tracesSampleRate: 1.0` are what make the numbered breadcrumbs above show up — don't trade those away to quiet the volume

## Required env vars

`SENTRY_DSN`, `WORKER_SECRET`, `EMAIL_GUIMAIL`, `EMAIL_GUI`, `EMAIL_GUI_AUTO_FWD`, `EMAIL_UM` — set as Cloudflare Worker secrets via `npx wrangler secret put <SECRET_NAME>`.

`EMAIL_GUIMAIL` is the `From` on the reply; `EMAIL_GUI`, `EMAIL_GUI_AUTO_FWD`, and `EMAIL_UM` are the allowlist entries.
