# worker/CLAUDE.md

Cloudflare Email Worker (`worker/src/index.js`). Receives emails via Cloudflare Email Routing.

## Pipeline

1. Validates sender against allowlist (built lazily from env vars, not available at module scope; rejects with `setReject`)
2. Enforces 5MB size limit (rejects oversized emails)
3. Extracts `subject`, `messageID`, `references`, and `X-Guimail-Session` headers from the raw message
4. POSTs the raw email body (octet stream) to the Firebase Cloud Function with `WORKER_SECRET` auth and metadata as query params (includes `sessionId` from `X-Guimail-Session` if present)
5. Sends the raw RFC 2822 reply from the function back to the sender via `message.reply()`

## Required env vars

`SENTRY_DSN`, `WORKER_SECRET`, `EMAIL_GUIMAIL`, `EMAIL_GUI`, `EMAIL_GUI_AUTO_FWD`, `EMAIL_UM` — set as Cloudflare Worker secrets via `npx wrangler secret put <SECRET_NAME>`.
