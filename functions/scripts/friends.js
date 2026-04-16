// Imports
import {readFileSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

// ESM path resolution
const __dirname = dirname(fileURLToPath(import.meta.url));
const friendsPath = join(__dirname, "friends.json");
const envPath = join(__dirname, "..", ".env");

// Read and minify friends JSON
const friends = JSON.parse(readFileSync(friendsPath, "utf8"));
const line = `SPLITWISE_FRIENDS="${JSON.stringify(friends)}"`;

// Update existing entry or append if missing
const env = readFileSync(envPath, "utf8");
const updated = env.includes("SPLITWISE_FRIENDS=") ?
  env.replace(/^SPLITWISE_FRIENDS=.*/m, line) :
  env.trimEnd() + `\n${line}`;

writeFileSync(envPath, updated);
console.log("SPLITWISE_FRIENDS updated in .env");
