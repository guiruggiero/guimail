// Imports
import {readFileSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import os from "node:os";
import {spawnSync} from "node:child_process";
import {getPrompt, createPromptVersion} from "../utils/langfuse.js";

// ESM path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPT_FILE = path.join(__dirname, "..", "prompt.md");

// Pull: download production prompt from Langfuse and write to prompt.md
const pull = async () => {
  // Read current local content before overwriting
  let localContent = null;
  try {
    localContent = readFileSync(PROMPT_FILE, "utf-8");
  } catch {
    // File doesn't exist yet, skip diff
  }

  const {prompt, version} = await getPrompt("Guimail");

  // Show diff between local and production
  if (localContent !== null) {
    const tmpOld = path.join(os.tmpdir(), "promptOld.md");
    const tmpNew = path.join(os.tmpdir(), "promptNew.md");
    writeFileSync(tmpOld, localContent);
    writeFileSync(tmpNew, prompt);
    const result = spawnSync("diff", ["-u", tmpOld, tmpNew], {
      stdio: "inherit",
    });
    if (result.status === 0) console.log("(no changes)");
  }

  writeFileSync(PROMPT_FILE, prompt);
  console.log(`Pulled version ${version} to prompt.md`);
};

// Push: upload prompt.md to Langfuse as a new version (not production)
const push = async () => {
  const content = readFileSync(PROMPT_FILE, "utf-8");
  const version = await createPromptVersion("Guimail", content);
  console.log(`Pushed prompt.md as version ${version} (not production)`);
};

// Run based on command-line argument
const command = process.argv[2];
if (command === "pull") await pull();
else if (command === "push") await push();
else console.error("Usage: node scripts/prompt.js pull|push");
