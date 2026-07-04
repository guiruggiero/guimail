// Imports
import {google} from "googleapis";
import {createInterface} from "node:readline/promises";

// One-off OAuth2 flow to obtain a refresh token for any Google API scope.
// Not deployed with the function; run locally, e.g.:
//   node --env-file=.env scripts/getGoogleOAuthToken.js https://www.googleapis.com/auth/tasks
const REDIRECT_URI = "http://localhost";

const scope = process.argv[2];
if (!scope) {
  console.error("Usage: node scripts/getGoogleOAuthToken.js <scope>");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_OAUTH_CLIENT_ID,
  process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  REDIRECT_URI,
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [scope],
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

console.log(`\nRefresh token for scope "${scope}":\n`);
console.log(tokens.refresh_token);
