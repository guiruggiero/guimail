# Google Tasks API exploration - setup steps

One-time setup to get OAuth2 working for Google Tasks, then how to use
`tests/tasks.js` to explore the real API. Do these in order.

## 1. Enable the Tasks API

In the same GCP project as the existing service account (used for Calendar/Sheets):

1. Go to [APIs & Services > Library](https://console.cloud.google.com/apis/library)
2. Search for "Google Tasks API"
3. Click **Enable**

## 2. Create an OAuth 2.0 Client ID

Personal Google Tasks lists have no sharing mechanism (unlike Calendar events
or Sheets/Drive files), so the service account can't be granted access.
Instead, this needs OAuth2 consent from your own account.

1. Go to [APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create Credentials > OAuth client ID**
3. Application type: **Desktop app**
4. Name it something like "Guimail CLI"
5. Save the **Client ID** and **Client Secret** shown after creation

## 3. Publish the OAuth consent screen

1. Go to [APIs & Services > OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
2. If the publish status is **Testing**, click **Publish App** to move it to
   **In production**
   - This matters: refresh tokens issued while in "Testing" status expire
     after 7 days. "In production" tokens don't expire on a fixed schedule.
   - You do not need Google's verification review for personal, single-user
     use with a non-restricted scope like `tasks` - you'll just see an
     "unverified app" warning during consent (expected, click through it).

## 4. Add client credentials to `functions/.env`

```
GOOGLE_OAUTH_CLIENT_ID=<client ID from step 2>
GOOGLE_OAUTH_CLIENT_SECRET=<client secret from step 2>
```

These are generic (not Tasks-specific) - `scripts/getGoogleOAuthToken.js` can
reuse them to get a refresh token for any Google API scope.

## 5. Get a Tasks refresh token

From `functions/`, run:

```
node --env-file=.env scripts/getGoogleOAuthToken.js https://www.googleapis.com/auth/tasks
```

1. Open the printed URL in any browser, sign in as
   `guilherme.ruggiero@gmail.com`, and approve access
2. Google redirects to a `localhost` URL that fails to load - that's
   expected. Copy the `code` value (or the whole URL) from the browser's
   address bar
3. Paste it back into the terminal prompt
4. Copy the printed refresh token into `functions/.env` as:

```
GOOGLE_TASKS_REFRESH_TOKEN=<printed refresh token>
```

This is meant to be one-off - as long as the consent screen is "In
production" (step 3), this token keeps working indefinitely without
repeating this flow.

## 6. Find a task list ID

From the repo root, run:

```
node --env-file=functions/.env tests/tasks.js
```

with the `listTaskLists();` call at the bottom of `tests/tasks.js`
uncommented. This logs every task list on the account with its `id` and
`title` - copy the `id` of the list you want to use for testing.

## 7. Create a test task

Uncomment the `insertTask(...)` call at the bottom of `tests/tasks.js`,
filling in the task list ID from step 6, then re-run the script. Check the
Google Tasks app to confirm the task appeared with the expected title,
notes, and due date.

## 8. Check the due-date-with-time behavior

Uncomment the `insertTaskWithTime(...)` call and re-run. Compare the logged
response's `due` field to the timestamp sent - this confirms whether the
time-of-day is silently discarded, as documented by Google.
