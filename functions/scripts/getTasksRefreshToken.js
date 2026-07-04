// Imports
import {google} from "googleapis";
import {createInterface} from "node:readline/promises";

// One-off OAuth2 flow to obtain a Google Tasks refresh token.
// Not deployed with the function; run locally with `npm run tasks-token`.
const REDIRECT_URI = "http://localhost";
const SCOPES = ["https://www.googleapis.com/auth/tasks"];

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_TASKS_CLIENT_ID,
  process.env.GOOGLE_TASKS_CLIENT_SECRET,
  REDIRECT_URI,
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: SCOPES,
});

console.log("1. Open this URL, sign in, and approve access:\n");
console.log(authUrl);
console.log(
  "\n2. Google will redirect to a localhost URL that fails to load" +
    " - that's expected. Copy the \"code\" value (or the whole URL) from" +
    " the browser's address bar and paste it below.\n",
);

const rl = createInterface({input: process.stdin, output: process.stdout});
const pasted = (await rl.question("Paste code or redirect URL: ")).trim();
rl.close();

// Accept either a bare code or a full redirect URL containing ?code=...
const code = pasted.includes("code=") ?
  new URL(pasted).searchParams.get("code") :
  pasted;

const {tokens} = await oauth2Client.getToken(code);

if (!tokens.refresh_token) {
  console.error(
    "\nNo refresh_token returned. If you've authorized this app before," +
      " revoke access at https://myaccount.google.com/permissions and" +
      " run this script again.",
  );
  process.exit(1);
}

console.log("\nAdd this to functions/.env:\n");
console.log(`GOOGLE_TASKS_REFRESH_TOKEN=${tokens.refresh_token}`);
